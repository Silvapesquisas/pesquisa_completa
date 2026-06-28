// Captura um mapa real (com ruas) das coordenadas das entrevistas, renderizando
// um Leaflet offscreen e convertendo para imagem (html2canvas). Depende de
// internet (tiles do OpenStreetMap); em caso de falha/timeout retorna null para
// o chamador cair no "mapa de pontos".
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import html2canvas from "html2canvas";

export async function captureStreetMap(coords, { width = 640, height = 420, timeout = 7000 } = {}) {
  const pts = (coords || []).filter(c => typeof c.lat === "number" && typeof c.lng === "number");
  if (pts.length === 0) return null;

  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(container);

  let map;
  try {
    map = L.map(container, { zoomControl: false, attributionControl: false, fadeAnimation: false, zoomAnimation: false });
    const tile = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { crossOrigin: "anonymous", maxZoom: 19 });
    tile.addTo(map);
    const latlngs = pts.map(c => [c.lat, c.lng]);
    latlngs.forEach(ll => L.circleMarker(ll, { radius: 4, color: "#1e40af", fillColor: "#2563eb", fillOpacity: 0.85, weight: 1 }).addTo(map));
    if (latlngs.length === 1) map.setView(latlngs[0], 15);
    else map.fitBounds(L.latLngBounds(latlngs).pad(0.2));

    // Aguarda os tiles carregarem (ou estoura o timeout)
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      tile.on("load", () => setTimeout(finish, 500));
      setTimeout(finish, timeout);
    });

    const canvas = await html2canvas(container, { useCORS: true, backgroundColor: "#ffffff", logging: false, width, height });
    const dataUrl = canvas.toDataURL("image/png");
    // Detecta captura "em branco" (tiles bloqueados) por tamanho mínimo do PNG
    if (!dataUrl || dataUrl.length < 3000) return null;
    return { dataUrl, w: width, h: height };
  } catch {
    return null;
  } finally {
    try { map && map.remove(); } catch { /* ignore */ }
    try { document.body.removeChild(container); } catch { /* ignore */ }
  }
}
