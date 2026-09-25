// Exportação KML (Google Earth / Google My Maps) das entrevistas com localização.
//
// O título de cada ponto — o texto que aparece ao lado do alfinete no mapa —
// pode ser:
//   - a resposta de uma pergunta (ex.: bairro/localidade);
//   - o nome do entrevistador;
//   - a ordem da entrevista (Nº 1, Nº 2... por data de conclusão).
// Com "agrupar", os pontos ficam em pastas por título (ligar/desligar cada
// localidade no Google Earth) e cada grupo ganha uma cor de alfinete.
import { format } from "date-fns";

export const TITLE_MODES = {
  question: "Resposta de uma pergunta",
  interviewer: "Nome do entrevistador",
  order: "Ordem das entrevistas (Nº 1, 2, 3...)",
};

const NO_ANSWER = "Sem resposta";

// Cores dos grupos. KML usa aabbggrr (alfa, azul, verde, vermelho).
const PALETTE = [
  "ff2563eb", "ff16a34a", "ffdc2626", "ffd97706", "ff9333ea", "ff0891b2",
  "ffdb2777", "ff65a30d", "ffea580c", "ff4f46e5", "ff0d9488", "ffa16207",
].map((rgb) => `ff${rgb.slice(6, 8)}${rgb.slice(4, 6)}${rgb.slice(2, 4)}`);
const OTHER_COLOR = "ffafa39c"; // cinza (#9ca3af): grupos além da paleta

const xml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
// Texto dentro de CDATA/HTML da descrição.
const html = (s) => xml(s).replace(/\]\]>/g, "]]&gt;");

export const normalizeText = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

// Coordenada válida (0,0 é "sem GPS", não um ponto no oceano).
const hasGeo = (i) => {
  if (i?.latitude == null || i?.longitude == null) return false;
  const lat = Number(i.latitude), lng = Number(i.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

/**
 * Perguntas disponíveis para título. Pesquisas diferentes podem ter a mesma
 * pergunta (ex.: "Em qual bairro você reside?"): elas viram UMA opção, casada
 * pelo texto, para funcionar também com "Todas as pesquisas".
 * @returns [{ key, text, ids: [questionId...] }]
 */
export function questionChoices(surveys = []) {
  const map = new Map();
  for (const s of surveys) {
    for (const q of [...(s.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
      const text = (q.text || "").trim();
      if (!text) continue;
      const key = normalizeText(text);
      const item = map.get(key) || { key, text, ids: [] };
      item.ids.push(q.id);
      map.set(key, item);
    }
  }
  return [...map.values()];
}

// Pergunta de localidade, sugerida como título padrão.
const LOCALITY_RE = /\b(bairro|localidade|comunidade|povoado|distrito|regiao|zona|setor|vila|lugarejo)\b/;
export function suggestLocalityQuestion(choices = []) {
  return choices.find((c) => LOCALITY_RE.test(c.key)) || null;
}

export function answerFor(interview, choice) {
  if (!choice) return "";
  const ids = new Set(choice.ids || []);
  const a = (interview.answers || []).find((x) => ids.has(x.question_id))
    || (interview.answers || []).find((x) => normalizeText(x.question_text) === choice.key);
  if (!a) return "";
  const v = Array.isArray(a.answer_array) && a.answer_array.length ? a.answer_array.join(", ") : a.answer;
  return String(v ?? "").trim();
}

const whenOf = (i) => i.completed_at || i.created_date || "";
const fmtDate = (d) => {
  const x = d ? new Date(d) : null;
  return x && !isNaN(x) ? format(x, "dd/MM/yyyy HH:mm") : "—";
};

/**
 * Monta o conteúdo do KML.
 * @param interviews  entrevistas (as sem localização são ignoradas)
 * @param opts.mode   "question" | "interviewer" | "order"
 * @param opts.choice pergunta escolhida (de questionChoices), quando mode = "question"
 * @param opts.group  separar em pastas e cores por título (não se aplica a "order")
 * @param opts.docName nome do documento no Google Earth
 * @returns { kml, points, groups: [{ title, count }] }
 */
export function buildKML(interviews, { mode = "interviewer", choice = null, group = true, docName = "Entrevistas" } = {}) {
  // A ordem é pela data de conclusão (Nº 1 = primeira entrevista), contada
  // sobre as entrevistas exportadas.
  const points = interviews.filter(hasGeo)
    .sort((a, b) => String(whenOf(a)).localeCompare(String(whenOf(b))))
    .map((i, idx) => {
      const n = idx + 1;
      let title;
      if (mode === "order") title = `Nº ${n}`;
      else if (mode === "question") title = answerFor(i, choice) || NO_ANSWER;
      else title = (i.interviewer_name || "").trim() || "Sem entrevistador";
      return { i, n, title };
    });

  const useGroups = group && mode !== "order";
  // Grupos do maior para o menor; "Sem resposta" por último.
  const counts = new Map();
  for (const p of points) counts.set(p.title, (counts.get(p.title) || 0) + 1);
  const groups = [...counts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => (a.title === NO_ANSWER) - (b.title === NO_ANSWER) || b.count - a.count || a.title.localeCompare(b.title, "pt-BR"));
  const colorOf = new Map(groups.map((g, k) => [g.title, k < PALETTE.length ? PALETTE[k] : OTHER_COLOR]));
  const styleId = (title) => `g${groups.findIndex((g) => g.title === title)}`;

  const styles = useGroups
    ? groups.map((g) => `    <Style id="${styleId(g.title)}"><IconStyle><color>${colorOf.get(g.title)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`).join("\n")
    : `    <Style id="p"><IconStyle><Icon><href>https://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`;

  const placemark = ({ i, n, title }) => {
    const rows = [
      ["Nº", n],
      ["Data", fmtDate(whenOf(i))],
      ["Entrevistador", i.interviewer_name || "—"],
      ["Pesquisa", i.survey_title || "—"],
      ...(i.answers || []).map((a) => [
        a.question_text || "Pergunta",
        (Array.isArray(a.answer_array) && a.answer_array.length ? a.answer_array.join(", ") : a.answer) || "—",
      ]),
      ...(i.notes ? [["Observações", i.notes]] : []),
    ];
    const table = `<table>${rows.map(([k, v]) => `<tr><td valign="top"><b>${html(k)}</b></td><td>${html(v)}</td></tr>`).join("")}</table>`;
    const style = useGroups ? styleId(title) : "p";
    return `      <Placemark><name>${xml(title)}</name><styleUrl>#${style}</styleUrl><description><![CDATA[${table}]]></description><Point><coordinates>${Number(i.longitude)},${Number(i.latitude)},0</coordinates></Point></Placemark>`;
  };

  let body;
  if (useGroups) {
    body = groups.map((g) => {
      const items = points.filter((p) => p.title === g.title).map(placemark).join("\n");
      return `    <Folder><name>${xml(`${g.title} (${g.count})`)}</name>\n${items}\n    </Folder>`;
    }).join("\n");
  } else {
    body = points.map(placemark).join("\n");
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(docName)}</name>
${styles}
${body}
  </Document>
</kml>`;
  return { kml, points: points.length, groups };
}

export function downloadKML(kml, fileName) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([kml], { type: "application/vnd.google-earth.kml+xml" }));
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
