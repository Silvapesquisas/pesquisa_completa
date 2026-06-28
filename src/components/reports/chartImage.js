// Renderizadores em canvas -> data URL (PNG). Usados tanto no PDF (jsPDF.addImage)
// quanto no DOCX (ImageRun). Gera gráficos em estilos diferentes e um "mapa de
// pontos" das coordenadas (sem depender de tiles de internet).

export const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444",
  "#a855f7", "#14b8a6", "#f97316", "#ec4899",
];

function newCanvas(w, h, scale = 2) {
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  return { c, ctx, w, h };
}

const fmtPct = (v, total) => (total > 0 ? ((v / total) * 100).toFixed(1) : "0.0") + "%";
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

// Gráfico de barras horizontais
function drawBarsH(ctx, data, w, h) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const max = Math.max(...data.map(d => d.value), 1);
  const padL = 4, labelW = Math.min(150, w * 0.34), padR = 70;
  const barAreaW = w - labelW - padR - padL;
  const rowH = Math.min(34, (h - 10) / data.length);
  data.forEach((d, i) => {
    const y = 8 + i * rowH;
    ctx.fillStyle = "#374151";
    ctx.font = "12px Helvetica, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(truncate(d.name, 30), padL, y + rowH / 2 + 4);
    const bw = (d.value / max) * barAreaW;
    ctx.fillStyle = "#eef2f8";
    ctx.fillRect(padL + labelW, y + 4, barAreaW, rowH - 12);
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(padL + labelW, y + 4, Math.max(bw, 2), rowH - 12);
    ctx.fillStyle = "#374151";
    ctx.fillText(`${d.value} (${fmtPct(d.value, total)})`, padL + labelW + barAreaW + 6, y + rowH / 2 + 4);
  });
}

// Gráfico de colunas verticais
function drawColumns(ctx, data, w, h) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const max = Math.max(...data.map(d => d.value), 1);
  const padB = 46, padT = 22, padL = 8, padR = 8;
  const areaH = h - padB - padT;
  const slot = (w - padL - padR) / data.length;
  const bw = Math.min(slot * 0.62, 70);
  data.forEach((d, i) => {
    const x = padL + i * slot + (slot - bw) / 2;
    const bh = (d.value / max) * areaH;
    const y = padT + areaH - bh;
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#374151";
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fmtPct(d.value, total), x + bw / 2, y - 5);
    ctx.fillText(truncate(d.name, 14), x + bw / 2, h - padB + 16);
  });
}

// Pizza / Rosca
function drawPie(ctx, data, w, h, donut = false) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = h / 2 + 6, cy = h / 2, r = h / 2 - 16;
  let ang = -Math.PI / 2;
  data.forEach((d, i) => {
    const slice = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, ang, ang + slice);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    if (d.value / total > 0.05) {
      const mid = ang + slice / 2;
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 11px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(fmtPct(d.value, total), cx + Math.cos(mid) * r * 0.62, cy + Math.sin(mid) * r * 0.62 + 3);
    }
    ang += slice;
  });
  if (donut) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
  // legenda à direita
  const lx = cx + r + 18;
  let ly = 14;
  ctx.textAlign = "left";
  data.forEach((d, i) => {
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fillRect(lx, ly, 11, 11);
    ctx.fillStyle = "#374151";
    ctx.font = "11px Helvetica, Arial, sans-serif";
    ctx.fillText(`${truncate(d.name, 22)} — ${fmtPct(d.value, total)}`, lx + 16, ly + 9);
    ly += 17;
  });
}

// data: [{name, value}], type: "bar" | "column" | "pie" | "donut"
export function renderChart({ type = "bar", data = [], width = 520, height } = {}) {
  const items = (data || []).filter(d => d && d.value > 0).slice(0, 10);
  if (items.length === 0) return null;
  const h = height || (type === "bar" ? Math.max(90, items.length * 30 + 16) : 240);
  const { c, ctx } = newCanvas(width, h);
  if (type === "column") drawColumns(ctx, items, width, h);
  else if (type === "pie") drawPie(ctx, items, width, h, false);
  else if (type === "donut") drawPie(ctx, items, width, h, true);
  else drawBarsH(ctx, items, width, h);
  return { dataUrl: c.toDataURL("image/png"), w: width, h };
}

// Mapa de pontos: normaliza coordenadas para o quadro, sem tiles externos.
export function renderPointMap({ coords = [], width = 520, height = 360 } = {}) {
  const pts = (coords || []).filter(p => typeof p.lat === "number" && typeof p.lng === "number");
  if (pts.length === 0) return null;
  const { c, ctx } = newCanvas(width, height);
  // fundo neutro com moldura
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#cbd5e1";
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  let minLat = Math.min(...pts.map(p => p.lat)), maxLat = Math.max(...pts.map(p => p.lat));
  let minLng = Math.min(...pts.map(p => p.lng)), maxLng = Math.max(...pts.map(p => p.lng));
  // margem para não colar nas bordas; evita divisão por zero quando há 1 ponto
  const padLat = (maxLat - minLat) * 0.1 || 0.01;
  const padLng = (maxLng - minLng) * 0.1 || 0.01;
  minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;
  const pad = 14;
  const sx = (width - pad * 2) / (maxLng - minLng);
  const sy = (height - pad * 2) / (maxLat - minLat);

  // grade leve
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const gx = pad + ((width - pad * 2) / 5) * i;
    const gy = pad + ((height - pad * 2) / 5) * i;
    ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, height - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(width - pad, gy); ctx.stroke();
  }

  pts.forEach(p => {
    const x = pad + (p.lng - minLng) * sx;
    const y = height - pad - (p.lat - minLat) * sy; // lat cresce para cima
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(37, 99, 235, 0.75)";
    ctx.fill();
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });

  ctx.fillStyle = "#475569";
  ctx.font = "11px Helvetica, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${pts.length} entrevista(s) georreferenciada(s)`, pad, height - 5);
  return { dataUrl: c.toDataURL("image/png"), w: width, h: height };
}
