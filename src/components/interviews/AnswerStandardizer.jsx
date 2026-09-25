// "Padronizar respostas": junta grafias diferentes da mesma resposta
// ("Alex da Piatã", "alex piatan", "Alex da piatam ") em uma só.
//
// O sistema SUGERE os grupos (answerClusters.js); o gestor confere cada um,
// desmarca o que não for a mesma coisa e escolhe a grafia padrão. Só então as
// entrevistas são alteradas, no servidor, com registro no histórico de cada uma.
import { useEffect, useMemo, useState } from "react";
import { Wand2, Check, Loader2, Search, Merge } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clusterAnswers, suggestStandard } from "@/lib/answerClusters";
import { normalizeText } from "@/lib/surveyAnswers";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
// Mostra o que não se vê: espaço sobrando e quebra de linha.
const hiddenMarks = (s) => {
  const raw = String(s ?? "");
  const marks = [];
  if (/\n/.test(raw)) marks.push("quebra de linha");
  if (/^\s|\s$/.test(raw.replace(/\n/g, ""))) marks.push("espaço sobrando");
  return marks;
};

// Respostas de UMA pergunta, exatamente como gravadas, com contagem.
function rawAnswers(interviews, questionIds) {
  const ids = new Set(questionIds);
  const counts = new Map();
  for (const i of interviews) {
    for (const a of i.answers || []) {
      if (!ids.has(a.question_id)) continue;
      const vals = Array.isArray(a.answer_array) && a.answer_array.length ? a.answer_array : [a.answer];
      for (const v of vals) {
        if (v == null || String(v).trim() === "") continue;
        counts.set(String(v), (counts.get(String(v)) || 0) + 1);
      }
    }
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}

export default function AnswerStandardizer({ interviews = [], surveys = [], defaultSurveyId, onApplied }) {
  const [open, setOpen] = useState(false);
  const [surveyId, setSurveyId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [picks, setPicks] = useState({});        // grupo -> { excluded: Set, target, custom }
  const [manualSel, setManualSel] = useState(new Set());
  const [manualTarget, setManualTarget] = useState("");
  const [manualEdited, setManualEdited] = useState(false); // o gestor já escreveu o padrão?
  const [manualSearch, setManualSearch] = useState("");
  const [busy, setBusy] = useState(null);         // id do grupo sendo aplicado | "all" | "manual"
  const [message, setMessage] = useState(null);

  const surveysWithData = useMemo(() => {
    const ids = new Set(interviews.map((i) => i.survey_id));
    return surveys.filter((s) => ids.has(s.id));
  }, [interviews, surveys]);
  const survey = surveysWithData.find((s) => s.id === surveyId) || null;
  const surveyInterviews = useMemo(() => interviews.filter((i) => i.survey_id === surveyId), [interviews, surveyId]);

  // Perguntas com a quantidade de grafias diferentes; as mais "bagunçadas" primeiro.
  const questions = useMemo(() => {
    if (!survey) return [];
    return [...(survey.questions || [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((q) => (q.text || "").trim())
      .map((q) => ({ ...q, distinct: rawAnswers(surveyInterviews, [q.id]).length }));
  }, [survey, surveyInterviews]);

  useEffect(() => {
    if (!open) return;
    const initial = surveysWithData.find((s) => s.id === defaultSurveyId) || surveysWithData[0];
    setSurveyId(initial?.id || "");
    setMessage(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ao trocar de pesquisa, sugere a pergunta aberta com mais grafias diferentes.
  useEffect(() => {
    if (!questions.length) { setQuestionId(""); return; }
    if (questions.some((q) => q.id === questionId)) return;
    const open = [...questions].filter((q) => q.type === "aberta").sort((a, b) => b.distinct - a.distinct)[0];
    setQuestionId((open || questions[0]).id);
  }, [questions]); // eslint-disable-line react-hooks/exhaustive-deps

  const values = useMemo(() => (questionId ? rawAnswers(surveyInterviews, [questionId]) : []), [surveyInterviews, questionId]);
  const groups = useMemo(() => clusterAnswers(values), [values]);

  useEffect(() => {
    setPicks({}); setManualSel(new Set()); setManualTarget(""); setManualEdited(false);
  }, [questionId, surveyId]);

  const pickOf = (g) => picks[g.id] || { excluded: new Set(), target: "suggested", custom: "" };
  const setPick = (g, patch) => setPicks((p) => ({ ...p, [g.id]: { ...pickOf(g), ...patch } }));
  const targetText = (g) => {
    const p = pickOf(g);
    if (p.target === "custom") return clean(p.custom);
    if (p.target === "suggested") return g.suggested;
    return clean(p.target);
  };
  const includedOf = (g) => g.variants.filter((v) => !pickOf(g).excluded.has(v.label));
  // Só muda o que ainda não está exatamente como o padrão.
  const toChange = (g) => includedOf(g).filter((v) => v.label !== targetText(g));

  const apply = async (from, to, key) => {
    if (!to) { alert("Escreva a resposta padrão."); return false; }
    if (!from.length) return false;
    const n = from.reduce((s, v) => s + v.count, 0);
    if (!confirm(
      `Trocar ${from.length} grafia(s) por "${to}" em ${n} resposta(s)?\n\n`
      + from.slice(0, 12).map((v) => `• "${clean(v.label)}" (${v.count})`).join("\n")
      + (from.length > 12 ? `\n• ... e mais ${from.length - 12}` : "")
      + "\n\nA alteração fica registrada no histórico de cada entrevista.",
    )) return false;
    setBusy(key);
    setMessage(null);
    try {
      const changed = await base44.answers.standardize({
        surveyId, questionIds: [questionId], from: from.map((v) => v.label), to,
      });
      setMessage(changed > 0
        ? { ok: true, text: `${changed} entrevista(s) atualizada(s): agora "${to}".` }
        : { ok: false, text: "Nenhuma entrevista foi alterada. Só administradores e supervisores da empresa podem padronizar respostas." });
      if (changed > 0) await onApplied?.();
      return changed > 0;
    } catch (e) {
      setMessage({ ok: false, text: `Não foi possível padronizar: ${e?.message || "tente novamente."}` });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const applyGroup = (g) => apply(toChange(g), targetText(g), g.id);
  const applyAll = async () => {
    const ready = groups.filter((g) => toChange(g).length && targetText(g));
    if (!ready.length) return;
    if (!confirm(`Padronizar ${ready.length} grupo(s) de uma vez?\n\n${ready.map((g) => `• "${targetText(g)}" (${toChange(g).length} grafia(s))`).join("\n")}\n\nA alteração fica registrada no histórico de cada entrevista.`)) return;
    setBusy("all");
    let total = 0;
    try {
      for (const g of ready) {
        total += await base44.answers.standardize({
          surveyId, questionIds: [questionId], from: toChange(g).map((v) => v.label), to: targetText(g),
        });
      }
      setMessage(total > 0
        ? { ok: true, text: `${ready.length} grupo(s) padronizado(s) em ${total} alteração(ões) de entrevista.` }
        : { ok: false, text: "Nenhuma entrevista foi alterada. Só administradores e supervisores da empresa podem padronizar respostas." });
      if (total > 0) await onApplied?.();
    } catch (e) {
      setMessage({ ok: false, text: `Parou no meio: ${e?.message || "erro"}. O que já foi aplicado ficou salvo; confira e tente de novo.` });
      await onApplied?.();
    } finally {
      setBusy(null);
    }
  };

  // Junção manual: o gestor marca quaisquer respostas e diz como devem ficar.
  const manualList = useMemo(() => {
    const q = normalizeText(manualSearch);
    return values.filter((v) => !q || normalizeText(v.label).includes(q));
  }, [values, manualSearch]);
  const manualChosen = values.filter((v) => manualSel.has(v.label));
  const toggleManual = (label) => {
    const next = new Set(manualSel);
    if (next.has(label)) next.delete(label); else next.add(label);
    setManualSel(next);
    // Sugere a grafia padrão enquanto o gestor não escreveu a dele.
    if (!manualEdited) {
      const chosen = values.filter((v) => next.has(v.label));
      setManualTarget(chosen.length ? suggestStandard(chosen) : "");
    }
  };
  const applyManual = async () => {
    const to = clean(manualTarget);
    const ok = await apply(manualChosen.filter((v) => v.label !== to), to, "manual");
    if (ok) { setManualSel(new Set()); setManualTarget(""); setManualEdited(false); }
  };

  const readyCount = groups.filter((g) => toChange(g).length && targetText(g)).length;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!interviews.length}>
        <Wand2 className="w-4 h-4 mr-2" /> Padronizar respostas
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Padronizar respostas</DialogTitle>
            <DialogDescription>
              Junta grafias diferentes da mesma resposta (maiúsculas, acentos, "da/de", abreviações e erros de digitação)
              em uma só. Você confere cada grupo e escolhe como deve ficar; nada muda antes de confirmar.
            </DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Pesquisa</Label>
              <Select value={surveyId} onValueChange={setSurveyId}>
                <SelectTrigger><SelectValue placeholder="Escolha a pesquisa" /></SelectTrigger>
                <SelectContent>
                  {surveysWithData.map((s) => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Pergunta</Label>
              <Select value={questionId} onValueChange={setQuestionId}>
                <SelectTrigger><SelectValue placeholder="Escolha a pergunta" /></SelectTrigger>
                <SelectContent>
                  {questions.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {(q.text.length > 60 ? `${q.text.slice(0, 59)}…` : q.text)} ({q.distinct} grafias)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {message && (
            <p className={`text-sm rounded-lg px-3 py-2 ${message.ok ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
              {message.text}
            </p>
          )}

          <Tabs defaultValue="sugestoes">
            <TabsList>
              <TabsTrigger value="sugestoes">Sugestões ({groups.length})</TabsTrigger>
              <TabsTrigger value="manual">Juntar manualmente</TabsTrigger>
            </TabsList>

            <TabsContent value="sugestoes" className="space-y-3">
              {groups.length === 0 ? (
                <p className="text-sm text-gray-400 py-4">
                  Nenhuma grafia parecida encontrada nesta pergunta. Para juntar respostas diferentes (ex.: "Alex" com
                  "Alex Piatã"), use "Juntar manualmente".
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-gray-500">
                      Desmarque o que NÃO for a mesma resposta e escolha a grafia padrão de cada grupo.
                    </p>
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={applyAll} disabled={!!busy || !readyCount}>
                      {busy === "all" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                      Padronizar todos ({readyCount})
                    </Button>
                  </div>

                  {groups.map((g) => {
                    const p = pickOf(g);
                    const changing = toChange(g);
                    const target = targetText(g);
                    const answersToChange = changing.reduce((s, v) => s + v.count, 0);
                    return (
                      <div key={g.id} className="border rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-gray-800">
                            "{g.suggested}" <span className="font-normal text-gray-400">· {g.variants.length} grafias · {g.total} respostas</span>
                          </p>
                          <Button size="sm" variant="outline" onClick={() => applyGroup(g)} disabled={!!busy || !changing.length || !target}>
                            {busy === g.id ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
                            {changing.length ? `Padronizar ${answersToChange} resposta(s)` : "Já padronizado"}
                          </Button>
                        </div>

                        <div className="grid gap-1">
                          {g.variants.map((v) => {
                            const included = !p.excluded.has(v.label);
                            const marks = hiddenMarks(v.label);
                            return (
                              <div key={v.label} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={included}
                                  onCheckedChange={(c) => {
                                    const excluded = new Set(p.excluded);
                                    if (c) excluded.delete(v.label); else excluded.add(v.label);
                                    setPick(g, { excluded });
                                  }}
                                />
                                <span className={`flex-1 min-w-0 truncate ${included ? "text-gray-800" : "text-gray-400 line-through"}`}>
                                  {clean(v.label)}
                                  {marks.map((m) => <span key={m} className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 rounded px-1">{m}</span>)}
                                </span>
                                <span className="text-xs text-gray-400 tabular-nums">{v.count}</span>
                                <button
                                  type="button"
                                  onClick={() => setPick(g, { target: clean(v.label) })}
                                  className={`text-[11px] rounded-full px-2 py-0.5 border ${target === clean(v.label) ? "bg-blue-600 text-white border-blue-600" : "text-gray-500 border-gray-200 hover:border-blue-300"}`}
                                  title="Usar esta grafia como padrão"
                                >
                                  {target === clean(v.label) ? "padrão" : "usar como padrão"}
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 shrink-0">Ou escreva:</span>
                          <Input
                            className="h-8 text-sm"
                            placeholder="Outra grafia padrão"
                            value={p.target === "custom" ? p.custom : ""}
                            onChange={(e) => setPick(g, { target: "custom", custom: e.target.value })}
                          />
                        </div>
                        <p className="text-[11px] text-gray-400">
                          Vai ficar: <strong className="text-gray-700">{target ? `"${target}"` : "—"}</strong>
                          {changing.length > 0 && ` · ${changing.length} grafia(s) serão trocadas`}
                        </p>
                      </div>
                    );
                  })}
                </>
              )}
            </TabsContent>

            <TabsContent value="manual" className="space-y-3">
              <p className="text-xs text-gray-500">
                Marque as respostas que são a mesma coisa (mesmo que o sistema não tenha sugerido) e escreva como devem ficar.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input className="pl-9" placeholder="Filtrar respostas..." value={manualSearch} onChange={(e) => setManualSearch(e.target.value)} />
              </div>
              <div className="border rounded-xl max-h-72 overflow-y-auto divide-y">
                {manualList.map((v) => {
                  const marks = hiddenMarks(v.label);
                  return (
                    <label key={v.label} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50">
                      <Checkbox checked={manualSel.has(v.label)} onCheckedChange={() => toggleManual(v.label)} />
                      <span className="flex-1 min-w-0 truncate">
                        {clean(v.label)}
                        {marks.map((m) => <span key={m} className="ml-1.5 text-[10px] text-amber-600 bg-amber-50 rounded px-1">{m}</span>)}
                      </span>
                      <span className="text-xs text-gray-400 tabular-nums">{v.count}</span>
                    </label>
                  );
                })}
                {manualList.length === 0 && <p className="text-sm text-gray-400 p-3">Nenhuma resposta.</p>}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <Input
                  className="sm:flex-1"
                  placeholder="Como devem ficar (resposta padrão)"
                  value={manualTarget}
                  onChange={(e) => { setManualTarget(e.target.value); setManualEdited(true); }}
                />
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={applyManual} disabled={!!busy || manualChosen.length < 1 || !clean(manualTarget)}>
                  {busy === "manual" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Merge className="w-4 h-4 mr-1.5" />}
                  Juntar {manualChosen.length} resposta(s)
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
