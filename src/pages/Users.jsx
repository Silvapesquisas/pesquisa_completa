import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, UserCheck, UserX, Mail } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("supervisor");
  const [inviteCompanyId, setInviteCompanyId] = useState("");
  const [inviting, setInviting] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [companies, setCompanies] = useState([]);

  const load = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);
    const companyId = me?.company_id;
    // Super-admins (no company_id) see all users; others see only their company
    const [list, cos] = await Promise.all([
      companyId
        ? base44.entities.User.filter({ company_id: companyId })
        : base44.entities.User.list(),
      base44.entities.Company.list(), // RLS: super-admin vê todas; admin vê a sua
    ]);
    setUsers(list);
    setCompanies(cos);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Gestão de usuários: somente admins, e apenas dentro da própria empresa
  // (super-admin sem empresa gerencia todos). O RLS aplica a mesma regra no
  // servidor; aqui é defesa em profundidade e UX.
  const isSuperAdmin = currentUser?.is_super_admin || (currentUser?.role === "admin" && !currentUser?.company_id);
  const canManage = (target) => {
    if (!currentUser || currentUser.role !== "admin") return false;
    if (isSuperAdmin) return true;
    return target.company_id === currentUser.company_id;
  };

  const toggleActive = async (u) => {
    if (!canManage(u)) { alert("Você não tem permissão para gerenciar este usuário."); return; }
    await base44.entities.User.update(u.id, { active: !u.active });
    load();
  };

  const updateRole = async (u, role) => {
    if (!canManage(u)) { alert("Você não tem permissão para gerenciar este usuário."); return; }
    await base44.entities.User.update(u.id, { role });
    load();
  };

  const companyName = (id) => companies.find(c => c.id === id)?.name || "Sem empresa";

  // Reatribuir empresa: exclusivo do super-admin (gerencia todas as empresas).
  const assignCompany = async (u, companyId) => {
    if (!isSuperAdmin) return;
    await base44.entities.User.update(u.id, { company_id: companyId || null });
    load();
  };

  const invite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    try {
      // A função backend cria o convite no Auth e vincula o usuário a uma
      // empresa com o papel escolhido (admin/supervisor). O super-admin pode
      // escolher a empresa; o admin de empresa convida sempre para a sua.
      await base44.users.inviteUser(inviteEmail, inviteRole, isSuperAdmin ? (inviteCompanyId || undefined) : undefined);
      setInviteOpen(false);
      setInviteEmail("");
      setInviteCompanyId("");
      load();
    } catch (e) {
      alert(e?.message || "Falha ao convidar usuário.");
    }
    setInviting(false);
  };

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const roleColor = { admin: "default", supervisor: "secondary", entrevistador: "outline" };
  const roleLabel = { admin: "Admin", supervisor: "Supervisor", entrevistador: "Entrevistador" };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários do Sistema</h1>
          <p className="text-gray-500 text-sm mt-1">Gestores e administradores com acesso ao painel · {users.length} usuário(s)</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setInviteOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Convidar Gestor
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="Buscar por nome ou e-mail..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <Card key={u.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{u.full_name || "—"}</span>
                    <Badge variant={roleColor[u.role] || "outline"} className="text-xs">
                      {roleLabel[u.role] || u.role}
                    </Badge>
                    {u.active === false && <Badge variant="destructive" className="text-xs">Inativo</Badge>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{u.email}</p>
                  <p className="text-xs text-gray-400">Empresa: {u.company_id ? companyName(u.company_id) : "—"}{u.is_super_admin ? " · Super-admin" : ""}</p>
                  {u.region && <p className="text-xs text-gray-400">Região: {u.region}</p>}
                </div>

                <div className="flex gap-2 shrink-0 flex-wrap">
                  {isSuperAdmin && (
                    <Select value={u.company_id || "none"} onValueChange={val => assignCompany(u, val === "none" ? "" : val)}>
                      <SelectTrigger className="w-40 text-xs h-8">
                        <SelectValue placeholder="Empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem empresa</SelectItem>
                        {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={u.role || "entrevistador"} onValueChange={val => updateRole(u, val)}>
                    <SelectTrigger className="w-36 text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      <SelectItem value="entrevistador">Entrevistador</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                    {u.active === false ? <UserCheck className="w-4 h-4 text-green-500" /> : <UserX className="w-4 h-4 text-red-400" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 text-sm">Nenhum usuário encontrado.</p>}
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convidar Gestor / Admin</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 text-blue-700 text-xs px-3 py-2 rounded-lg">
              Para cadastrar <strong>entrevistadores de campo</strong>, acesse a página <strong>Entrevistadores</strong> — eles acessam pelo App de Campo com um código de 8 dígitos, sem necessidade de e-mail.
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">E-mail</Label>
              <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="gestor@empresa.com" type="email" />
            </div>
            {isSuperAdmin && (
              <div>
                <Label className="text-xs text-gray-500 mb-1 block">Empresa</Label>
                <Select value={inviteCompanyId || "none"} onValueChange={v => setInviteCompanyId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem empresa (vincular depois)</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Perfil</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={invite} disabled={inviting}>
              <Mail className="w-4 h-4 mr-2" /> {inviting ? "Enviando convite..." : "Enviar Convite por E-mail"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}