import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_COLORS = {
  concluida: "#22c55e",
  em_andamento: "#3b82f6",
  revisao: "#f59e0b",
};

export default function InterviewMap({ interviews }) {
  const withGeo = (interviews || []).filter(i => i.latitude && i.longitude);

  if (!withGeo.length) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Mapa de Entrevistas
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

  const center = [
    withGeo.reduce((s, i) => s + i.latitude, 0) / withGeo.length,
    withGeo.reduce((s, i) => s + i.longitude, 0) / withGeo.length,
  ];

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            Mapa de Entrevistas
          </CardTitle>
          <div className="flex gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Concluída</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Em andamento</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Revisão</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 rounded-b-xl overflow-hidden" style={{ height: 320 }}>
        <MapContainer center={center} zoom={10} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          {withGeo.map(i => (
            <CircleMarker
              key={i.id}
              center={[i.latitude, i.longitude]}
              radius={8}
              fillColor={STATUS_COLORS[i.status] || "#6b7280"}
              color="#fff"
              weight={2}
              fillOpacity={0.85}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{i.survey_title || "Pesquisa"}</p>
                  <p>Entrevistador: {i.interviewer_name || "—"}</p>
                  <p>Status: {i.status?.replace("_", " ")}</p>
                  {i.completed_at && <p>Data: {format(new Date(i.completed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </CardContent>
    </Card>
  );
}