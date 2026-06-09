import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ClipboardList, FileText, UserSquare2, Map } from "lucide-react";

const tabs = [
  { label: "Dashboard", page: "Dashboard", icon: LayoutDashboard },
  { label: "Pesquisas", page: "Surveys", icon: ClipboardList },
  { label: "Entrevistas", page: "Interviews", icon: FileText },
  { label: "Campo", page: "FieldApp", icon: Map },
  { label: "Equipe", page: "Interviewers", icon: UserSquare2 },
];

export default function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const href = tab.page === "Dashboard" ? "/" : `/${tab.page}`;
        const active =
          tab.page === "Dashboard"
            ? location.pathname === "/"
            : location.pathname.startsWith(`/${tab.page}`);

        return (
          <Link
            key={tab.page}
            to={tab.page === "Dashboard" ? "/" : createPageUrl(tab.page)}
            role="tab"
            aria-selected={active}
            className={`
              flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]
              select-none touch-manipulation transition-colors
              ${active
                ? "text-blue-600 dark:text-blue-400"
                : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
              }
            `}
          >
            <tab.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}