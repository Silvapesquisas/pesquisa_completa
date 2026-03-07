import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, X, CheckCheck } from "lucide-react";

const NOTIF_KEY = "fieldapp_notifications";
const SEEN_KEY = "fieldapp_notif_seen";

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) || "[]"); } catch { return []; }
}
function saveLocal(items) {
  localStorage.setItem(NOTIF_KEY, JSON.stringify(items));
}
function loadSeen() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function saveSeen(ids) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
}

export default function FieldNotifications({ fieldUser }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [seenIds, setSeenIds] = useState(loadSeen());
  const prevSurveyIds = useRef(null);

  const unreadCount = notifications.filter(n => !seenIds.includes(n.id)).length;

  // Poll for survey changes every 60s
  useEffect(() => {
    if (!fieldUser) return;

    const check = async () => {
      try {
        const results = await base44.entities.FieldUser.filter({ access_code: fieldUser.access_code, active: true });
        if (!results.length) return;
        const fresh = results[0];
        const assigned = fresh.assigned_survey_ids || [];

        if (prevSurveyIds.current === null) {
          prevSurveyIds.current = assigned;
          return;
        }

        const prev = prevSurveyIds.current;
        const newIds = assigned.filter(id => !prev.includes(id));
        const removedIds = prev.filter(id => !assigned.includes(id));

        const newNotifs = [];

        if (newIds.length > 0) {
          try {
            const surveys = await base44.entities.Survey.filter({ status: "ativa" });
            newIds.forEach(id => {
              const s = surveys.find(sv => sv.id === id);
              newNotifs.push({
                id: `new_${id}_${Date.now()}`,
                type: "assigned",
                title: "Nova pesquisa atribuída!",
                message: s ? `"${s.title}" foi adicionada à sua lista.` : "Uma nova pesquisa foi adicionada.",
                timestamp: new Date().toISOString(),
              });
            });
          } catch {}
        }

        if (newNotifs.length > 0) {
          const updated = [...newNotifs, ...loadLocal()].slice(0, 50);
          saveLocal(updated);
          setNotifications(updated);
        }

        prevSurveyIds.current = assigned;
      } catch {}
    };

    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [fieldUser]);

  // Load on mount
  useEffect(() => {
    setNotifications(loadLocal());
  }, []);

  const markAllRead = () => {
    const ids = notifications.map(n => n.id);
    saveSeen(ids);
    setSeenIds(ids);
  };

  const dismiss = (id) => {
    const updated = notifications.filter(n => n.id !== id);
    saveLocal(updated);
    setNotifications(updated);
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(v => !v); if (!open) { markAllRead(); } }}
        className="relative p-2 rounded-full hover:bg-white/20 transition-colors"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold text-gray-800">Notificações</p>
              {notifications.length > 0 && (
                <button onClick={markAllRead} className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Marcar lidas
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-30" />
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={`px-4 py-3 border-b last:border-0 flex gap-3 items-start ${!seenIds.includes(n.id) ? "bg-blue-50" : ""}`}>
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!seenIds.includes(n.id) ? "bg-blue-500" : "bg-gray-200"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-gray-300 mt-1">
                        {n.timestamp ? new Date(n.timestamp).toLocaleString("pt-BR") : ""}
                      </p>
                    </div>
                    <button onClick={() => dismiss(n.id)} className="text-gray-300 hover:text-gray-500 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}