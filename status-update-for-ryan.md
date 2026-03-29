# Sentiment Arbitrage — Status Update

## What's done

**Dashboard** is live on Vercel (currently showing mock data while we wire up the real pipeline):
https://dashboard-nine-beryl-99.vercel.app

It shows:
- Fear/greed gauge (0-100 scale, color-coded)
- Plain-English context line ("sentiment is moderate fear — down 3.4 points from yesterday")
- 7-day trend chart with sentiment score, SPY, and RSP on dual axes
- Top 5 bearish and bullish driving posts from Reddit
- Mobile-friendly, dark theme

**Worker** (Python pipeline) is written and ready to run:
- Pulls ~100 hot posts from r/investing, r/stocks, r/wallstreetbets
- Scores each post with FinBERT (financial sentiment AI model)
- Fetches SPY and RSP prices from Finnhub
- Writes everything to Firestore
- Designed to run 3x/day on weekdays (9am, 1pm, 6pm ET)

**Firebase** project is set up with Firestore ready to receive data.

## What we learned — Reddit API access

Reddit changed their API access policy in 2023-2024. Getting API keys now requires a formal application and review process. Approval can take anywhere from 1 week to over a month, and many requests get no response at all.

**We worked around this.** Instead of using Reddit's official API (which requires approved credentials), the worker now uses Reddit's public JSON endpoints. Every subreddit has a `.json` URL (e.g., `reddit.com/r/investing/hot.json`) that returns the same data without authentication. This is rate-limited but more than sufficient for 3 runs/day.

We still submitted an API access request in case we want to upgrade later, but it's no longer a blocker.

## What's next

1. **Test the worker end-to-end** — run it locally to verify posts flow through FinBERT and into Firestore correctly
2. **Seed Firestore** — run the worker manually 3-4 times to populate real data
3. **Connect dashboard to Firestore** — swap mock data for real reads (currently using placeholder data)
4. **Deploy worker to Railway** — set up the cron schedule
5. **Set up `ryan.ibuild4you.com`** — CNAME to Vercel

## Things to discuss

- **Update frequency**: 3x/day on weekdays is the current plan. Want weekend coverage too? Want more frequent runs?
- **Additional data sources**: If Reddit sentiment alone isn't rich enough, we could add StockTwits, financial news headlines, or X/Twitter. Each would be a separate data pull in the same pipeline.
- **Alerts**: The brief excludes alerts, but if Ryan wants a text or email when sentiment crosses extreme thresholds (e.g., score drops below 15 or above 85), that's straightforward to add later.
- **Historical depth**: Currently showing 7 days. Could extend to 30 days or add a date picker.

## Cost so far

- Vercel: free tier
- Firebase/Firestore: free tier
- Finnhub: free tier
- Reddit: free (public endpoints, no API key)
- Railway (not yet deployed): ~$5-10/month estimated

Total: **$0 until Railway deployment**
