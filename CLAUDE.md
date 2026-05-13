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
- `correlations` — `{ date, sentiment_score, spy_next_day_pct, rsp_next_day_pct }` (background data collection, not displayed yet)

## Worker (Python)

- Python 3.11, runs on Raspberry Pi via systemd timer (9am/1pm/6pm ET weekdays)
- Previously on Railway (deleted 2026-03-31) — Reddit 403-blocks datacenter IPs
- Reddit data via public JSON endpoints (`reddit.com/r/{sub}/hot.json`) — no API key needed, residential IP required
- `transformers` + `torch` (CPU) with `ProsusAI/finbert` for sentiment
- `finnhub-python` for SPY/RSP prices
- `firebase-admin` for Firestore writes
- Fear/greed score: `(avg_positive - avg_negative)` scaled to 0-100
- Idempotent runs via timestamp-based doc IDs

Required env vars (set on Raspberry Pi):
```
FINNHUB_API_KEY
GOOGLE_APPLICATION_CREDENTIALS_JSON   # JSON string or file path
FIRESTORE_PROJECT_ID                  # sentiment-arbitrage
```

## Dashboard (Next.js)

- Next.js 16 App Router, Tailwind CSS, Recharts
- Server components reading Firestore directly, ISR 30min
- Dark theme, fear/greed gauge hero, mobile-friendly
- Dual Y-axis trend chart: sentiment (left, dominant) + SPY/RSP normalized to 100 (right, for relative comparison)
- Top 5 bullish + bearish driving posts with Reddit links

Required env vars (set in Vercel):
```
GOOGLE_APPLICATION_CREDENTIALS_JSON
FIRESTORE_PROJECT_ID
```

## Commands

Dashboard (local dev):
```
cd dashboard && npm run dev
```

## Deploying Worker to Raspberry Pi

If repo is already cloned on the Pi, pull and run:
```
cd ~/sentiment-arbitrage && git pull && bash worker/setup-pi.sh
```

For fresh setup, clone first:
```
git clone https://github.com/nicolovejoy/sentiment-arbitrage.git ~/sentiment-arbitrage && bash ~/sentiment-arbitrage/worker/setup-pi.sh
```

The setup script installs Python deps + FinBERT model (~400MB), creates an env template, and installs systemd units. Then:

1. Fill in secrets: `nano /home/nico/sentiment-arbitrage/worker/.env`
2. Test run: `sudo systemctl start sentiment-worker && journalctl -u sentiment-worker -f`
3. Start timer: `sudo systemctl start sentiment-worker.timer`
4. Verify: `systemctl list-timers sentiment-worker.timer`

Logs: `journalctl -u sentiment-worker --since today`

## Next Steps

1. Once back on Pi network: verify first `correlations` doc landed today (Tuesday 2026-05-12) — `journalctl -u sentiment-worker --since today | grep -i correlat` and check Firestore. Also watch for the composite-index error on `price_snapshots` (ticker + timestamp); create the index via the link in the error if it appears.
2. Gather Ryan's feedback on the new chart axes + correlation slider scaffolding, iterate visuals
3. Once enough correlation history exists, wire real `dailyFlags` / `weeklyFlags` data into `TrendChart` and define what the sensitivity slider actually controls (threshold? lookback window?)
4. Reddit API access request pending (submitted 2026-03-28) — upgrade from public JSON if approved

## Scope Boundaries

No auth, no predictions, no individual stock sentiment, no alerts, no admin panel, no historical back-testing. All are documented phase 2+ ideas — build only what's specced in the build brief.
