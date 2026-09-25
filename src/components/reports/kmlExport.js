// Exportação KML (Google Earth / Google My Maps) das entrevistas com localização.
//
// O título de cada ponto — o texto que aparece ao lado do alfinete no mapa —
// pode ser:
//   - a resposta de uma pergunta (ex.: bairro/localidade);
//   - o nome do entrevistador;
//   - o número da entrevista na pesquisa (Nº 1 = primeira da pesquisa; cada
//     pesquisa tem numeração própria, igual em qualquer filtro).
// Com "agrupar", os pontos ficam em pastas por título (ligar/desligar cada
// localidade no Google Earth) e cada grupo ganha uma cor de alfinete.
import { format } from "date-fns";
import {
  normalizeText, questionChoices, suggestLocalityQuestion, answerFor, interviewWhen, surveySequence,
} from "@/lib/surveyAnswers";

export { normalizeText, questionChoices, suggestLocalityQuestion, answerFor };

export const TITLE_MODES = {
  question: "Resposta de uma pergunta",
  interviewer: "Nome do entrevistador",
  order: "Número da entrevista na pesquisa (Nº 1, 2, 3...)",
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

// Coordenada válida (0,0 é "sem GPS", não um ponto no oceano).
const hasGeo = (i) => {
  if (i?.latitude == null || i?.longitude == null) return false;
  const lat = Number(i.latitude), lng = Number(i.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

const fmtDate = (d) => {
  const x = d ? new Date(d) : null;
  return x && !isNaN(x) ? format(x, "dd/MM/yyyy HH:mm") : "—";
};

/**
 * Monta o conteúdo do KML.
 * @param interviews  entrevistas (as sem localização são ignoradas)
 * @param opts.mode   "question" | "interviewer" | "order"
 * @param opts.choice pergunta escolhida (de questionChoices), quando mode = "question"
 * @param opts.group  separar em pastas e cores por título
 * @param opts.numbers Map(id -> Nº na pesquisa), calculado sobre TODAS as
 *                    entrevistas de cada pesquisa (surveySequence). Sem ele, a
 *                    numeração usa só as entrevistas recebidas.
 * @param opts.docName nome do documento no Google Earth
 * @returns { kml, points, groups: [{ title, count }] }
 */
export function buildKML(interviews, {
  mode = "interviewer", choice = null, group = true, numbers = null, docName = "Entrevistas",
} = {}) {
  const seq = numbers || surveySequence(interviews);
  const multiSurvey = new Set(interviews.filter(hasGeo).map((i) => i.survey_id)).size > 1;

  // Cada pesquisa tem numeração própria (Nº 1 = primeira entrevista DAQUELA
  // pesquisa). Com mais de uma pesquisa no arquivo, na ordem numérica cada
  // pesquisa vira uma pasta, para "Nº 12" não se repetir misturado.
  const points = interviews.filter(hasGeo)
    .map((i) => {
      const n = seq.get(i.id) ?? null;
      let title;
      if (mode === "order") title = n ? `Nº ${n}` : "Nº ?";
      else if (mode === "question") title = answerFor(i, choice) || NO_ANSWER;
      else title = (i.interviewer_name || "").trim() || "Sem entrevistador";
      const survey = (i.survey_title || "").trim() || "Pesquisa";
      const folder = mode === "order" ? (multiSurvey ? survey : null) : (group ? title : null);
      return { i, n, title, folder };
    })
    .sort((a, b) => (a.i.survey_title || "").localeCompare(b.i.survey_title || "", "pt-BR")
      || (a.n ?? 1e9) - (b.n ?? 1e9)
      || String(interviewWhen(a.i)).localeCompare(String(interviewWhen(b.i))));

  // Grupos (pastas + cores) do maior para o menor; "Sem resposta" por último.
  // Na ordem numérica, pastas por pesquisa em ordem alfabética.
  const counts = new Map();
  for (const p of points) if (p.folder != null) counts.set(p.folder, (counts.get(p.folder) || 0) + 1);
  const groups = [...counts.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => mode === "order"
      ? a.title.localeCompare(b.title, "pt-BR")
      : (a.title === NO_ANSWER) - (b.title === NO_ANSWER) || b.count - a.count || a.title.localeCompare(b.title, "pt-BR"));
  const useGroups = groups.length > 0;
  const colorOf = new Map(groups.map((g, k) => [g.title, k < PALETTE.length ? PALETTE[k] : OTHER_COLOR]));
  const styleId = (folder) => `g${groups.findIndex((g) => g.title === folder)}`;

  const styles = [
    `    <Style id="p"><IconStyle><Icon><href>https://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`,
    ...groups.map((g) => `    <Style id="${styleId(g.title)}"><IconStyle><color>${colorOf.get(g.title)}</color><scale>1.1</scale><Icon><href>https://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.9</scale></LabelStyle></Style>`),
  ].join("\n");

  const placemark = ({ i, n, title, folder }) => {
    const rows = [
      ["Nº na pesquisa", n ?? "—"],
      ["Data", fmtDate(interviewWhen(i))],
      ["Entrevistador", i.interviewer_name || "—"],
      ["Pesquisa", i.survey_title || "—"],
      ...(i.answers || []).map((a) => [
        a.question_text || "Pergunta",
        (Array.isArray(a.answer_array) && a.answer_array.length ? a.answer_array.join(", ") : a.answer) || "—",
      ]),
      ...(i.notes ? [["Observações", i.notes]] : []),
    ];
    const table = `<table>${rows.map(([k, v]) => `<tr><td valign="top"><b>${html(k)}</b></td><td>${html(v)}</td></tr>`).join("")}</table>`;
    const style = folder != null ? styleId(folder) : "p";
    return `      <Placemark><name>${xml(title)}</name><styleUrl>#${style}</styleUrl><description><![CDATA[${table}]]></description><Point><coordinates>${Number(i.longitude)},${Number(i.latitude)},0</coordinates></Point></Placemark>`;
  };

  const body = useGroups
    ? groups.map((g) => {
      const items = points.filter((p) => p.folder === g.title).map(placemark).join("\n");
      return `    <Folder><name>${xml(`${g.title} (${g.count})`)}</name>\n${items}\n    </Folder>`;
    }).join("\n")
    : points.map(placemark).join("\n");

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
