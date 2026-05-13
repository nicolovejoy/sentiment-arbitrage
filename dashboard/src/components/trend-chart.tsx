"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from "recharts";

type DataPoint = {
  date: string;
  score: number;
  SPY: number;
  RSP: number;
};

type PlotPoint = {
  date: string;
  score: number;
  SPY: number | null;
  RSP: number | null;
};

export type CorrelationFlag = {
  x1: string;
  x2: string;
};

type Prepared = {
  data: PlotPoint[];
  priceDomain: [number, number];
  sentimentDomain: [number, number];
};

function prepare(data: DataPoint[]): Prepared {
  const base = data.find((d) => d.SPY > 0 && d.RSP > 0);

  const normalized: PlotPoint[] = data.map((d) => ({
    date: d.date,
    score: d.score,
    SPY: base && d.SPY > 0 ? (d.SPY / base.SPY) * 100 : null,
    RSP: base && d.RSP > 0 ? (d.RSP / base.RSP) * 100 : null,
  }));

  const priceValues = normalized.flatMap((d) =>
    [d.SPY, d.RSP].filter((v): v is number => v != null),
  );
  const priceDomain: [number, number] =
    priceValues.length > 0
      ? tightDomain(Math.min(...priceValues), Math.max(...priceValues), 1, 0.25)
      : [99, 101];

  const scores = normalized.map((d) => d.score);
  const sentimentDomain: [number, number] =
    scores.length > 0
      ? clamp(tightDomain(Math.min(...scores), Math.max(...scores), 5, 0.25), 0, 100)
      : [0, 100];

  return { data: normalized, priceDomain, sentimentDomain };
}

function tightDomain(
  min: number,
  max: number,
  minPad: number,
  padRatio: number,
): [number, number] {
  const pad = Math.max(minPad, (max - min) * padRatio);
  return [Math.floor(min - pad), Math.ceil(max + pad)];
}

function clamp(
  [lo, hi]: [number, number],
  floor: number,
  ceil: number,
): [number, number] {
  return [Math.max(floor, lo), Math.min(ceil, hi)];
}

export function TrendChart({
  data,
  dailyFlags = [],
  weeklyFlags = [],
}: {
  data: DataPoint[];
  dailyFlags?: CorrelationFlag[];
  weeklyFlags?: CorrelationFlag[];
}) {
  const { data: plotData, priceDomain, sentimentDomain } = prepare(data);
  const [sensitivity, setSensitivity] = useState(50);

  return (
    <div className="w-full space-y-3">
      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={plotData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              yAxisId="sentiment"
              domain={sentimentDomain}
              stroke="#eab308"
              fontSize={12}
              tickLine={false}
              label={{ value: "Sentiment", angle: -90, position: "insideLeft", fill: "#eab308", fontSize: 12 }}
            />
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={priceDomain}
              stroke="#71717a"
              fontSize={12}
              tickLine={false}
              label={{ value: "Indexed (100)", angle: 90, position: "insideRight", fill: "#71717a", fontSize: 12 }}
            />
            {dailyFlags.map((f, i) => (
              <ReferenceArea
                key={`daily-${i}`}
                yAxisId="price"
                x1={f.x1}
                x2={f.x2}
                fill="#38bdf8"
                fillOpacity={0.12}
                stroke="none"
              />
            ))}
            {weeklyFlags.map((f, i) => (
              <ReferenceArea
                key={`weekly-${i}`}
                yAxisId="price"
                x1={f.x1}
                x2={f.x2}
                fill="#34d399"
                fillOpacity={0.18}
                stroke="none"
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "8px",
                fontSize: 13,
              }}
              labelStyle={{ color: "#a1a1aa" }}
              formatter={(value) => {
                const n = typeof value === "number" ? value : Number(value);
                return n.toFixed(1);
              }}
            />
            <Legend />
            <Line
              yAxisId="sentiment"
              type="monotone"
              dataKey="score"
              stroke="#eab308"
              strokeWidth={3}
              dot={{ r: 4, fill: "#eab308" }}
              name="Sentiment"
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="SPY"
              stroke="#6366f1"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              name="SPY"
            />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="RSP"
              stroke="#8b5cf6"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              name="RSP"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="px-2 space-y-2">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <label htmlFor="sensitivity" className="font-medium">
            Correlation sensitivity
          </label>
          <span className="tabular-nums text-zinc-500">{sensitivity}</span>
        </div>
        <input
          id="sensitivity"
          type="range"
          min={0}
          max={100}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full accent-sky-500"
        />
        <div className="flex items-center gap-4 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-sky-400/30 border border-sky-400/40" />
            Daily
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400/30 border border-emerald-400/40" />
            Weekly
          </span>
        </div>
      </div>
    </div>
  );
}
