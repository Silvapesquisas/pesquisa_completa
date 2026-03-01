import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Trophy } from "lucide-react";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

export default function InterviewerPerformance({ interviews }) {
  const data = (() => {
    const map = {};
    (interviews || []).forEach(i => {
      const name = i.interviewer_name || "—";
      if (!map[name]) map[name] = { name: name.split(" ")[0], total: 0, concluidas: 0 };
      map[name].total++;
      if (i.status === "concluida") map[name].concluidas++;
    });
    return Object.values(map).sort((a, b) => b.concluidas - a.concluidas).slice(0, 8);
  })();

  if (!data.length) return null;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Desempenho dos Entrevistadores
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value, name) => [value, name === "concluidas" ? "Concluídas" : "Total"]}
            />
            <Bar dataKey="concluidas" name="concluidas" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 space-y-2">
          {data.slice(0, 5).map((d, i) => (
            <div key={d.name} className="flex items-center gap-3 text-sm">
              <span className="text-xs font-bold text-gray-400 w-4">{i + 1}º</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div className="h-2 rounded-full transition-all" style={{ width: `${data[0].concluidas ? (d.concluidas / data[0].concluidas) * 100 : 0}%`, backgroundColor: COLORS[i % COLORS.length] }} />
              </div>
              <span className="text-xs text-gray-600 w-20 truncate">{d.name}</span>
              <span className="text-xs font-semibold text-gray-800 w-8 text-right">{d.concluidas}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}