// Editor do plano amostral da pesquisa.
//
// Responde às duas perguntas do pesquisador antes do campo:
//   QUANTAS entrevistas são necessárias para a margem de erro desejada, e
//   QUAIS grupos precisam ser entrevistados para a amostra representar o
//   universo (cotas por estrato).
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Target, AlertTriangle, Wand2, Users } from "lucide-react";
import { buildSamplePlan, CONFIDENCE_LEVELS, fmtPct } from "@/lib/sampling";
import { uuidv4 } from "@/lib/uuid";

// Opções discretas de uma questão, para preencher os grupos automaticamente.
const optionsOfQuestion = (q) => {
  if (!q) return [];
  if (q.type === "sim_nao") return ["Sim", "Não"];
  if (q.type === "escala") return ["1", "2", "3", "4", "5"];
  return (q.options || []).map(o => String(o || "").trim()).filter(Boolean);
};

export default function SamplePlanEditor({ survey, onChange }) {
  const questions = survey.questions || [];
  // Só questões de resposta discreta servem como estrato.
  const eligible = questions.filter(q => ["unica_escolha", "sim_nao", "escala"].includes(q.type));

  const plan = useMemo(() => buildSamplePlan({
    ...survey,
    target_interviews: survey.target_interviews === "" ? null : survey.target_interviews,
    population_size: survey.population_size === "" ? null : survey.population_size,
    target_margin: survey.target_margin === "" ? null : survey.target_margin,
    design_effect: survey.design_effect === "" ? null : survey.design_effect,
  }), [survey]);

  const set = (patch) => onChange(s => ({ ...s, ...patch }));
  const setStrata = (fn) => onChange(s => ({ ...s, strata: fn(Array.isArray(s.strata) ? s.strata : []) }));

  const addStratum = () => setStrata(list => [...list, { id: uuidv4(), label: "", question_id: "", groups: [] }]);
  const removeStratum = (id) => setStrata(list => list.filter(s => s.id !== id));
  const patchStratum = (id, patch) => setStrata(list => list.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const addGroup = (id) => setStrata(list => list.map(s =>
    s.id === id ? { ...s, groups: [...(s.groups || []), { label: "", share: "" }] } : s));
  const patchGroup = (id, i, patch) => setStrata(list => list.map(s =>
    s.id === id ? { ...s, groups: s.groups.map((g, gi) => (gi === i ? { ...g, ...patch } : g)) } : s));
  const removeGroup = (id, i) => setStrata(list => list.map(s =>
    s.id === id ? { ...s, groups: s.groups.filter((_, gi) => gi !== i) } : s));

  // Cria os grupos a partir das alternativas da questão vinculada, dividindo
  // o universo igualmente — o pesquisador então ajusta os percentuais reais.
  const fillFromQuestion = (stratum) => {
    const q = questions.find(x => x.id === stratum.question_id);
    const opts = optionsOfQuestion(q);
    if (!opts.length) { alert("A questão escolhida não tem alternativas para importar."); return; }
    const share = Number((100 / opts.length).toFixed(2));
    patchStratum(stratum.id, {
      label: stratum.label || (q.text || "").slice(0, 40),
      groups: opts.map(o => ({ label: o, share })),
    });
  };

  const applySuggested = () => set({ target_interviews: String(plan.suggested) });

  const strata = Array.isArray(survey.strata) ? survey.strata : [];
  const planStratum = (id) => plan.strata.find(s => s.id === id);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-blue-600" /> Plano amostral
        </CardTitle>
        <p className="text-[11px] text-gray-500">
          Informe o universo para calcular a margem de erro com correção de população finita e dimensionar a amostra.
          Os estratos geram as cotas de campo e permitem medir a representatividade real no relatório final.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Universo (público-alvo)</Label>
            <Input
              type="number" min="0" placeholder="Ex: 14000"
              value={survey.population_size ?? ""}
              onChange={e => set({ population_size: e.target.value })}
            />
            <p className="text-[10px] text-gray-400 mt-1">Total de pessoas que a pesquisa representa (ex.: eleitorado).</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Nível de confiança</Label>
            <Select
              value={String(survey.confidence_level || 95)}
              onValueChange={v => set({ confidence_level: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONFIDENCE_LEVELS.map(c => <SelectItem key={c} value={String(c)}>{c}%</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Efeito de desenho</Label>
            <Input
              type="number" min="1" step="0.1" placeholder="1,0"
              value={survey.design_effect ?? ""}
              onChange={e => set({ design_effect: e.target.value })}
            />
            <p className="text-[10px] text-gray-400 mt-1">1,0 = aleatória simples. Use 1,2–1,5 se concentrar entrevistas em poucos pontos.</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Margem desejada (±%)</Label>
            <Input
              type="number" min="0.1" step="0.1" placeholder="Ex: 4"
              value={survey.target_margin ?? ""}
              onChange={e => set({ target_margin: e.target.value })}
            />
          </div>
        </div>

        {/* Resultado do dimensionamento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3.5">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Com a meta atual</p>
            {plan.n ? (
              <>
                <p className="text-2xl font-bold text-blue-700 leading-tight mt-0.5">±{fmtPct(plan.margin)}</p>
                <p className="text-[11px] text-gray-600 mt-1">
                  {plan.n} entrevistas{plan.N ? ` em um universo de ${plan.N.toLocaleString("pt-BR")}` : ""} ·
                  confiança de {plan.confidence}%{plan.deff > 1 ? ` · deff ${String(plan.deff).replace(".", ",")}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Defina a meta total de entrevistas.</p>
            )}
          </div>
          <div className="bg-gray-50 border rounded-lg p-3.5">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">Para a margem desejada</p>
            {plan.suggested ? (
              <>
                <p className="text-2xl font-bold text-gray-800 leading-tight mt-0.5">{plan.suggested} entrevistas</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <p className="text-[11px] text-gray-600 flex-1">
                    Necessário para ±{String(plan.targetMargin).replace(".", ",")}% com confiança de {plan.confidence}%.
                  </p>
                  {String(plan.suggested) !== String(survey.target_interviews || "") && (
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={applySuggested}>
                      Usar como meta
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 mt-1">Informe a margem desejada para dimensionar a amostra.</p>
            )}
          </div>
        </div>

        {/* Estratos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <Label className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" /> Estratificação
              </Label>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Sexo, zona, faixa etária, escolaridade… Informe a participação de cada grupo no universo.
              </p>
            </div>
            <Button size="sm" variant="outline" className="text-xs" onClick={addStratum}>
              <Plus className="w-3 h-3 mr-1" /> Estrato
            </Button>
          </div>

          {strata.length === 0 ? (
            <p className="text-xs text-gray-400 border border-dashed rounded-lg py-6 text-center">
              Nenhum estrato definido. Sem estratos, o relatório informa apenas a margem nominal.
            </p>
          ) : (
            <div className="space-y-3">
              {strata.map(s => {
                const ps = planStratum(s.id);
                const sum = (s.groups || []).reduce((a, g) => a + (Number(g.share) || 0), 0);
                const sumOk = Math.abs(sum - 100) < 0.5;
                return (
                  <div key={s.id} className="border rounded-lg p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1 h-8 text-sm" placeholder="Nome do estrato (ex: Sexo)"
                        value={s.label || ""}
                        onChange={e => patchStratum(s.id, { label: e.target.value })}
                      />
                      <Select
                        value={s.question_id || "none"}
                        onValueChange={v => patchStratum(s.id, { question_id: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="h-8 text-xs w-56"><SelectValue placeholder="Questão vinculada" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem questão vinculada</SelectItem>
                          {eligible.map(q => (
                            <SelectItem key={q.id} value={q.id}>
                              Q{questions.findIndex(x => x.id === q.id) + 1}: {(q.text || "Sem texto").slice(0, 35)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" title="Importar alternativas da questão" onClick={() => fillFromQuestion(s)} disabled={!s.question_id}>
                        <Wand2 className="w-4 h-4 text-blue-500" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeStratum(s.id)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>

                    {!s.question_id && (
                      <p className="text-[10px] text-amber-600 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Sem questão vinculada este estrato entra só nas cotas; o relatório não consegue medir o realizado.
                      </p>
                    )}

                    <div className="space-y-1.5">
                      {(s.groups || []).map((g, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            className="flex-1 h-8 text-sm" placeholder="Grupo (ex: Masculino)"
                            value={g.label || ""}
                            onChange={e => patchGroup(s.id, i, { label: e.target.value })}
                          />
                          <div className="relative w-24">
                            <Input
                              type="number" min="0" max="100" step="0.1"
                              className="h-8 text-sm pr-6" placeholder="%"
                              value={g.share ?? ""}
                              onChange={e => patchGroup(s.id, i, { share: e.target.value })}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                          </div>
                          <span className="text-xs text-gray-500 w-28 text-right shrink-0">
                            {ps?.groups?.[i]?.quota != null ? `${ps.groups[i].quota} entrev.` : "—"}
                          </span>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => removeGroup(s.id, i)}>
                            <Trash2 className="w-3.5 h-3.5 text-gray-300" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex items-center justify-between pt-0.5">
                        <Button size="sm" variant="ghost" className="text-xs h-7 text-blue-600" onClick={() => addGroup(s.id)}>
                          <Plus className="w-3 h-3 mr-1" /> Grupo
                        </Button>
                        {(s.groups || []).length > 0 && (
                          <span className={`text-[11px] ${sumOk ? "text-gray-400" : "text-amber-600 font-medium"}`}>
                            Soma: {sum.toFixed(1).replace(".", ",")}%{sumOk ? "" : " — deveria somar 100%"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
