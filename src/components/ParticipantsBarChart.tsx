"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function ParticipantsBarChart({ data }: { data: any[] }) {
  return (
    <div className="w-full mt-2 mb-1">
      <ResponsiveContainer width="100%" height={40}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" hide />
          <YAxis hide />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} cursor={{ fill: "#f0fdf4" }} />
          <Bar dataKey="participant_count" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        {data.map(ev => (
          <span key={ev.id} className="truncate max-w-[60px] text-center">
            {ev.name.length > 8 ? ev.name.slice(0, 8) + "…" : ev.name}
          </span>
        ))}
      </div>
    </div>
  );
} 