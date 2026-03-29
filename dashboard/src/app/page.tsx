import { Gauge } from "@/components/gauge";
import { TrendChart } from "@/components/trend-chart";
import { PostList } from "@/components/post-list";
import { getContextLine } from "@/lib/sentiment";
import { getScores, getLatestPosts, getPrices } from "@/lib/data";

export const revalidate = 1800; // ISR: 30 min

export default async function Home() {
  const [scores, { bearish, bullish }, priceMap] = await Promise.all([
    getScores(),
    getLatestPosts(),
    getPrices(),
  ]);

  const latestScore = scores[scores.length - 1];
  const previousScore = scores.length > 1 ? scores[scores.length - 2] : latestScore;

  if (!latestScore) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 flex items-center justify-center">
        <p className="text-zinc-500">No data yet. Worker hasn&apos;t run.</p>
      </div>
    );
  }

  const contextLine = getContextLine(latestScore.score, previousScore.score);

  // Merge scores and prices into chart data
  const chartData = scores.map((s) => {
    // Match score timestamp to price data by run_id format
    const ts = new Date(s.timestamp);
    const runId = `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, "0")}-${String(ts.getUTCDate()).padStart(2, "0")}T${String(ts.getUTCHours()).padStart(2, "0")}-${String(ts.getUTCMinutes()).padStart(2, "0")}`;
    const prices = priceMap[runId] ?? {};
    return {
      date: ts.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric" }),
      score: s.score,
      SPY: prices.SPY ?? 0,
      RSP: prices.RSP ?? 0,
    };
  });

  const lastUpdated = new Date(latestScore.timestamp);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">
        {/* Header */}
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Market Sentiment
          </h1>
          <p className="text-sm text-zinc-500">
            Reddit-sourced fear/greed index
          </p>
        </header>

        {/* Gauge */}
        <section className="flex flex-col items-center">
          <Gauge score={latestScore.score} />
          <p className="text-sm text-zinc-400 mt-4 text-center max-w-md">
            {contextLine}
          </p>
        </section>

        {/* Trend Chart */}
        {scores.length > 1 && (
          <section className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <h2 className="text-lg font-semibold text-zinc-200 mb-4">
              Trend
            </h2>
            <TrendChart data={chartData} />
          </section>
        )}

        {/* Driving Posts */}
        {(bearish.length > 0 || bullish.length > 0) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bearish.length > 0 && <PostList posts={bearish} type="bearish" />}
            {bullish.length > 0 && <PostList posts={bullish} type="bullish" />}
          </section>
        )}

        {/* Footer */}
        <footer className="text-center space-y-2 pt-6 border-t border-zinc-800">
          <p className="text-xs text-zinc-500">
            Last updated:{" "}
            {lastUpdated.toLocaleString("en-US", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p className="text-xs text-zinc-600">
            Data: Reddit (r/investing, r/stocks, r/wallstreetbets) &middot;
            FinBERT sentiment &middot; Finnhub prices
          </p>
          <p className="text-xs text-zinc-600 italic">
            This is a research tool — not financial advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
