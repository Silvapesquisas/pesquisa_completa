import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Upload, Loader2, ClipboardPaste, Shuffle, ChevronUp, ChevronDown, Trash2, HelpCircle,
} from "lucide-react";
import {
  DEFAULTS, parseQuestionsFromText, parseQuestionsFromXlsx, parseQuestionsFromDocx,
} from "@/lib/questionImport";

const TYPE_LABEL = {
  aberta: "Aberta", multipla_escolha: "Múltipla", unica_escolha: "Única",
  escala: "Escala", sim_nao: "Sim/Não",
};

const EXAMPLE = `P1. Qual seu grau de satisfação com o serviço? *
Ótimo = 5
Bom = 4
Regular = 3
Ruim = 2
Péssimo = 1

[multi] Quais meios de transporte você utiliza?
Ônibus
Carro
Bicicleta
A pé

Você aprova a atual gestão?
Sim
Não

Qual sugestão você daria?`;

export default function QuestionImporter({ open, onClose, onImport, existingCount = 0 }) {
  const [tab, setTab] = useState("texto");
  const [text, setText] = useState("");
  const [opts, setOpts] = useState(DEFAULTS);
  const [fileQuestions, setFileQuestions] = useState(null); // resultado do arquivo
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState("end"); // end | start | after
  const [afterIndex, setAfterIndex] = useState(existingCount);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setOpts(o => ({ ...o, [k]: v }));

  // Pré-visualização ao vivo (texto) ou resultado do arquivo já lido.
  const parsed = useMemo(() => {
    if (tab === "arquivo") return fileQuestions || [];
    try { return parseQuestionsFromText(text, opts); } catch { return []; }
  }, [tab, text, opts, fileQuestions]);

  // Lista editável antes de confirmar (ordem/remoção)
  const [edited, setEdited] = useState(null);
  const list = edited ?? parsed;
  const resetEdits = () => setEdited(null);

  const move = (i, dir) => {
    const arr = [...list];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setEdited(arr);
  };
  const remove = (i) => setEdited(list.filter((_, idx) => idx !== i));
  const toggleRandom = (i) => {
    const arr = [...list];
    arr[i] = { ...arr[i], randomize_options: !arr[i].randomize_options };
    setEdited(arr);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(""); setLoading(true); setFileName(file.name); resetEdits();
    try {
      const isXlsx = /\.(xlsx|xlsm|xls|csv)$/i.test(file.name);
      const qs = isXlsx
        ? await parseQuestionsFromXlsx(file, opts)
        : await parseQuestionsFromDocx(file, opts);
      setFileQuestions(qs);
      if (qs.length === 0) setError("Nenhuma questão reconhecida no arquivo. Confira o formato ou use a aba Escrever/Colar.");
    } catch (e) {
      setError("Não foi possível ler o arquivo: " + (e?.message || "formato não suportado."));
      setFileQuestions([]);
    }
    setLoading(false);
  };

  const confirm = () => {
    if (list.length === 0) return;
    onImport(list, position === "after" ? { at: Number(afterIndex) } : { at: position === "start" ? 0 : null });
    reset();
  };

  const reset = () => {
    setText(""); setFileQuestions(null); setFileName(""); setError("");
    setEdited(null); setTab("texto"); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" /> Importar questões
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={t => { setTab(t); resetEdits(); }}>
          <TabsList>
            <TabsTrigger value="texto"><FileText className="w-4 h-4 mr-1" /> Escrever / Colar</TabsTrigger>
            <TabsTrigger value="arquivo"><Upload className="w-4 h-4 mr-1" /> Arquivo (XLSX / DOCX)</TabsTrigger>
          </TabsList>

          <TabsContent value="texto" className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-gray-500">Cole ou escreva o questionário</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setText(EXAMPLE)} className="text-xs text-blue-600 hover:underline">Usar exemplo</button>
                <button type="button" onClick={() => setShowHelp(v => !v)} className="text-xs text-gray-500 hover:text-blue-600 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" /> Como formatar
                </button>
              </div>
            </div>
            {showHelp && (
              <div className="text-[11px] text-gray-600 bg-blue-50 rounded-lg p-3 space-y-1">
                <p><strong>Estrutura:</strong> a 1ª linha do bloco é o enunciado; as linhas seguintes são as alternativas. Separe as questões com uma linha em branco.</p>
                <p><strong>Opcionais:</strong> <code>*</code> no fim do enunciado = obrigatória · <code>[multi]</code> no início = múltipla escolha · <code>P1.</code> ou <code>[etiqueta]</code> = identificador · <code>Ótimo = 5</code> = valor do item.</p>
                <p><strong>Automático:</strong> sem alternativas vira <em>Aberta</em>; “Sim/Não” vira <em>Sim/Não</em>; 1 a 5 vira <em>Escala</em>.</p>
              </div>
            )}
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); resetEdits(); }}
              placeholder={EXAMPLE}
              className="font-mono text-xs h-56"
            />
          </TabsContent>

          <TabsContent value="arquivo" className="space-y-2">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls,.csv,.docx"
                onChange={e => handleFile(e.target.files?.[0])}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Escolher arquivo
              </Button>
              {fileName && <p className="text-xs text-gray-500 mt-2">{fileName}</p>}
              <p className="text-[11px] text-gray-400 mt-3">
                <strong>XLSX:</strong> colunas <em>Questão · Tipo · Etiqueta · Opção · Valor</em> (uma linha por alternativa),
                ou <em>Questão</em> na 1ª coluna e as alternativas nas colunas seguintes.<br />
                <strong>DOCX:</strong> o texto é lido e interpretado como na aba “Escrever / Colar”.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Opções de leitura */}
        <div className="border rounded-lg p-3 space-y-3">
          <p className="text-xs font-medium text-gray-700">Opções de importação</p>

          {tab === "texto" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-gray-500 mb-1 block">Separador de questões</Label>
                <Select value={opts.questionDelimiter} onValueChange={v => { set("questionDelimiter", v); resetEdits(); }}>
                  <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blank">Linha em branco</SelectItem>
                    <SelectItem value="---">Linha com ---</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {opts.questionDelimiter === "custom" && (
                  <Input className="mt-1 text-xs h-8" value={opts.customQuestionDelimiter}
                    onChange={e => { set("customQuestionDelimiter", e.target.value); resetEdits(); }} placeholder="ex.: ###" />
                )}
              </div>
              <div>
                <Label className="text-[11px] text-gray-500 mb-1 block">Separador de alternativas</Label>
                <Select value={opts.optionDelimiter} onValueChange={v => { set("optionDelimiter", v); resetEdits(); }}>
                  <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newline">Quebra de linha</SelectItem>
                    <SelectItem value=";">Ponto e vírgula (;)</SelectItem>
                    <SelectItem value="|">Barra vertical (|)</SelectItem>
                    <SelectItem value=",">Vírgula (,)</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                {opts.optionDelimiter === "custom" && (
                  <Input className="mt-1 text-xs h-8" value={opts.customOptionDelimiter}
                    onChange={e => { set("customOptionDelimiter", e.target.value); resetEdits(); }} placeholder="ex.: /" />
                )}
              </div>
              <div>
                <Label className="text-[11px] text-gray-500 mb-1 block">Separador do valor</Label>
                <Input className="text-xs h-9" value={opts.valueSeparator}
                  onChange={e => { set("valueSeparator", e.target.value); resetEdits(); }} placeholder="=" />
                <p className="text-[10px] text-gray-400 mt-1">Ex.: “Ótimo = 5”.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <Switch checked={opts.parseValues} onCheckedChange={v => { set("parseValues", v); resetEdits(); }} />
              Importar <strong>valor</strong> dos itens
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <Switch checked={opts.parseLabels} onCheckedChange={v => { set("parseLabels", v); resetEdits(); }} />
              Importar <strong>etiqueta</strong> (identificador)
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <Switch checked={opts.randomizeOptions} onCheckedChange={v => { set("randomizeOptions", v); resetEdits(); }} />
              <Shuffle className="w-3 h-3" /> Randomizar ordem das alternativas
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <Switch checked={opts.allRequired} onCheckedChange={v => { set("allRequired", v); resetEdits(); }} />
              Marcar todas como <strong>obrigatórias</strong>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-gray-500 mb-1 block">Tipo padrão (quando há alternativas)</Label>
              <Select value={opts.defaultType} onValueChange={v => { set("defaultType", v); resetEdits(); }}>
                <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unica_escolha">Única escolha</SelectItem>
                  <SelectItem value="multipla_escolha">Múltipla escolha</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-gray-500 mb-1 block">Posição no questionário</Label>
              <div className="flex gap-2">
                <Select value={position} onValueChange={setPosition}>
                  <SelectTrigger className="text-xs h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="end">No fim</SelectItem>
                    <SelectItem value="start">No início</SelectItem>
                    <SelectItem value="after" disabled={existingCount === 0}>Após a questão…</SelectItem>
                  </SelectContent>
                </Select>
                {position === "after" && (
                  <Input type="number" min={1} max={existingCount} value={afterIndex}
                    onChange={e => setAfterIndex(e.target.value)} className="w-20 text-xs h-9" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Pré-visualização */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-700">
              Pré-visualização <Badge variant="secondary">{list.length}</Badge>
            </p>
            {edited && <button type="button" onClick={resetEdits} className="text-[11px] text-gray-400 hover:text-blue-600">Desfazer ajustes</button>}
          </div>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          {list.length === 0 ? (
            <p className="text-xs text-gray-400 border rounded-lg p-4 text-center">
              {tab === "texto" ? "Escreva ou cole o questionário acima para ver a prévia." : "Escolha um arquivo para ver a prévia."}
            </p>
          ) : (
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {list.map((q, i) => (
                <div key={q.id} className="p-2.5 flex items-start gap-2">
                  <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 mt-0.5 shrink-0">Q{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 truncate">
                      {q.label && <span className="text-blue-600 font-medium">[{q.label}] </span>}
                      {q.text}
                      {q.required && <span className="text-red-500"> *</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {TYPE_LABEL[q.type] || q.type}
                      {q.options?.length > 0 && ` · ${q.options.length} alternativas`}
                      {q.option_values && " · com valores"}
                      {q.randomize_options && " · randomizada"}
                    </p>
                    {q.options?.length > 0 && (
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                        {q.options.map((o, oi) => q.option_values?.[oi] ? `${o} (${q.option_values[oi]})` : o).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => toggleRandom(i)}
                      title="Randomizar alternativas desta questão" disabled={!q.options?.length}>
                      <Shuffle className={`w-3 h-3 ${q.randomize_options ? "text-blue-600" : "text-gray-300"}`} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ChevronUp className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                      <ChevronDown className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => remove(i)}>
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={confirm} disabled={list.length === 0}>
            Importar {list.length > 0 ? `${list.length} questão(ões)` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
