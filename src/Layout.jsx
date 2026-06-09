import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard, ClipboardList, FileText, Users, Map, Menu, X, Smartphone, LogOut, UserSquare2, Building2, BarChart2, Settings
} from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/notifications/NotificationBell";
import NoCompanyWarning from "@/components/NoCompanyWarning";

const navItems = [
  { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { label: "Pesquisas", page: "Surveys", icon: ClipboardList },
  { label: "Entrevistas", page: "Interviews", icon: FileText },
  { label: "Entrevistadores", page: "Interviewers", icon: UserSquare2 },
  { label: "Relatórios", page: "Reports", icon: Map },
  { label: "Rel. Avançado", page: "AdvancedReports", icon: BarChart2 },
  { label: "Usuários", page: "Users", icon: Users },
  { label: "Empresas", page: "Companies", icon: Building2 },
  { label: "Configurações", page: "Settings", icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().catch(() => null).then(u => setUser(u));
  }, []);

  const isFieldApp = currentPageName === "FieldApp";
  const isCompaniesPage = currentPageName === "Companies";

  if (isFieldApp) {
    return (
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    );
  }

  // Non-super-admin users without a company see a blocking warning
  const needsCompany = user && !user.company_id && user.role !== "admin" && !isCompaniesPage;
  if (needsCompany) {
    return <NoCompanyWarning />;
  }

  // Admin without company = super-admin, can access Companies page to fix this
  const isUnlinkedAdmin = user && !user.company_id && user.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {isUnlinkedAdmin && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs text-center px-4 py-1.5 font-medium">
          ⚠️ Você é super-admin sem empresa vinculada. Acesse <strong>Empresas</strong> para criar e vincular empresas.
        </div>
      )}
      <style>{`
        :root {
          --primary: 37 99 235;
          --primary-foreground: 255 255 255;
        }
      `}</style>

      {/* Sidebar desktop */}
      <aside className="hidden lg:flex flex-col w-60 bg-white border-r border-gray-100 fixed h-full z-20">
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Map className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900">Entrevista Pro</h1>
              <p className="text-xs text-gray-400">Pesquisas de Campo</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const active = currentPageName === item.page;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}>
                <item.icon className={`w-4 h-4 ${active ? "text-blue-600" : "text-gray-400"}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100 space-y-2">
          <Link to={createPageUrl("FieldApp")}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-600 hover:bg-purple-50 transition-colors">
            <Smartphone className="w-4 h-4" />
            App de Campo
          </Link>
          {user && (
            <div className="px-3 py-2 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate">{user.full_name || user.email}</p>
                <button onClick={() => base44.auth.logout()} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 mt-1">
                  <LogOut className="w-3 h-3" /> Sair
                </button>
              </div>
              <NotificationBell user={user} />
            </div>
          )}
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-white h-full shadow-xl flex flex-col">
            <div className="p-4 flex items-center justify-between border-b">
              <span className="font-bold text-gray-900">Entrevista Pro</span>
              <Button size="sm" variant="ghost" onClick={() => setSidebarOpen(false)}><X className="w-4 h-4" /></Button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map(item => {
                const active = currentPageName === item.page;
                return (
                  <Link key={item.page} to={createPageUrl(item.page)} onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                    }`}>
                    <item.icon className={`w-4 h-4 ${active ? "text-blue-600" : "text-gray-400"}`} />
                    {item.label}
                  </Link>
                );
              })}
              <Link to={createPageUrl("FieldApp")} onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-purple-600 hover:bg-purple-50">
                <Smartphone className="w-4 h-4" />
                App de Campo
              </Link>
            </nav>
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 flex items-center gap-3"
        style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)`, paddingBottom: "12px" }}
      >
        <Button size="sm" variant="ghost" onClick={() => setSidebarOpen(true)}><Menu className="w-5 h-5" /></Button>
        <span className="font-bold text-gray-900 dark:text-gray-100 text-sm flex-1">Entrevista Pro</span>
        <NotificationBell user={user} />
      </div>

      {/* Main content — offset for mobile top bar and bottom nav */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 min-h-screen pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>

      {/* Mobile bottom navigation */}
      <MobileBottomNav />
    </div>
  );
}