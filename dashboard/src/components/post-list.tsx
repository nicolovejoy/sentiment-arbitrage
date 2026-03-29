type Post = {
  title: string;
  subreddit: string;
  sentiment_positive?: number;
  sentiment_negative?: number;
  url: string;
};

export function PostList({
  posts,
  type,
}: {
  posts: Post[];
  type: "bullish" | "bearish";
}) {
  const isBullish = type === "bullish";
  const borderColor = isBullish ? "border-green-500/30" : "border-red-500/30";
  const tagColor = isBullish
    ? "bg-green-500/10 text-green-400"
    : "bg-red-500/10 text-red-400";

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-zinc-200">
        {isBullish ? "Bullish" : "Bearish"} Drivers
      </h2>
      <div className="space-y-2">
        {posts.map((post, i) => {
          const score = isBullish
            ? post.sentiment_positive
            : post.sentiment_negative;
          return (
            <a
              key={i}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block p-3 rounded-lg border ${borderColor} bg-zinc-900 hover:bg-zinc-800 transition-colors`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-zinc-300 leading-snug flex-1">
                  {post.title}
                </p>
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded shrink-0 ${tagColor}`}
                >
                  {((score ?? 0) * 100).toFixed(0)}%
                </span>
              </div>
              <span className="text-xs text-zinc-500 mt-1 inline-block">
                r/{post.subreddit}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
