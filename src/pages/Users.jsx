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
  const [inviteRole, setInviteRole] = useState("entrevistador");
  const [inviting, setInviting] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);

  const load = async () => {
    const me = await base44.auth.me();
    setCurrentUser(me);
    const companyId = me?.company_id;
    // Super-admins (no company_id) see all users; others see only their company
    const list = companyId
      ? await base44.entities.User.filter({ company_id: companyId })
      : await base44.entities.User.list();
    setUsers(list);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleActive = async (u) => {
    await base44.entities.User.update(u.id, { active: !u.active });
    load();
  };

  const updateRole = async (u, role) => {
    await base44.entities.User.update(u.id, { role });
    load();
  };

  const invite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    await base44.users.inviteUser(inviteEmail, inviteRole === "admin" ? "admin" : "user");
    // After invite, tag the new user with company_id if known
    if (currentUser?.company_id) {
      // Best-effort: find newly created user and stamp company_id
      setTimeout(async () => {
        const all = await base44.entities.User.filter({ email: inviteEmail });
        if (all[0]) await base44.entities.User.update(all[0].id, { company_id: currentUser.company_id });
      }, 2000);
    }
    setInviting(false);
    setInviteOpen(false);
    setInviteEmail("");
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
                  {u.region && <p className="text-xs text-gray-400">Região: {u.region}</p>}
                </div>

                <div className="flex gap-2 shrink-0">
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