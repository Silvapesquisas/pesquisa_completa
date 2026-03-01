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
  Search, Plus, UserCheck, UserX, Mail, Pencil, Trash2,
  ClipboardList, Phone, MapPin, BarChart2
} from "lucide-react";

const PLAN_LIMITS = { basico: 5, profissional: 20, enterprise: 999 };

export default function Interviewers() {
  const [users, setUsers] = useState([]);
  const [surveys, setSurveys] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [company, setCompany] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("entrevistador");
  const [inviting, setInviting] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);
    const [us, sv, iv] = await Promise.all([
      base44.entities.User.list(),
      base44.entities.Survey.list(),
      base44.entities.Interview.list("-created_date", 200),
    ]);
    setUsers(us);
    setSurveys(sv);
    setInterviews(iv);

    // Load company from User's company_id
    if (me?.company_id) {
      const cos = await base44.entities.Company.filter({ id: me.company_id });
      if (cos.length > 0) setCompany(cos[0]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = currentUser?.role === "admin";
  const maxInterviewers = company ? (company.max_interviewers || PLAN_LIMITS[company.plan] || 5) : 5;
  const interviewerList = users.filter(u => u.role === "entrevistador" || u.role === "supervisor");
  const activeCount = interviewerList.filter(u => u.active !== false).length;
  const canAddMore = activeCount < maxInterviewers;

  const filtered = interviewerList.filter(u => {
    const matchSearch = (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" ||
      (filterStatus === "ativo" && u.active !== false) ||
      (filterStatus === "inativo" && u.active === false);
    return matchSearch && matchStatus;
  });

  const toggleActive = async (u) => {
    await base44.entities.User.update(u.id, { active: !u.active });
    load();
  };

  const invite = async () => {
    if (!inviteEmail) return;
    if (!canAddMore && inviteRole !== "admin") {
      alert(`Limite de ${maxInterviewers} entrevistadores atingido para o plano atual.`);
      return;
    }
    setInviting(true);
    await base44.users.inviteUser(inviteEmail, inviteRole === "admin" ? "admin" : "user");
    // Also set role in user entity after invitation (will take effect when they join)
    setInviting(false);
    setInviteOpen(false);
    setInviteEmail("");

    // Create notification
    if (currentUser) {
      await base44.entities.Notification.create({
        user_email: currentUser.email,
        type: "interviewer_added",
        title: "Entrevistador convidado",
        message: `Convite enviado para ${inviteEmail} com perfil ${inviteRole}.`,
      });
    }
    load();
  };

  const openEdit = (u) => {
    setEditData({
      region: u.region || "",
      phone: u.phone || "",
      notes: u.notes || "",
      active: u.active !== false,
      assigned_survey_ids: u.assigned_survey_ids || [],
    });
    setSelectedUser(u);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    await base44.entities.User.update(selectedUser.id, editData);
    setSaving(false);
    setEditOpen(false);
    load();
  };

  const openDetail = (u) => {
    setSelectedUser(u);
    setDetailOpen(true);
  };

  const getUserInterviews = (u) =>
    interviews.filter(i => i.interviewer_id === u.id || i.interviewer_name === u.full_name);

  const toggleSurveyAssign = (surveyId) => {
    const curr = editData.assigned_survey_ids || [];
    const has = curr.includes(surveyId);
    setEditData(prev => ({
      ...prev,
      assigned_survey_ids: has ? curr.filter(id => id !== surveyId) : [...curr, surveyId],
    }));
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
            onClick={() => setInviteOpen(true)}
            disabled={!canAddMore}
            title={!canAddMore ? `Limite de ${maxInterviewers} atingido` : ""}
          >
            <Plus className="w-4 h-4 mr-2" /> Convidar Entrevistador
          </Button>
        )}
      </div>

      {!canAddMore && isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-3 rounded-lg">
          ⚠️ Limite de {maxInterviewers} entrevistadores atingido para o plano atual. Faça upgrade para adicionar mais.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Buscar entrevistador..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
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
        <p className="text-gray-400 text-sm">Nenhum entrevistador encontrado.</p>
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
                      <span className="font-semibold text-gray-900 text-sm">{u.full_name || "—"}</span>
                      <Badge variant={u.role === "supervisor" ? "secondary" : "outline"} className="text-xs capitalize">
                        {u.role}
                      </Badge>
                      {u.active === false
                        ? <Badge variant="destructive" className="text-xs">Inativo</Badge>
                        : <Badge variant="default" className="text-xs bg-green-100 text-green-700 border-0">Ativo</Badge>
                      }
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{u.email}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500 flex-wrap">
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
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convidar Entrevistador</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">E-mail</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@exemplo.com" type="email" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Perfil</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrevistador">Entrevistador</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={invite} disabled={inviting}>
              <Mail className="w-4 h-4 mr-2" /> {inviting ? "Enviando..." : "Enviar Convite"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar: {selectedUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
              <Label className="text-xs text-gray-500 mb-2 block">Pesquisas Atribuídas</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                {surveys.filter(s => s.status === "ativa").map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <Checkbox
                      id={s.id}
                      checked={(editData.assigned_survey_ids || []).includes(s.id)}
                      onCheckedChange={() => toggleSurveyAssign(s.id)}
                    />
                    <label htmlFor={s.id} className="text-sm text-gray-700 cursor-pointer">{s.title}</label>
                  </div>
                ))}
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
          <DialogHeader><DialogTitle>Histórico: {selectedUser?.full_name}</DialogTitle></DialogHeader>
          {selectedUser && (() => {
            const userIvs = getUserInterviews(selectedUser);
            const completed = userIvs.filter(i => i.status === "concluida");
            return (
              <div className="space-y-4">
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