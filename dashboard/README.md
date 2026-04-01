# Sentiment Arbitrage Dashboard

**Live at:** [ryan.ibuild4you.com](https://ryan.ibuild4you.com)

## What it does

Tracks market sentiment across Reddit's investing communities (r/investing, r/stocks, r/wallstreetbets). Three times a day on weekdays — 9am, 1pm, and 6pm ET — it:

1. Pulls the hottest ~100 posts from those subreddits
2. Scores each post's sentiment using FinBERT (an AI model trained on financial text)
3. Combines the scores into a single fear/greed number (0 = extreme fear, 100 = extreme greed)
4. Grabs SPY and RSP prices for comparison
5. Writes everything to the database

The dashboard shows the latest score, a trend chart over time, and the top bullish/bearish posts driving the score.

## March 31, 2026 — Update

The data pipeline was stale since launch because Reddit started blocking requests from cloud servers. We moved the data collection to a home server (Raspberry Pi) which fixed the issue. The first successful run scored **46.0** (slightly bearish) from 96 posts.

Data should now update 3x/day on weekdays. The dashboard refreshes from the database every ~30 minutes.

## What's next

- Watching for patterns as data accumulates over the coming days/weeks
- Waiting on Reddit API access approval (submitted March 28) for a more reliable data feed
- Open to feedback — let Nico know what would make this more useful
