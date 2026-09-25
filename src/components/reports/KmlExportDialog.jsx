// Botão "Exportar KML" + janela para escolher o título dos pontos no mapa.
// Usado em Relatórios e em Entrevistas, sempre sobre as entrevistas já filtradas.
import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Download } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TITLE_MODES, buildKML, downloadKML, questionChoices, suggestLocalityQuestion,
} from "@/components/reports/kmlExport";
import { surveySequence } from "@/lib/surveyAnswers";

const PREFS_KEY = "kml_export_prefs";
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}"); } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } };

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

/**
 * @param interviews entrevistas a exportar (já filtradas pela tela)
 * @param surveys    pesquisas dessas entrevistas (fornecem a lista de perguntas)
 * @param allInterviews TODAS as entrevistas carregadas (sem filtro): a
 *                   numeração de cada pesquisa é feita sobre elas, então o Nº
 *                   de uma entrevista não muda conforme o filtro
 * @param docName    nome do documento no Google Earth
 */
export default function KmlExportDialog({
  interviews = [], allInterviews = null, surveys = [], docName = "Entrevistas", buttonProps = {},
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("question");
  const [questionKey, setQuestionKey] = useState("");
  const [group, setGroup] = useState(true);

  const withGeo = useMemo(() => interviews.filter((i) => i.latitude != null && i.longitude != null), [interviews]);
  // Só as pesquisas presentes na exportação oferecem perguntas.
  const choices = useMemo(() => {
    const ids = new Set(interviews.map((i) => i.survey_id));
    return questionChoices(surveys.filter((s) => ids.has(s.id)));
  }, [interviews, surveys]);
  const choice = choices.find((c) => c.key === questionKey) || null;
  const numbers = useMemo(() => surveySequence(allInterviews || interviews), [allInterviews, interviews]);

  // Ao abrir: repete a última escolha; sem ela, sugere a pergunta de
  // bairro/localidade; sem pergunta desse tipo, usa o entrevistador.
  useEffect(() => {
    if (!open) return;
    const prefs = loadPrefs();
    const remembered = choices.find((c) => c.key === prefs.questionKey);
    const locality = suggestLocalityQuestion(choices);
    const q = remembered || locality || choices[0] || null;
    setQuestionKey(q?.key || "");
    const wanted = prefs.mode || (locality ? "question" : "interviewer");
    setMode(wanted === "question" && !q ? "interviewer" : wanted);
    setGroup(prefs.group !== false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    if (!open || (mode === "question" && !choice)) return null;
    return buildKML(interviews, { mode, choice, group, numbers, docName });
  }, [open, interviews, mode, choice, group, numbers, docName]);

  const exportNow = () => {
    if (!preview || preview.points === 0) return;
    savePrefs({ mode, questionKey, group });
    const by = mode === "question" ? slug(choice?.text) || "pergunta" : mode === "order" ? "ordem" : "entrevistador";
    downloadKML(preview.kml, `entrevistas-${by}-${format(new Date(), "yyyyMMdd")}.kml`);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={withGeo.length === 0} {...buttonProps}>
        <MapIcon className="w-4 h-4 mr-2" /> Exportar KML
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Exportar KML</DialogTitle>
            <DialogDescription>
              Arquivo para o Google Earth ou Google My Maps com {withGeo.length} entrevista(s) com localização.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Título de cada ponto no mapa</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TITLE_MODES).map(([k, label]) => (
                    <SelectItem key={k} value={k} disabled={k === "question" && choices.length === 0}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "question" && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Pergunta</Label>
                <Select value={questionKey} onValueChange={setQuestionKey}>
                  <SelectTrigger><SelectValue placeholder="Escolha a pergunta" /></SelectTrigger>
                  <SelectContent>
                    {choices.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.text.length > 70 ? `${c.text.slice(0, 69)}…` : c.text}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode !== "order" ? (
              <label className="flex items-start gap-3 cursor-pointer">
                <Switch checked={group} onCheckedChange={setGroup} className="mt-0.5" />
                <span className="text-sm text-gray-700">
                  Separar em pastas e cores por título
                  <span className="block text-xs text-gray-400">
                    No Google Earth, cada {mode === "question" ? "resposta" : "entrevistador"} vira uma pasta que pode ser ligada/desligada, com alfinete de cor própria.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-gray-400">
                Cada pesquisa tem numeração própria, pela data de conclusão: Nº 1 é a primeira entrevista
                daquela pesquisa. O número de uma entrevista é sempre o mesmo, com ou sem filtros, e aparece
                também na lista de Entrevistas. Com mais de uma pesquisa, cada uma fica numa pasta.
              </p>
            )}

            {preview && mode !== "order" && preview.groups.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 mb-1.5">
                  {preview.groups.length} título(s) diferente(s) no mapa
                </p>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {preview.groups.map((g) => (
                    <span key={g.title} className="text-[11px] bg-white border border-gray-200 rounded-full px-2 py-0.5 text-gray-700">
                      {g.title} <span className="text-gray-400">({g.count})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button className="bg-blue-600 hover:bg-blue-700" onClick={exportNow} disabled={!preview || preview.points === 0}>
                <Download className="w-4 h-4 mr-2" /> Baixar KML
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
