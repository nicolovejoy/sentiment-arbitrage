import json
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen

import finnhub
import firebase_admin
from firebase_admin import credentials, firestore
from transformers import BertForSequenceClassification, BertTokenizer, pipeline

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# WSB is the primary emotional signal; investing/stocks supplement
SUBREDDIT_LIMITS = {
    "wallstreetbets": 60,
    "stocks": 20,
    "investing": 20,
}
TICKERS = ["SPY", "RSP"]
USER_AGENT = "sentiment-tracker:v1 (research project)"

STOCKTWITS_SYMBOLS = ["SPY"]
STOCKTWITS_BASE = "https://api.stocktwits.com/api/2/streams/symbol"

# Heuristic markers of informational (vs emotional) posts. Conservative — when
# in doubt, keep. Filtered silently; Ryan never sees what was dropped.
INFORMATIONAL_PATTERNS = [
    re.compile(r"\bearnings\s*(?:report|recap|results|preview|call)\b", re.I),
    re.compile(r"\bq[1-4]\s*(?:fy)?\s*20\d\d\b", re.I),
    re.compile(r"^\s*(?:daily|weekly|monthly)\s+(?:discussion|thread|recap)", re.I),
    re.compile(r"\b(?:price\s+target|pt)\s+(?:raised|cut|to)\b", re.I),
    re.compile(r"\banalyst[s]?\s+(?:say|rate|target|cut|raise|upgrade|downgrade)", re.I),
    re.compile(r"\b(?:upgrade|downgrade)d?\s+(?:to|from)\b", re.I),
    re.compile(r"^\s*(?:reuters|bloomberg|cnbc|wsj|barron'?s|marketwatch|seeking\s*alpha)\s*[:|\-]", re.I),
    re.compile(r"\bmegathread\b", re.I),
    re.compile(r"\bguidance\s+(?:raised|cut|revised|reaffirmed)\b", re.I),
    re.compile(r"\b(?:beats|misses|tops)\s+(?:eps|revenue|estimates)\b", re.I),
    re.compile(r"\bfed\s+(?:minutes|statement|decision)\b", re.I),
    re.compile(r"\bcpi\s+(?:report|data|print|came in)\b", re.I),
]


def is_informational(title: str, selftext: str = "") -> bool:
    """Return True if the post looks like news/analysis rather than emotional content."""
    for pat in INFORMATIONAL_PATTERNS:
        if pat.search(title):
            return True
    return False


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


def fetch_reddit_posts():
    """Fetch hot posts from Reddit using public JSON endpoints (no API key needed)."""
    posts = []
    raw_count = 0
    for sub_name, limit in SUBREDDIT_LIMITS.items():
        try:
            url = f"https://www.reddit.com/r/{sub_name}/hot.json?limit={limit}"
            req = Request(url, headers={"User-Agent": USER_AGENT})
            resp = urlopen(req, timeout=15)
            data = json.loads(resp.read())

            for child in data["data"]["children"]:
                p = child["data"]
                if p.get("stickied"):
                    continue
                raw_count += 1
                title = p["title"]
                selftext_preview = p.get("selftext", "")[:500] if p.get("selftext") else ""
                if is_informational(title, selftext_preview):
                    continue
                text = title
                if p.get("selftext"):
                    text = f"{title}. {p['selftext'][:300]}"
                posts.append({
                    "source": "reddit",
                    "subreddit": sub_name,
                    "title": title,
                    "selftext_preview": selftext_preview,
                    "url": f"https://reddit.com{p['permalink']}",
                    "reddit_score": p.get("score", 0),
                    "text_for_analysis": text,
                    "presupplied_label": None,
                })
            time.sleep(2)
        except Exception:
            log.exception("Failed to fetch from r/%s", sub_name)
    log.info("Reddit: kept %d / %d posts after filter", len(posts), raw_count)
    return posts


def fetch_stocktwits():
    """Fetch recent messages from StockTwits. Posts tagged Bullish/Bearish bypass FinBERT."""
    token = os.environ.get("STOCKTWITS_TOKEN", "").strip()
    posts = []
    raw_count = 0
    for symbol in STOCKTWITS_SYMBOLS:
        url = f"{STOCKTWITS_BASE}/{symbol}.json"
        if token:
            url += f"?access_token={token}"
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            resp = urlopen(req, timeout=15)
            data = json.loads(resp.read())
            for msg in data.get("messages", []):
                raw_count += 1
                body = (msg.get("body") or "").strip()
                if not body:
                    continue
                if is_informational(body):
                    continue
                sentiment = ((msg.get("entities") or {}).get("sentiment") or {}).get("basic")
                presupplied = None
                if sentiment == "Bullish":
                    presupplied = "positive"
                elif sentiment == "Bearish":
                    presupplied = "negative"
                user_name = ((msg.get("user") or {}).get("username")) or "stocktwits"
                msg_id = msg.get("id")
                permalink = f"https://stocktwits.com/{user_name}/message/{msg_id}" if msg_id else "https://stocktwits.com"
                posts.append({
                    "source": "stocktwits",
                    "subreddit": "stocktwits",  # dashboard compat — replaced by source soon
                    "title": body[:280],
                    "selftext_preview": body[:500],
                    "url": permalink,
                    "reddit_score": (msg.get("likes") or {}).get("total", 0) if isinstance(msg.get("likes"), dict) else 0,
                    "text_for_analysis": body[:512],
                    "presupplied_label": presupplied,
                })
            time.sleep(1)
        except Exception:
            log.exception("StockTwits fetch failed for %s", symbol)
    log.info("StockTwits: kept %d / %d posts after filter", len(posts), raw_count)
    return posts


def fetch_posts():
    return fetch_reddit_posts() + fetch_stocktwits()


def load_finbert():
    model = BertForSequenceClassification.from_pretrained("ProsusAI/finbert")
    tokenizer = BertTokenizer.from_pretrained("ProsusAI/finbert")
    return pipeline("sentiment-analysis", model=model, tokenizer=tokenizer)


def analyze_sentiment(nlp, posts):
    # Posts with presupplied labels (StockTwits Bullish/Bearish) skip FinBERT
    for post in posts:
        label = post.get("presupplied_label")
        if label:
            post["sentiment_label"] = label
            post["sentiment_positive"] = 1.0 if label == "positive" else 0.0
            post["sentiment_negative"] = 1.0 if label == "negative" else 0.0
            post["sentiment_neutral"] = 0.0

    to_score = [p for p in posts if not p.get("presupplied_label")]
    if to_score:
        texts = [p["text_for_analysis"][:512] for p in to_score]
        results = nlp(texts, batch_size=16, truncation=True)
        for post, result in zip(to_score, results):
            label = result["label"]
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
            "source": post.get("source", "reddit"),
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


def compute_correlation(db, today):
    """Compute yesterday's sentiment vs today's price change and store it."""
    today_str = today.strftime("%Y-%m-%d")
    yesterday = today - timedelta(days=1)
    yesterday_str = yesterday.strftime("%Y-%m-%d")

    # Skip if already computed for today
    existing = db.collection("correlations").document(today_str).get()
    if existing.exists:
        log.info("Correlation for %s already exists, skipping", today_str)
        return

    # Get yesterday's sentiment scores (all runs that day)
    scores_snap = db.collection("sentiment_scores") \
        .where("timestamp", ">=", yesterday) \
        .where("timestamp", "<", today) \
        .get()

    if not scores_snap:
        log.info("No sentiment scores for %s, skipping correlation", yesterday_str)
        return

    avg_sentiment = sum(doc.to_dict()["score"] for doc in scores_snap) / len(scores_snap)

    # Get yesterday's and today's prices
    # Price docs are keyed like "2026-04-04T13-00_SPY"
    yesterday_prefix = yesterday.strftime("%Y-%m-%d")
    today_prefix = today.strftime("%Y-%m-%d")

    def get_latest_price(date_prefix, ticker):
        """Get the last price snapshot for a ticker on a given date."""
        docs = db.collection("price_snapshots") \
            .where("ticker", "==", ticker) \
            .where("timestamp", ">=", datetime.strptime(date_prefix, "%Y-%m-%d").replace(tzinfo=timezone.utc)) \
            .where("timestamp", "<", datetime.strptime(date_prefix, "%Y-%m-%d").replace(tzinfo=timezone.utc) + timedelta(days=1)) \
            .order_by("timestamp", direction="DESCENDING") \
            .limit(1) \
            .get()
        if docs:
            return docs[0].to_dict()["close_price"]
        return None

    spy_yesterday = get_latest_price(yesterday_prefix, "SPY")
    spy_today = get_latest_price(today_prefix, "SPY")
    rsp_yesterday = get_latest_price(yesterday_prefix, "RSP")
    rsp_today = get_latest_price(today_prefix, "RSP")

    if not all([spy_yesterday, spy_today, rsp_yesterday, rsp_today]):
        log.info("Missing price data for correlation (yesterday=%s, today=%s), skipping",
                 yesterday_str, today_str)
        return

    spy_pct = round((spy_today - spy_yesterday) / spy_yesterday * 100, 4)
    rsp_pct = round((rsp_today - rsp_yesterday) / rsp_yesterday * 100, 4)

    db.collection("correlations").document(today_str).set({
        "date": today_str,
        "sentiment_score": round(avg_sentiment, 2),
        "spy_next_day_pct": spy_pct,
        "rsp_next_day_pct": rsp_pct,
    })
    log.info("Wrote correlation for %s: sentiment=%.2f, SPY=%.4f%%, RSP=%.4f%%",
             today_str, avg_sentiment, spy_pct, rsp_pct)


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

    # Compute correlation (yesterday's sentiment vs today's price change)
    try:
        compute_correlation(db, now.replace(hour=0, minute=0, second=0, microsecond=0))
    except Exception:
        log.exception("Correlation computation failed (non-fatal)")

    log.info("Run %s complete", run_id)


if __name__ == "__main__":
    main()
