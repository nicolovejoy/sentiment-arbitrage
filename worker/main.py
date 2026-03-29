import json
import logging
import os
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen

import finnhub
import firebase_admin
from firebase_admin import credentials, firestore
from transformers import BertForSequenceClassification, BertTokenizer, pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

SUBREDDITS = ["investing", "stocks", "wallstreetbets"]
POSTS_PER_SUB = 34  # ~100 total
TICKERS = ["SPY", "RSP"]
USER_AGENT = "sentiment-tracker:v1 (research project)"


def init_firestore():
    creds_raw = os.environ["GOOGLE_APPLICATION_CREDENTIALS_JSON"].strip("'\"")
    project_id = os.environ["FIRESTORE_PROJECT_ID"]
    # Support both a file path and an inline JSON string
    if os.path.isfile(creds_raw):
        cred = credentials.Certificate(creds_raw)
    else:
        cred = credentials.Certificate(json.loads(creds_raw, strict=False))
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def fetch_posts():
    """Fetch hot posts from Reddit using public JSON endpoints (no API key needed)."""
    posts = []
    for sub_name in SUBREDDITS:
        try:
            url = f"https://www.reddit.com/r/{sub_name}/hot.json?limit={POSTS_PER_SUB}"
            req = Request(url, headers={"User-Agent": USER_AGENT})
            resp = urlopen(req, timeout=15)
            data = json.loads(resp.read())

            for child in data["data"]["children"]:
                p = child["data"]
                if p.get("stickied"):
                    continue
                text = p["title"]
                selftext_preview = ""
                if p.get("selftext"):
                    selftext_preview = p["selftext"][:500]
                    text = f"{p['title']}. {p['selftext'][:300]}"
                posts.append({
                    "subreddit": sub_name,
                    "title": p["title"],
                    "selftext_preview": selftext_preview,
                    "url": f"https://reddit.com{p['permalink']}",
                    "reddit_score": p.get("score", 0),
                    "text_for_analysis": text,
                })
            # Be polite — wait between subreddit requests
            time.sleep(2)
        except Exception:
            log.exception("Failed to fetch from r/%s", sub_name)
    log.info("Fetched %d posts from %d subreddits", len(posts), len(SUBREDDITS))
    return posts


def load_finbert():
    model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")
    tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
    return pipeline("sentiment-analysis", model=model, tokenizer=tokenizer)


def analyze_sentiment(nlp, posts):
    texts = [p["text_for_analysis"] for p in posts]
    # FinBERT has a 512 token limit; truncate long texts
    texts = [t[:512] for t in texts]

    results = nlp(texts, batch_size=16, truncation=True)

    for post, result in zip(posts, results):
        label = result["label"]  # positive, negative, or neutral
        score = result["score"]
        post["sentiment_label"] = label
        post["sentiment_positive"] = score if label == "positive" else 0.0
        post["sentiment_negative"] = score if label == "negative" else 0.0
        post["sentiment_neutral"] = score if label == "neutral" else 0.0

    return posts


def compute_aggregate(posts):
    if not posts:
        return {"score": 50, "post_count": 0, "avg_positive": 0, "avg_negative": 0, "avg_neutral": 0}

    avg_pos = sum(p["sentiment_positive"] for p in posts) / len(posts)
    avg_neg = sum(p["sentiment_negative"] for p in posts) / len(posts)
    avg_neu = sum(p["sentiment_neutral"] for p in posts) / len(posts)

    # Scale (avg_positive - avg_negative) from [-1, 1] to [0, 100]
    raw = avg_pos - avg_neg
    score = round((raw + 1) * 50, 1)
    score = max(0, min(100, score))

    return {
        "score": score,
        "post_count": len(posts),
        "avg_positive": round(avg_pos, 4),
        "avg_negative": round(avg_neg, 4),
        "avg_neutral": round(avg_neu, 4),
    }


def fetch_prices(finnhub_client):
    prices = {}
    for ticker in TICKERS:
        try:
            quote = finnhub_client.quote(ticker)
            if quote and quote.get("c"):
                prices[ticker] = quote["c"]  # current/close price
            else:
                log.warning("No price data for %s", ticker)
        except Exception:
            log.exception("Failed to fetch price for %s", ticker)
    return prices


def write_to_firestore(db, run_id, timestamp, aggregate, posts, prices):
    # Check idempotency — skip if this run already exists
    existing = db.collection("sentiment_scores").document(run_id).get()
    if existing.exists:
        log.info("Run %s already exists, skipping write", run_id)
        return

    # Write aggregate score
    db.collection("sentiment_scores").document(run_id).set({
        "timestamp": timestamp,
        "score": aggregate["score"],
        "post_count": aggregate["post_count"],
        "avg_positive": aggregate["avg_positive"],
        "avg_negative": aggregate["avg_negative"],
        "avg_neutral": aggregate["avg_neutral"],
    })
    log.info("Wrote sentiment_scores/%s (score=%.1f)", run_id, aggregate["score"])

    # Write individual posts in a batch
    batch = db.batch()
    for i, post in enumerate(posts):
        doc_ref = db.collection("sentiment_posts").document(f"{run_id}_{i:03d}")
        batch.set(doc_ref, {
            "timestamp": timestamp,
            "run_id": run_id,
            "subreddit": post["subreddit"],
            "title": post["title"],
            "selftext_preview": post["selftext_preview"],
            "url": post["url"],
            "reddit_score": post["reddit_score"],
            "sentiment_label": post["sentiment_label"],
            "sentiment_positive": post["sentiment_positive"],
            "sentiment_negative": post["sentiment_negative"],
            "sentiment_neutral": post["sentiment_neutral"],
        })
    batch.commit()
    log.info("Wrote %d sentiment_posts", len(posts))

    # Write price snapshots
    for ticker, price in prices.items():
        db.collection("price_snapshots").document(f"{run_id}_{ticker}").set({
            "timestamp": timestamp,
            "ticker": ticker,
            "close_price": price,
        })
    log.info("Wrote %d price_snapshots", len(prices))


def main():
    log.info("Starting sentiment worker run")
    now = datetime.now(timezone.utc)
    run_id = now.strftime("%Y-%m-%dT%H-%M")
    timestamp = now

    db = init_firestore()

    # Fetch Reddit posts — if this fails entirely, abort
    posts = fetch_posts()
    if not posts:
        log.error("No posts fetched, aborting run")
        return

    # Sentiment analysis
    log.info("Loading FinBERT model...")
    nlp = load_finbert()
    posts = analyze_sentiment(nlp, posts)

    # Aggregate score
    aggregate = compute_aggregate(posts)
    log.info("Aggregate score: %.1f (from %d posts)", aggregate["score"], aggregate["post_count"])

    # Fetch prices (non-blocking — write sentiment even if this fails)
    finnhub_client = finnhub.Client(api_key=os.environ["FINNHUB_API_KEY"])
    prices = fetch_prices(finnhub_client)

    # Write everything to Firestore
    try:
        write_to_firestore(db, run_id, timestamp, aggregate, posts, prices)
    except Exception:
        log.exception("Firestore write failed, retrying once...")
        time.sleep(2)
        try:
            write_to_firestore(db, run_id, timestamp, aggregate, posts, prices)
        except Exception:
            log.exception("Firestore write failed on retry, giving up")
            return

    log.info("Run %s complete", run_id)


if __name__ == "__main__":
    main()
