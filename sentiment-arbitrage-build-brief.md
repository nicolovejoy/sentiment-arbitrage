# Sentiment Arbitrage — Build Brief for Claude Code

## What We're Building

A market sentiment tracker for Ryan. Two separate pieces:

1. **Worker** — Python script on Railway that runs 3x/day, pulls Reddit posts and stock prices, scores sentiment with FinBERT, writes to Firestore
2. **Dashboard** — Next.js app on Vercel at `ryan.ibuild4you.com` that reads from Firestore and displays the sentiment score, trend chart, and driving posts

Ryan is one user. No auth, no login. The URL is the access control.

---

## Repo 1: `sentiment-worker`

### What it does

Runs 3x/day on a cron schedule (e.g. 9am, 1pm, 6pm ET). Each run:

1. Pulls the ~100 hottest posts from r/investing, r/stocks, r/wallstreetbets via Reddit API (PRAW)
2. Runs each post title (and self-text if present) through FinBERT for sentiment classification (positive/negative/neutral with probabilities)
3. Computes an aggregate fear/greed score: `(avg_positive - avg_negative)` scaled to 0-100 where 0 = extreme fear, 50 = neutral, 100 = extreme greed
4. Pulls daily close prices for SPY and RSP from Finnhub
5. Writes to Firestore:
   - `sentiment_scores` collection: `{ timestamp, score, post_count, avg_positive, avg_negative, avg_neutral }`
   - `sentiment_posts` collection: `{ timestamp, subreddit, title, selftext_preview, url, reddit_score, sentiment_label, sentiment_positive, sentiment_negative, sentiment_neutral }`
   - `price_snapshots` collection: `{ timestamp, ticker, close_price }`

### Stack

- Python 3.11+
- `praw` — Reddit API wrapper
- `transformers` + `torch` — for FinBERT inference (`ProsusAI/finbert` from Hugging Face)
- `finnhub-python` — Finnhub API client
- `firebase-admin` — Firestore writes
- Deployed on Railway with cron scheduling

### Environment variables

```
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_USER_AGENT        # e.g. "sentiment-tracker:v1 (by u/yourusername)"
FINNHUB_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_JSON   # Firebase service account JSON (as string, not file path — Railway doesn't do files well)
FIRESTORE_PROJECT_ID     # ibuild4you-a0c4d
```

### Key implementation notes

- Reddit free tier: 60-100 requests/minute, non-commercial, OAuth required. Register an app at reddit.com/prefs/apps (type: "script"). PRAW handles OAuth automatically.
- FinBERT: use `ProsusAI/finbert` from Hugging Face Hub. Pre-trained, no fine-tuning needed. Load once per run, classify in batches. ~5 lines of inference code:
  ```python
  from transformers import BertTokenizer, BertForSequenceClassification, pipeline
  finbert = BertForSequenceClassification.from_pretrained('ProsusAI/finbert')
  tokenizer = BertTokenizer.from_pretrained('ProsusAI/finbert')
  nlp = pipeline("sentiment-analysis", model=finbert, tokenizer=tokenizer)
  results = nlp(list_of_texts)
  ```
- Finnhub free tier: 60 requests/minute. We only need 2 per run (SPY + RSP quotes). Trivial.
- Firestore: use the same Firebase project as iBuild4you (`ibuild4you-a0c4d`). Prefix all collections with `sentiment_`. The service account JSON should be stored as a Railway env var (single string), parsed at runtime.
- The model download (~400MB) happens on first run. Railway containers persist between deploys so this only happens once. If cold starts are slow, consider caching the model in the Docker image.
- Keep each run idempotent — if it fails halfway, re-running should be safe (use timestamp-based document IDs or check for existing docs before writing).

### Cron schedule

Railway supports cron via `railway.json`:
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "cronSchedule": "0 9,13,18 * * 1-5",
    "restartPolicyType": "NEVER"
  }
}
```
This runs at 9am, 1pm, 6pm UTC Monday-Friday. Adjust for ET if needed. The `NEVER` restart policy means it runs once and stops (doesn't loop).

### Error handling

- If Reddit API fails: log error, skip this run, don't write partial data
- If FinBERT fails on a specific post: skip that post, continue with the rest
- If Finnhub fails: write sentiment data anyway, leave price fields null
- If Firestore write fails: log error, retry once, then give up — data will be picked up next run

---

## Repo 2: `sentiment-dashboard`

### What it does

A single-page Next.js app at `ryan.ibuild4you.com` that displays:

1. **Fear/Greed Score** — large number or gauge (0-100), color-coded red→yellow→green
2. **Context line** — plain-English one-liner like "Market sentiment is moderately fearful — down from neutral yesterday"
3. **Trend chart** — 7-day line chart with sentiment score on left axis, SPY + RSP closing prices on right axis (dual Y-axis). Use Recharts.
4. **Driving posts — Bearish** — top 5 most negative posts from latest pull (subreddit, title, sentiment score, link to Reddit)
5. **Driving posts — Bullish** — top 5 most positive posts from latest pull (same format)
6. **Footer** — data sources, update frequency, "This is a research tool — not financial advice"
7. **Last updated timestamp** — when the worker last ran successfully

### Stack

- Next.js App Router on Vercel
- Firestore reads via Firebase Admin SDK in API routes (same pattern as iBuild4you)
- Recharts for the trend chart
- Tailwind CSS for styling
- No auth, no login, no state management needed — it's a read-only dashboard

### Data fetching

All data comes from Firestore. Two approaches:

**Option A (simpler):** Server components that read directly from Firestore at render time. Page revalidates every ~30 minutes (ISR). No API routes needed.

**Option B (more flexible):** API routes that read from Firestore, client components that fetch on mount. Better if Ryan wants a "refresh" button or real-time updates later.

Start with Option A. It's a read-only dashboard — SSR + ISR is the right fit.

### Deployment

- Vercel project linked to the `sentiment-dashboard` GitHub repo
- Custom domain: `ryan.ibuild4you.com` — add as a subdomain in Vercel project settings, then add a CNAME record in DNS (wherever ibuild4you.com is registered) pointing `ryan` to `cname.vercel-dns.com`
- Same Firebase project (`ibuild4you-a0c4d`) — env vars in Vercel:
  ```
  GOOGLE_APPLICATION_CREDENTIALS_JSON
  FIRESTORE_PROJECT_ID
  ```

### Design notes

- Keep it simple and clean. Dark background with light text works well for financial dashboards but not required — Ryan hasn't expressed a preference.
- The fear/greed gauge is the hero element. Make it big and obvious.
- The context line should be generated from the data, not hardcoded. Simple logic: compare current score to yesterday's, describe the direction and magnitude in plain English.
- Trend chart: sentiment line should be visually dominant (thicker, brighter color). Price lines are secondary (thinner, muted). Dual Y-axis so the scales don't fight each other.
- Posts should link to the original Reddit thread.
- Mobile-friendly — Ryan might check this on his phone.

---

## Build Order

1. **Set up Firestore collections** — create `sentiment_scores`, `sentiment_posts`, `price_snapshots` in the existing Firebase project. No schema enforcement needed (Firestore is schemaless), but document the expected fields.

2. **Build and deploy the worker** — get it running on Railway, verify it pulls data and writes to Firestore correctly. Run it manually a few times to seed data.

3. **Let the worker run for 2-3 days** — so there's trend data when Ryan first opens the dashboard.

4. **Build and deploy the dashboard** — connect to Firestore, render the data, deploy to Vercel.

5. **Set up the subdomain** — CNAME `ryan.ibuild4you.com` → Vercel.

6. **Send Ryan the link.**

---

## What's NOT in this build

- No login or auth (URL is the access control)
- No predictions or pattern detection
- No sector or individual stock sentiment
- No swing voter tracking
- No alerts or notifications
- No historical back-testing
- No admin panel or config UI

All of the above are phase 2+ ideas, documented in Ryan's brief. Build what's specced here and nothing more.

---

## Cost estimate

- Railway: ~$5-10/month for the Python worker (runs briefly 3x/day weekdays)
- Vercel: free tier (low traffic, one user)
- Firestore: free tier (well under the 50K reads/day and 20K writes/day limits)
- Reddit API: free tier (non-commercial, well under rate limits)
- Finnhub API: free tier (2 requests per run, 60/minute limit)
- FinBERT model: free (open source, Hugging Face)

Total: **~$5-10/month**
