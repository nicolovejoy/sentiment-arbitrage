# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Market sentiment tracker for a single user (Ryan). Two pieces sharing a Firestore database:

1. **worker/** — Python cron job on Raspberry Pi (via systemd timer), runs 3x/day (9am, 1pm, 6pm ET weekdays). Pulls Reddit posts via public JSON endpoints, scores with FinBERT, fetches SPY/RSP prices, writes to Firestore.
2. **dashboard/** — Next.js App Router on Vercel at `ryan.ibuild4you.com`. Read-only dashboard showing fear/greed score, trend chart, and driving posts. SSR + ISR (revalidate ~30min), no auth.

## Architecture

```
Reddit (public JSON) ──┐
                       ├── worker/ (Python/Raspberry Pi) ──► Firestore (sentiment-arbitrage)
Finnhub API ───────────┘                                            │
                                                                    ▼
                                                dashboard/ (Next.js/Vercel)
                                                         │
                                                         ▼
                                                ryan.ibuild4you.com
```

## Firestore Collections

Firebase project `sentiment-arbitrage` (dedicated, not shared):

- `sentiment_scores` — `{ timestamp, score, post_count, avg_positive, avg_negative, avg_neutral }`
- `sentiment_posts` — `{ timestamp, run_id, subreddit, title, selftext_preview, url, reddit_score, sentiment_label, sentiment_positive, sentiment_negative, sentiment_neutral }`
- `price_snapshots` — `{ timestamp, ticker, close_price }`

## Worker (Python)

- Python 3.11, runs on Raspberry Pi via systemd timer (9am/1pm/6pm ET weekdays)
- Previously on Railway — moved due to Reddit 403-blocking datacenter IPs (2026-03-31)
- Reddit data via public JSON endpoints (`reddit.com/r/{sub}/hot.json`) — no API key needed, residential IP required
- `transformers` + `torch` (CPU) with `ProsusAI/finbert` for sentiment
- `finnhub-python` for SPY/RSP prices
- `firebase-admin` for Firestore writes
- Fear/greed score: `(avg_positive - avg_negative)` scaled to 0-100
- Idempotent runs via timestamp-based doc IDs

Required env vars (set on Raspberry Pi, managed via SPAN repo):
```
FINNHUB_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_JSON   # JSON string or file path
FIRESTORE_PROJECT_ID                  # sentiment-arbitrage
```

## Dashboard (Next.js)

- Next.js 16 App Router, Tailwind CSS, Recharts
- Server components reading Firestore directly, ISR 30min
- Dark theme, fear/greed gauge hero, mobile-friendly
- Dual Y-axis trend chart: sentiment (dominant) + prices (muted)
- Top 5 bullish + bearish driving posts with Reddit links

Required env vars (set in Vercel):
```
GOOGLE_APPLICATION_CREDENTIALS_JSON
FIRESTORE_PROJECT_ID
```

## Commands

Worker (local dev):
```
cd worker && source venv/bin/activate && set -a && source .env && set +a && python main.py
```

Dashboard (local dev):
```
cd dashboard && npm run dev
```

## Next Steps

1. Confirm Pi worker runs successfully — check Firestore for fresh data after next scheduled run
2. Disable Railway cron once Pi is confirmed working (project: dazzling-adventure, service: sentiment-arbitrage)
3. Rename Vercel project from "dashboard" to something better (Settings → General → Project Name)
4. Gather Ryan's feedback on the dashboard and iterate
5. Reddit API access request is pending (submitted 2026-03-28) — can upgrade from public JSON if approved

## Scope Boundaries

No auth, no predictions, no individual stock sentiment, no alerts, no admin panel, no historical back-testing. All are documented phase 2+ ideas — build only what's specced in the build brief.
