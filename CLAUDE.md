# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Market sentiment tracker for a single user (Ryan). Two separate pieces sharing a Firestore database:

1. **sentiment-worker** — Python cron job on Railway, runs 3x/day (9am, 1pm, 6pm UTC weekdays). Pulls Reddit posts, scores with FinBERT, fetches SPY/RSP prices, writes to Firestore.
2. **sentiment-dashboard** — Next.js App Router on Vercel at `ryan.ibuild4you.com`. Read-only dashboard showing fear/greed score, trend chart, and driving posts. SSR + ISR (revalidate ~30min), no auth.

## Architecture

```
Reddit API (PRAW) ──┐
                    ├── sentiment-worker (Python/Railway) ──► Firestore (sentiment-arbitrage)
Finnhub API ────────┘                                              │
                                                                   ▼
                                              sentiment-dashboard (Next.js/Vercel)
                                                       │
                                                       ▼
                                              ryan.ibuild4you.com
```

## Firestore Collections

Dedicated Firebase project (not shared with iBuild4you):

- `sentiment_scores` — `{ timestamp, score, post_count, avg_positive, avg_negative, avg_neutral }`
- `sentiment_posts` — `{ timestamp, subreddit, title, selftext_preview, url, reddit_score, sentiment_label, sentiment_positive, sentiment_negative, sentiment_neutral }`
- `price_snapshots` — `{ timestamp, ticker, close_price }`

## Worker (Python)

- Python 3.11+, deployed on Railway with cron (`0 9,13,18 * * 1-5`)
- `praw` for Reddit (r/investing, r/stocks, r/wallstreetbets — ~100 hottest posts)
- `transformers` + `torch` with `ProsusAI/finbert` for sentiment (load once, batch classify)
- `finnhub-python` for SPY/RSP daily close prices
- `firebase-admin` for Firestore writes
- Fear/greed score: `(avg_positive - avg_negative)` scaled to 0-100
- Runs must be idempotent — use timestamp-based doc IDs or check before writing
- Service account JSON stored as env var string, parsed at runtime

Required env vars:
```
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
REDDIT_USER_AGENT
FINNHUB_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_JSON   # JSON string, not file path
FIRESTORE_PROJECT_ID
```

## Dashboard (Next.js)

- Next.js App Router, Tailwind CSS, Recharts
- Server components reading Firestore directly (Option A from brief), ISR ~30min
- Firebase Admin SDK for Firestore reads (same pattern as iBuild4you)
- Dark background, fear/greed gauge as hero element, mobile-friendly
- Dual Y-axis trend chart: sentiment (dominant) + prices (muted), 7-day window
- Context line generated from data (compare current score to yesterday)
- Top 5 bullish + top 5 bearish posts with Reddit links
- Domain: `ryan.ibuild4you.com` (CNAME to `cname.vercel-dns.com`)

Required env vars:
```
GOOGLE_APPLICATION_CREDENTIALS_JSON
FIRESTORE_PROJECT_ID
```

## Next Steps

1. Get Reddit API credentials (register script app at reddit.com/prefs/apps, add to worker/.env)
2. Get Finnhub API key (register at finnhub.io, add to worker/.env)
3. Test worker locally (`cd worker && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python main.py`)
4. Deploy worker to Railway, run a few times to seed Firestore
5. Build and deploy Next.js dashboard to Vercel

## Scope Boundaries

No auth, no predictions, no individual stock sentiment, no alerts, no admin panel, no historical back-testing. All are documented phase 2+ ideas — build only what's specced in the build brief.
