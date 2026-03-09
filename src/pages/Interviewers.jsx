import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Plus, UserCheck, UserX, Pencil, Trash2,
  ClipboardList, Phone, MapPin, BarChart2, Copy, KeyRound
} from "lucide-react";

const PLAN_LIMITS = { basico: 5, profissional: 20, enterprise: 999 };

function generateCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function Interviewers() {
  const [fieldUsers, setFieldUsers] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [company, setCompany] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newForm, setNewForm] = useState({ name: "", role: "entrevistador", region: "", phone: "", notes: "" });
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);

  const load = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);

    let companyId = me?.company_id;
    let co = null;
    if (companyId) {
      const cos = await base44.entities.Company.filter({ id: companyId });
      if (cos.length > 0) co = cos[0];
    }
    setCompany(co);

    const [fu, sv, iv] = await Promise.all([
      companyId
        ? base44.entities.FieldUser.filter({ company_id: companyId })
        : base44.entities.FieldUser.list(),
      companyId
        ? base44.entities.Survey.filter({ company_id: companyId })
        : base44.entities.Survey.list(),
      companyId
        ? base44.entities.Interview.filter({ company_id: companyId }, "-created_date", 200)
        : base44.entities.Interview.list("-created_date", 200),
    ]);
    setFieldUsers(fu);
    setSurveys(sv);
    setInterviews(iv);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = currentUser?.role === "admin";
  const maxInterviewers = company ? (company.max_interviewers || PLAN_LIMITS[company.plan] || 5) : 5;
  const activeCount = fieldUsers.filter(u => u.active !== false).length;
  const canAddMore = activeCount < maxInterviewers;

  const filtered = fieldUsers.filter(u => {
    const matchSearch = (u.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.access_code || "").includes(search);
    const matchStatus = filterStatus === "todos" ||
      (filterStatus === "ativo" && u.active !== false) ||
      (filterStatus === "inativo" && u.active === false);
    return matchSearch && matchStatus;
  });

  const toggleActive = async (u) => {
    await base44.entities.FieldUser.update(u.id, { active: !u.active });
    load();
  };

  const createUser = async () => {
    if (!newForm.name) return;
    if (!canAddMore) {
      alert(`Limite de ${maxInterviewers} entrevistadores atingido.`);
      return;
    }
    setSaving(true);
    const code = generateCode();
    await base44.entities.FieldUser.create({
      ...newForm,
      access_code: code,
      company_id: currentUser?.company_id || "",
      company_name: company?.name || "",
      active: true,
      assigned_survey_ids: [],
    });
    setSaving(false);
    setFormOpen(false);
    setNewForm({ name: "", role: "entrevistador", region: "", phone: "", notes: "" });
    load();
  };

  const openEdit = (u) => {
    setEditData({
      name: u.name || "",
      role: u.role || "entrevistador",
      region: u.region || "",
      phone: u.phone || "",
      notes: u.notes || "",
      active: u.active !== false,
      assigned_survey_ids: u.assigned_survey_ids || [],
      survey_interview_limits: u.survey_interview_limits || {},
    });
    setSelectedUser(u);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    await base44.entities.FieldUser.update(selectedUser.id, editData);
    setSaving(false);
    setEditOpen(false);
    load();
  };

  const deleteUser = async (u) => {
    if (!confirm(`Excluir ${u.name}? Esta ação não pode ser desfeita.`)) return;
    await base44.entities.FieldUser.delete(u.id);
    load();
  };

  const openDetail = (u) => {
    setSelectedUser(u);
    setDetailOpen(true);
  };

  const getUserInterviews = (u) =>
    interviews.filter(i => i.field_user_id === u.id || i.interviewer_name === u.name);

  const toggleSurveyAssign = (surveyId) => {
    const curr = editData.assigned_survey_ids || [];
    const has = curr.includes(surveyId);
    setEditData(prev => ({
      ...prev,
      assigned_survey_ids: has ? curr.filter(id => id !== surveyId) : [...curr, surveyId],
    }));
  };

  const copyCode = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entrevistadores</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activeCount} ativos · Limite: {maxInterviewers}
            {company && <span className="ml-2 text-xs text-blue-500 capitalize">Plano {company.plan}</span>}
          </p>
        </div>
        {isAdmin && (
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => setFormOpen(true)}
            disabled={!canAddMore}
            title={!canAddMore ? `Limite de ${maxInterviewers} atingido` : ""}
          >
            <Plus className="w-4 h-4 mr-2" /> Cadastrar Entrevistador
          </Button>
        )}
      </div>

      {!canAddMore && isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          ⚠️ Limite de {maxInterviewers} entrevistadores atingido. Faça upgrade para adicionar mais.
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-lg flex items-start gap-2">
        <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
        <span>Cada entrevistador recebe um <strong>código de 8 dígitos</strong> para acessar o App de Campo. Compartilhe o código com eles.</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar por nome ou código..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ativo">Ativos</SelectItem>
            <SelectItem value="inativo">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Nenhum entrevistador encontrado.</p>
          {isAdmin && <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={() => setFormOpen(true)}><Plus className="w-4 h-4 mr-2" />Cadastrar primeiro entrevistador</Button>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => {
            const userInterviews = getUserInterviews(u);
            const completed = userInterviews.filter(i => i.status === "concluida").length;
            const assignedCount = (u.assigned_survey_ids || []).length;
            return (
              <Card key={u.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{u.name}</span>
                      <Badge variant={u.role === "supervisor" ? "secondary" : "outline"} className="text-xs capitalize">
                        {u.role}
                      </Badge>
                      {u.active === false
                        ? <Badge variant="destructive" className="text-xs">Inativo</Badge>
                        : <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-0">Ativo</Badge>
                      }
                    </div>
                    {/* Access Code */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-xs text-gray-500">Código:</span>
                      <code className="text-sm font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded tracking-widest">
                        {u.access_code}
                      </code>
                      <button
                        onClick={() => copyCode(u.access_code, u.id)}
                        className="text-gray-400 hover:text-blue-600 transition-colors"
                        title="Copiar código"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {copiedCode === u.id && <span className="text-xs text-green-600">Copiado!</span>}
                    </div>
                    <div className="flex gap-4 mt-1.5 text-xs text-gray-500 flex-wrap">
                      {u.region && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{u.region}</span>}
                      {u.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone}</span>}
                      <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />{completed} entrevistas</span>
                      <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" />{assignedCount} pesquisas</span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline" className="text-xs" onClick={() => openDetail(u)}>
                      Ver histórico
                    </Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                          {u.active === false
                            ? <UserCheck className="w-4 h-4 text-green-500" />
                            : <UserX className="w-4 h-4 text-red-400" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteUser(u)}>
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New User Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar Entrevistador</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Nome Completo *</Label>
              <Input value={newForm.name} onChange={e => setNewForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do entrevistador" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Função</Label>
              <Select value={newForm.role} onValueChange={v => setNewForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrevistador">Entrevistador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Região</Label>
                <Input value={newForm.region} onChange={e => setNewForm(p => ({ ...p, region: e.target.value }))} placeholder="Ex: SP, RJ..." />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Telefone</Label>
                <Input value={newForm.phone} onChange={e => setNewForm(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Observações</Label>
              <Input value={newForm.notes} onChange={e => setNewForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notas internas..." />
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 flex items-center gap-2">
              <KeyRound className="w-4 h-4 shrink-0" />
              Um código de 8 dígitos será gerado automaticamente.
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={createUser} disabled={saving || !newForm.name}>
              {saving ? "Cadastrando..." : "Cadastrar e Gerar Código"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar: {selectedUser?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Nome</Label>
              <Input value={editData.name || ""} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Função</Label>
              <Select value={editData.role || "entrevistador"} onValueChange={v => setEditData(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrevistador">Entrevistador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Região</Label>
                <Input value={editData.region || ""} onChange={e => setEditData(p => ({ ...p, region: e.target.value }))} placeholder="Ex: SP, RJ..." />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Telefone</Label>
                <Input value={editData.phone || ""} onChange={e => setEditData(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Observações</Label>
              <Input value={editData.notes || ""} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} placeholder="Notas internas..." />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-2 block">Pesquisas Atribuídas e Limites Personalizados</Label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto border-2 border-blue-100 rounded-lg p-3 bg-gray-50">
                {surveys.filter(s => s.status === "ativa").map(s => {
                  const isChecked = (editData.assigned_survey_ids || []).includes(s.id);
                  const personalLimit = editData.survey_interview_limits?.[s.id] ?? "";
                  const defaultLimit = s.max_interviews_per_interviewer;
                  return (
                    <div key={s.id} className={`rounded-lg border-2 transition-all ${isChecked ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>
                      <div
                        onClick={() => toggleSurveyAssign(s.id)}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                      >
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 transition-all ${isChecked ? "bg-blue-600 border-blue-600" : "bg-white border-gray-400"}`}>
                          {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                        <span className={`text-sm font-medium flex-1 ${isChecked ? "text-blue-800" : "text-gray-700"}`}>{s.title}</span>
                        {defaultLimit && <span className="text-xs text-gray-400">padrão: {defaultLimit}</span>}
                      </div>
                      {isChecked && (
                        <div className="px-3 pb-2 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <label className="text-xs text-gray-500 shrink-0">Limite personalizado:</label>
                          <Input
                            type="number"
                            min="1"
                            placeholder={defaultLimit ? `${defaultLimit} (padrão)` : "Sem limite"}
                            value={personalLimit}
                            onChange={e => setEditData(prev => ({
                              ...prev,
                              survey_interview_limits: {
                                ...prev.survey_interview_limits,
                                [s.id]: e.target.value === "" ? "" : Number(e.target.value),
                              }
                            }))}
                            className="h-7 text-xs w-32"
                          />
                          {personalLimit !== "" && (
                            <button
                              onClick={() => setEditData(prev => {
                                const updated = { ...prev.survey_interview_limits };
                                delete updated[s.id];
                                return { ...prev, survey_interview_limits: updated };
                              })}
                              className="text-xs text-gray-400 hover:text-red-500"
                            >Usar padrão</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {surveys.filter(s => s.status === "ativa").length === 0 && (
                  <p className="text-xs text-gray-400">Nenhuma pesquisa ativa.</p>
                )}
              </div>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={saveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Histórico: {selectedUser?.name}</DialogTitle></DialogHeader>
          {selectedUser && (() => {
            const userIvs = getUserInterviews(selectedUser);
            const completed = userIvs.filter(i => i.status === "concluida");
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <KeyRound className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-xs text-gray-500">Código de Acesso</p>
                    <code className="text-lg font-mono font-bold text-blue-700 tracking-widest">{selectedUser.access_code}</code>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total", value: userIvs.length },
                    { label: "Concluídas", value: completed.length },
                    { label: "Em andamento", value: userIvs.filter(i => i.status === "em_andamento").length },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-400">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Pesquisas atribuídas</p>
                  {(selectedUser.assigned_survey_ids || []).length === 0
                    ? <p className="text-xs text-gray-400">Nenhuma pesquisa atribuída.</p>
                    : (selectedUser.assigned_survey_ids || []).map(id => {
                      const s = surveys.find(sv => sv.id === id);
                      return s ? <Badge key={id} variant="outline" className="mr-1 mb-1 text-xs">{s.title}</Badge> : null;
                    })
                  }
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Últimas entrevistas</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {userIvs.slice(0, 10).map(i => (
                      <div key={i.id} className="flex justify-between py-1.5 border-b last:border-0 text-xs">
                        <span className="text-gray-700 truncate max-w-[60%]">{i.survey_title || "Pesquisa"}</span>
                        <Badge variant={i.status === "concluida" ? "default" : "secondary"} className="text-xs capitalize">
                          {i.status?.replace("_", " ")}
                        </Badge>
                      </div>
                    ))}
                    {userIvs.length === 0 && <p className="text-xs text-gray-400">Nenhuma entrevista ainda.</p>}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}