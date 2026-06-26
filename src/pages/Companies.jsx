import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Plus, Pencil, Users, Shield, CalendarClock } from "lucide-react";

// Limite de usuários externos (entrevistadores do App de Campo): entre 4 e 25
const MIN_FIELD_USERS = 4;
const MAX_FIELD_USERS = 25;
const clampFieldUsers = (n) => Math.min(Math.max(Math.floor(Number(n) || MIN_FIELD_USERS), MIN_FIELD_USERS), MAX_FIELD_USERS);

const PLANS = [
  { value: "basico", label: "Básico", limit: 5 },
  { value: "profissional", label: "Profissional", limit: 15 },
  { value: "enterprise", label: "Enterprise", limit: 25 },
];

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ name: "", owner_email: "", plan: "basico", max_interviewers: 5, max_interviews_per_month: "", phone: "", cnpj: "" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);
    const [cos, us] = await Promise.all([
      base44.entities.Company.list("-created_date"),
      base44.entities.User.list(),
    ]);
    setCompanies(cos);
    setUsers(us);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = currentUser?.role === "admin";
  // Apenas o super-admin define os limites (usuários externos e entrevistas/mês)
  const isSuperAdmin = currentUser?.is_super_admin === true || (isAdmin && !currentUser?.company_id);

  const openNew = () => {
    setEditTarget(null);
    setForm({ name: "", owner_email: "", plan: "basico", max_interviewers: 5, max_interviews_per_month: "", phone: "", cnpj: "" });
    setFormOpen(true);
  };

  const openEdit = (co) => {
    setEditTarget(co);
    setForm({
      name: co.name, owner_email: co.owner_email, plan: co.plan || "basico",
      max_interviewers: co.max_interviewers || MIN_FIELD_USERS,
      max_interviews_per_month: co.max_interviews_per_month ?? "",
      phone: co.phone || "", cnpj: co.cnpj || "",
    });
    setFormOpen(true);
  };

  const save = async () => {
    setSaving(true);
    // Campos básicos que qualquer admin da empresa pode editar
    const data = { name: form.name, owner_email: form.owner_email, plan: form.plan, phone: form.phone, cnpj: form.cnpj };
    // Limites só são enviados pelo super-admin (e protegidos por RLS no servidor)
    if (isSuperAdmin) {
      data.max_interviewers = clampFieldUsers(form.max_interviewers);
      data.max_interviews_per_month = (form.max_interviews_per_month === "" || form.max_interviews_per_month == null)
        ? null
        : Math.max(Math.floor(Number(form.max_interviews_per_month)) || 0, 0);
    }
    try {
      if (editTarget) {
        await base44.entities.Company.update(editTarget.id, data);
      } else {
        await base44.entities.Company.create(data);
      }
    } catch (e) {
      alert("Erro ao salvar empresa: " + (e?.message || "tente novamente."));
      setSaving(false);
      return;
    }
    setSaving(false);
    setFormOpen(false);
    load();
  };

  const planColor = { basico: "secondary", profissional: "default", enterprise: "destructive" };

  const getUserCount = (co) => users.filter(u => u.company_id === co.id).length;

  const assignUserToCompany = async (userId, companyId) => {
    await base44.entities.User.update(userId, { company_id: companyId });
    load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empresas</h1>
          <p className="text-gray-500 text-sm mt-1">{companies.length} empresa(s) cadastrada(s)</p>
        </div>
        {isAdmin && (
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={openNew}>
            <Plus className="w-4 h-4 mr-2" /> Nova Empresa
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : companies.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-10 text-center">
            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhuma empresa cadastrada ainda.</p>
            {isAdmin && <Button className="mt-4 bg-blue-600 hover:bg-blue-700" onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Criar Empresa</Button>}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map(co => (
            <Card key={co.id} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{co.name}</CardTitle>
                      <p className="text-xs text-gray-400">{co.owner_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={planColor[co.plan] || "outline"} className="text-xs capitalize">{co.plan}</Badge>
                    {isAdmin && (
                      <Button size="sm" variant="ghost" onClick={() => openEdit(co)}>
                        <Pencil className="w-4 h-4 text-gray-400" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mb-2">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{getUserCount(co)} gestores</span>
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" />Até {co.max_interviewers || MIN_FIELD_USERS} usuários externos</span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="w-3 h-3" />
                    {co.max_interviews_per_month ? `${co.max_interviews_per_month} entrevistas/mês` : "Entrevistas/mês: ilimitado"}
                  </span>
                </div>
                {co.phone && <p className="text-xs text-gray-400">Tel: {co.phone}</p>}
                {co.cnpj && <p className="text-xs text-gray-400">CNPJ: {co.cnpj}</p>}
                {/* Unlinked users — only shown to super-admin */}
                {isAdmin && (() => {
                  const unlinked = users.filter(u => !u.company_id);
                  if (unlinked.length === 0) return null;
                  return (
                    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                      <p className="text-xs text-gray-400 mb-1.5">Usuários sem empresa:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {unlinked.map(u => (
                          <button key={u.id}
                            onClick={() => assignUserToCompany(u.id, co.id)}
                            className="text-xs bg-gray-100 hover:bg-blue-100 hover:text-blue-700 text-gray-500 px-2 py-0.5 rounded-full transition-colors"
                            title={`Vincular ${u.full_name || u.email} a ${co.name}`}
                          >
                            + {u.full_name || u.email}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Nome da Empresa *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome da empresa" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">E-mail do Gestor *</Label>
              <Input value={form.owner_email} onChange={e => setForm(p => ({ ...p, owner_email: e.target.value }))} placeholder="gestor@empresa.com" type="email" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Plano</Label>
                <Select value={form.plan} onValueChange={v => {
                  const p = PLANS.find(pl => pl.value === v);
                  setForm(prev => ({ ...prev, plan: v, max_interviewers: clampFieldUsers(p?.limit || MIN_FIELD_USERS) }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLANS.map(p => <SelectItem key={p.value} value={p.value}>{p.label} (até {p.limit})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Usuários externos (App de Campo)</Label>
                <Input
                  type="number"
                  value={form.max_interviewers}
                  onChange={e => setForm(p => ({ ...p, max_interviewers: e.target.value }))}
                  min={MIN_FIELD_USERS}
                  max={MAX_FIELD_USERS}
                  disabled={!isSuperAdmin}
                />
                <p className="text-[10px] text-gray-400 mt-1">Entre {MIN_FIELD_USERS} e {MAX_FIELD_USERS}.</p>
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Limite de entrevistas por mês</Label>
              <Input
                type="number"
                value={form.max_interviews_per_month}
                onChange={e => setForm(p => ({ ...p, max_interviews_per_month: e.target.value }))}
                min={0}
                placeholder="Vazio = ilimitado"
                disabled={!isSuperAdmin}
              />
              <p className="text-[10px] text-gray-400 mt-1">Deixe em branco para não limitar. Você define a quantidade máxima.</p>
            </div>
            {!isSuperAdmin && (
              <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                Apenas o super-admin da plataforma pode alterar os limites de usuários externos e de entrevistas por mês.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">CNPJ</Label>
                <Input value={form.cnpj} onChange={e => setForm(p => ({ ...p, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" />
              </div>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving || !form.name || !form.owner_email}>
              {saving ? "Salvando..." : editTarget ? "Salvar Alterações" : "Criar Empresa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}