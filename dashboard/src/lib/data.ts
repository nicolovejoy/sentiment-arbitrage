import { db } from "./firebase";

export type SentimentScore = {
  timestamp: string;
  score: number;
  post_count: number;
  avg_positive: number;
  avg_negative: number;
  avg_neutral: number;
};

export type SentimentPost = {
  title: string;
  subreddit: string;
  url: string;
  sentiment_label: string;
  sentiment_positive: number;
  sentiment_negative: number;
  sentiment_neutral: number;
  run_id: string;
};

export type PriceSnapshot = {
  timestamp: string;
  ticker: string;
  close_price: number;
};

export async function getScores(days = 7): Promise<SentimentScore[]> {
  const snapshot = await db
    .collection("sentiment_scores")
    .orderBy("timestamp", "desc")
    .limit(days * 3) // up to 3 runs/day
    .get();

  return snapshot.docs
    .map((doc) => {
      const d = doc.data();
      return {
        timestamp: d.timestamp?.toDate?.()?.toISOString?.() ?? d.timestamp,
        score: d.score,
        post_count: d.post_count,
        avg_positive: d.avg_positive,
        avg_negative: d.avg_negative,
        avg_neutral: d.avg_neutral,
      };
    })
    .reverse();
}

export async function getLatestPosts(): Promise<{
  bearish: SentimentPost[];
  bullish: SentimentPost[];
}> {
  // Get the most recent run_id from scores
  const latestScore = await db
    .collection("sentiment_scores")
    .orderBy("timestamp", "desc")
    .limit(1)
    .get();

  if (latestScore.empty) return { bearish: [], bullish: [] };

  const latestRunId = latestScore.docs[0].id;

  const postsSnap = await db
    .collection("sentiment_posts")
    .where("run_id", "==", latestRunId)
    .get();

  const posts = postsSnap.docs.map((doc) => doc.data() as SentimentPost);

  const bearish = posts
    .filter((p) => p.sentiment_label === "negative")
    .sort((a, b) => b.sentiment_negative - a.sentiment_negative)
    .slice(0, 5);

  const bullish = posts
    .filter((p) => p.sentiment_label === "positive")
    .sort((a, b) => b.sentiment_positive - a.sentiment_positive)
    .slice(0, 5);

  return { bearish, bullish };
}

export async function getPrices(days = 7): Promise<Record<string, { SPY?: number; RSP?: number }>> {
  const snapshot = await db
    .collection("price_snapshots")
    .orderBy("timestamp", "desc")
    .limit(days * 6) // 2 tickers × 3 runs/day
    .get();

  const byTimestamp: Record<string, { SPY?: number; RSP?: number }> = {};

  for (const doc of snapshot.docs) {
    const d = doc.data();
    const ts = d.timestamp?.toDate?.()?.toISOString?.() ?? d.timestamp;
    // Group by the run_id prefix (e.g., "2026-03-28T18-42")
    const runId = doc.id.replace(/_(?:SPY|RSP)$/, "");
    if (!byTimestamp[runId]) byTimestamp[runId] = {};
    byTimestamp[runId][d.ticker as "SPY" | "RSP"] = d.close_price;
  }

  return byTimestamp;
}
