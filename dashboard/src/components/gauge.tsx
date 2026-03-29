"use client";

import { getScoreColor, getScoreLabel } from "@/lib/sentiment";

export function Gauge({ score }: { score: number }) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  // Map 0-100 score to -90deg..90deg rotation for the needle
  const rotation = ((score / 100) * 180) - 90;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-64 h-36 overflow-hidden">
        {/* Arc background */}
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke="#27272a"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Colored arc — width proportional to score */}
          <path
            d="M 10 100 A 90 90 0 0 1 190 100"
            fill="none"
            stroke={color}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${(score / 100) * 283} 283`}
            className="transition-all duration-700"
          />
          {/* Needle */}
          <line
            x1="100"
            y1="100"
            x2="100"
            y2="25"
            stroke="#ededed"
            strokeWidth="2.5"
            strokeLinecap="round"
            transform={`rotate(${rotation}, 100, 100)`}
            className="transition-all duration-700"
          />
          {/* Center dot */}
          <circle cx="100" cy="100" r="5" fill="#ededed" />
        </svg>
      </div>
      <div className="text-center">
        <div className="text-6xl font-mono font-bold" style={{ color }}>
          {score.toFixed(1)}
        </div>
        <div className="text-lg text-zinc-400 mt-1 font-medium">{label}</div>
      </div>
    </div>
  );
}
