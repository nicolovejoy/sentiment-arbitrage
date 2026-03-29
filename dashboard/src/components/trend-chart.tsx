"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type DataPoint = {
  date: string;
  score: number;
  SPY: number;
  RSP: number;
};

export function TrendChart({ data }: { data: DataPoint[] }) {
  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="date"
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            yAxisId="sentiment"
            domain={[0, 100]}
            stroke="#eab308"
            fontSize={12}
            tickLine={false}
            label={{ value: "Sentiment", angle: -90, position: "insideLeft", fill: "#eab308", fontSize: 12 }}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            stroke="#71717a"
            fontSize={12}
            tickLine={false}
            label={{ value: "Price ($)", angle: 90, position: "insideRight", fill: "#71717a", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #27272a",
              borderRadius: "8px",
              fontSize: 13,
            }}
            labelStyle={{ color: "#a1a1aa" }}
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
            name="SPY"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="RSP"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            dot={false}
            name="RSP"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
