import { useMemo, useState, useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Flame, Map, AlertTriangle } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Interpolate color: blue → green → yellow → red
function densityColor(ratio) {
  const stops = [
    [0,   [59,  130, 246, 0.15]],
    [0.2, [34,  197, 94,  0.45]],
    [0.5, [234, 179, 8,   0.65]],
    [0.8, [249, 115, 22,  0.80]],
    [1.0, [239, 68,  68,  0.92]],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i][0] && ratio <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = hi[0] === lo[0] ? 0 : (ratio - lo[0]) / (hi[0] - lo[0]);
  const lerp = (x, y) => Math.round(x + (y - x) * t);
  const opacity = lo[1][3] + (hi[1][3] - lo[1][3]) * t;
  return {
    color: `rgb(${lerp(lo[1][0], hi[1][0])},${lerp(lo[1][1], hi[1][1])},${lerp(lo[1][2], hi[1][2])})`,
    opacity,
  };
}

// Build grid cells from points
function buildGrid(points, cellSizeDeg = 0.008) {
  const map = {};
  points.forEach(p => {
    const gx = Math.floor(p.lat / cellSizeDeg);
    const gy = Math.floor(p.lng / cellSizeDeg);
    const key = `${gx}_${gy}`;
    if (!map[key]) map[key] = { lat: (gx + 0.5) * cellSizeDeg, lng: (gy + 0.5) * cellSizeDeg, count: 0, items: [] };
    map[key].count++;
    map[key].items.push(p);
  });
  return Object.values(map);
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map(p => p.lat);
    const lngs = points.map(p => p.lng);
    const pad = 0.02;
    map.fitBounds([[Math.min(...lats) - pad, Math.min(...lngs) - pad], [Math.max(...lats) + pad, Math.max(...lngs) + pad]]);
  }, [points.length]);
  return null;
}

export default function InterviewHeatmap({ interviews = [] }) {
  const [mode, setMode] = useState("heat"); // "heat" | "points"

  const completed = useMemo(() =>
    interviews.filter(i => i.status === "concluida" && i.latitude && i.longitude)
      .map(i => ({ lat: i.latitude, lng: i.longitude, data: i })),
    [interviews]
  );

  const allGeo = useMemo(() =>
    interviews.filter(i => i.latitude && i.longitude)
      .map(i => ({ lat: i.latitude, lng: i.longitude, data: i })),
    [interviews]
  );

  const points = mode === "heat" ? completed : allGeo;

  const grid = useMemo(() => buildGrid(points), [points]);
  const maxCount = useMemo(() => Math.max(...grid.map(c => c.count), 1), [grid]);

  const center = useMemo(() => {
    if (!points.length) return [-15.8, -47.9];
    return [points.reduce((s, p) => s + p.lat, 0) / points.length, points.reduce((s, p) => s + p.lng, 0) / points.length];
  }, [points]);

  const stats = useMemo(() => {
    const hotspots = grid.filter(c => c.count / maxCount >= 0.6).length;
    const cold = grid.filter(c => c.count === 1).length;
    return { hotspots, cold, total: points.length, cells: grid.length };
  }, [grid, maxCount, points]);

  if (!allGeo.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" /> Mapa de Calor — Densidade de Entrevistas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded-xl">
            Nenhuma entrevista com geolocalização ainda.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Mapa de Calor — Densidade de Entrevistas
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "heat" ? "default" : "outline"}
                className={mode === "heat" ? "bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs" : "h-7 text-xs"}
                onClick={() => setMode("heat")}>
                <Flame className="w-3 h-3 mr-1" /> Calor (concluídas)
              </Button>
              <Button size="sm" variant={mode === "points" ? "default" : "outline"}
                className={mode === "points" ? "h-7 text-xs" : "h-7 text-xs"}
                onClick={() => setMode("points")}>
                <Map className="w-3 h-3 mr-1" /> Todos os pontos
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Entrevistas", value: stats.total, color: "text-blue-600" },
              { label: "Áreas cobertas", value: stats.cells, color: "text-green-600" },
              { label: "Hotspots", value: stats.hotspots, color: "text-red-500" },
              { label: "Áreas esparsas", value: stats.cold, color: "text-amber-500" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 rounded-lg p-2.5 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Densidade:</span>
            {[
              { label: "Baixa", color: "#3b82f6" },
              { label: "Média", color: "#22c55e" },
              { label: "Alta", color: "#eab308" },
              { label: "Muito alta", color: "#ef4444" },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: l.color }} />
                {l.label}
              </span>
            ))}
            {stats.cold > 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs flex items-center gap-1 ml-2">
                <AlertTriangle className="w-3 h-3" /> {stats.cold} área(s) com cobertura esparsa
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 rounded-b-xl overflow-hidden" style={{ height: 460 }}>
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="© OpenStreetMap © CARTO"
          />
          <FitBounds points={points} />
          {grid.map((cell, idx) => {
            const ratio = cell.count / maxCount;
            const { color, opacity } = densityColor(ratio);
            const radius = 14 + ratio * 28;
            return (
              <CircleMarker
                key={idx}
                center={[cell.lat, cell.lng]}
                radius={radius}
                fillColor={color}
                fillOpacity={opacity}
                color={color}
                weight={0.5}
                opacity={opacity * 0.6}
              >
                <Popup>
                  <div className="text-xs space-y-1" style={{ minWidth: 160 }}>
                    <p className="font-semibold text-sm">{cell.count} entrevista{cell.count > 1 ? "s" : ""} nesta área</p>
                    <hr className="my-1" />
                    {cell.items.slice(0, 4).map((p, i) => (
                      <div key={i} className="text-gray-600">
                        <span className="font-medium">{p.data.interviewer_name || "—"}</span>
                        {p.data.completed_at && (
                          <span className="text-gray-400"> · {format(new Date(p.data.completed_at), "dd/MM/yy", { locale: ptBR })}</span>
                        )}
                      </div>
                    ))}
                    {cell.items.length > 4 && <p className="text-gray-400">+{cell.items.length - 4} mais…</p>}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </CardContent>
    </Card>
  );
}