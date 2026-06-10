import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export default function InterviewEdit() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const [interview, setInterview] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u));
    if (!id) return;
    base44.entities.Interview.list().then(list => {
      const found = list.find(i => i.id === id);
      if (found) {
        setInterview(found);
        setAnswers(found.answers || []);
        setNotes(found.notes || "");
      }
    });
  }, [id]);

  const updateAnswer = (idx, field, value) => {
    const newAnswers = [...answers];
    newAnswers[idx] = { ...newAnswers[idx], [field]: value };
    setAnswers(newAnswers);
  };

  const buildDiff = () => {
    const changes = [];

    // Check notes change
    const oldNotes = interview.notes || "";
    if (notes.trim() !== oldNotes.trim()) {
      changes.push(`Observações alteradas: "${oldNotes.trim() || "(vazio)"}" → "${notes.trim() || "(vazio)"}"`);
    }

    // Check answer changes
    const oldAnswers = interview.answers || [];
    answers.forEach((a, i) => {
      const old = oldAnswers[i];
      if (!old) return;
      const oldVal = old.answer || "";
      const newVal = a.answer || "";
      if (oldVal !== newVal) {
        const label = a.question_text ? `"${a.question_text.slice(0, 40)}${a.question_text.length > 40 ? "…" : ""}"` : `Q${i + 1}`;
        changes.push(`${label}: "${oldVal || "(vazio)"}" → "${newVal || "(vazio)"}"`);
      }
    });

    return changes.length > 0 ? changes.join(" | ") : "Edição sem alterações detectadas";
  };

  const save = async () => {
    if (!interview) return;
    setSaving(true);
    const now = new Date().toISOString();
    const history = [...(interview.edit_history || []), {
      edited_at: now,
      edited_by: user?.email || "desconhecido",
      edited_by_name: user?.full_name || user?.email || "desconhecido",
      changes_summary: buildDiff(),
    }];
    await base44.entities.Interview.update(id, { answers, notes, edit_history: history });
    setSaving(false);
    navigate(createPageUrl(`InterviewDetail?id=${id}`));
  };

  if (!interview) return <div className="p-6 text-gray-400">Carregando...</div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl(`InterviewDetail?id=${id}`))}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Cancelar
        </Button>
        <h1 className="text-xl font-bold text-gray-900">Editar Entrevista</h1>
      </div>

      <Card className="border-0 shadow-sm border-orange-100 bg-orange-50">
        <CardContent className="p-4 text-sm text-orange-700">
          ⚠️ Qualquer alteração será registrada no histórico de edições com data, hora e nome do editor.
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Respostas</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {answers.map((a, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs text-gray-500 flex gap-2">
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">Q{i + 1}</span>
                <Badge variant="outline" className="text-xs">{a.question_type}</Badge>
              </Label>
              <p className="text-sm font-medium text-gray-700">{a.question_text}</p>
              {a.question_type === "aberta" ? (
                <Textarea value={a.answer || ""} onChange={e => updateAnswer(i, "answer", e.target.value)} rows={2} className="text-sm" />
              ) : (
                <Input value={a.answer || ""} onChange={e => updateAnswer(i, "answer", e.target.value)} className="text-sm" />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Observações adicionais..." />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 pb-10">
        <Button variant="outline" onClick={() => navigate(createPageUrl(`InterviewDetail?id=${id}`))}>Cancelar</Button>
        <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>
    </div>
  );
}