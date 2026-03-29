// Mock data matching Firestore schema — swap for real reads later

const now = new Date();
const day = (daysAgo: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
};

export const mockScores = [
  { timestamp: day(6), score: 38.2, post_count: 97, avg_positive: 0.2120, avg_negative: 0.4480, avg_neutral: 0.3400 },
  { timestamp: day(5), score: 42.5, post_count: 102, avg_positive: 0.2450, avg_negative: 0.3950, avg_neutral: 0.3600 },
  { timestamp: day(4), score: 35.1, post_count: 95, avg_positive: 0.1910, avg_negative: 0.4890, avg_neutral: 0.3200 },
  { timestamp: day(3), score: 47.8, post_count: 99, avg_positive: 0.2780, avg_negative: 0.3220, avg_neutral: 0.4000 },
  { timestamp: day(2), score: 52.3, post_count: 101, avg_positive: 0.3030, avg_negative: 0.2770, avg_neutral: 0.4200 },
  { timestamp: day(1), score: 44.6, post_count: 98, avg_positive: 0.2560, avg_negative: 0.3640, avg_neutral: 0.3800 },
  { timestamp: day(0), score: 41.2, post_count: 100, avg_positive: 0.2320, avg_negative: 0.4080, avg_neutral: 0.3600 },
];

export const mockPrices = [
  { timestamp: day(6), SPY: 512.30, RSP: 158.45 },
  { timestamp: day(5), SPY: 509.80, RSP: 157.20 },
  { timestamp: day(4), SPY: 505.15, RSP: 155.90 },
  { timestamp: day(3), SPY: 511.40, RSP: 158.10 },
  { timestamp: day(2), SPY: 515.60, RSP: 159.35 },
  { timestamp: day(1), SPY: 513.20, RSP: 158.80 },
  { timestamp: day(0), SPY: 510.75, RSP: 157.95 },
];

export const mockBearishPosts = [
  { title: "The yield curve is screaming recession and nobody is listening", subreddit: "investing", sentiment_negative: 0.92, url: "https://reddit.com" },
  { title: "Commercial real estate is about to implode — here's why", subreddit: "stocks", sentiment_negative: 0.88, url: "https://reddit.com" },
  { title: "Lost 40% on NVDA calls, this market is cooked", subreddit: "wallstreetbets", sentiment_negative: 0.85, url: "https://reddit.com" },
  { title: "Consumer debt at all-time highs, spending will crater", subreddit: "investing", sentiment_negative: 0.81, url: "https://reddit.com" },
  { title: "Fed minutes signal more hikes — bulls are delusional", subreddit: "stocks", sentiment_negative: 0.78, url: "https://reddit.com" },
];

export const mockBullishPosts = [
  { title: "AI spending is just getting started — infrastructure plays are golden", subreddit: "investing", sentiment_positive: 0.94, url: "https://reddit.com" },
  { title: "Small caps are historically cheap, RSP looking attractive", subreddit: "stocks", sentiment_positive: 0.89, url: "https://reddit.com" },
  { title: "PLTR to the moon, government contracts locked in for years", subreddit: "wallstreetbets", sentiment_positive: 0.86, url: "https://reddit.com" },
  { title: "Employment numbers still strong — soft landing is real", subreddit: "investing", sentiment_positive: 0.82, url: "https://reddit.com" },
  { title: "Earnings season crushing expectations across the board", subreddit: "stocks", sentiment_positive: 0.79, url: "https://reddit.com" },
];

export const latestScore = mockScores[mockScores.length - 1];
export const previousScore = mockScores[mockScores.length - 2];
export const lastUpdated = new Date(mockScores[mockScores.length - 1].timestamp);
