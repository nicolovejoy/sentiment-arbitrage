export function getScoreLabel(score: number): string {
  if (score <= 15) return "Extreme Fear";
  if (score <= 30) return "Fear";
  if (score <= 45) return "Moderate Fear";
  if (score <= 55) return "Neutral";
  if (score <= 70) return "Moderate Greed";
  if (score <= 85) return "Greed";
  return "Extreme Greed";
}

export function getScoreColor(score: number): string {
  if (score <= 25) return "#ef4444";    // red-500
  if (score <= 40) return "#f97316";    // orange-500
  if (score <= 55) return "#eab308";    // yellow-500
  if (score <= 70) return "#84cc16";    // lime-500
  return "#22c55e";                      // green-500
}

export function getContextLine(current: number, previous: number): string {
  const label = getScoreLabel(current).toLowerCase();
  const diff = current - previous;
  const absDiff = Math.abs(diff);

  let direction: string;
  if (absDiff < 2) direction = "holding steady from yesterday";
  else if (diff > 0) direction = `up ${absDiff.toFixed(1)} points from yesterday`;
  else direction = `down ${absDiff.toFixed(1)} points from yesterday`;

  return `Market sentiment is ${label} — ${direction}.`;
}
