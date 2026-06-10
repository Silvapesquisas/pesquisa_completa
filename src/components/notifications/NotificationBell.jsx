import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const typeIcon = {
  interview_completed: "✅",
  draft_synced: "☁️",
  sync_failed: "⚠️",
  survey_assigned: "📋",
  interviewer_added: "👤",
  system: "🔔",
};

export default function NotificationBell({ user }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user?.email) return;
    try {
      const all = await base44.entities.Notification.filter({ user_email: user.email }, "-created_date", 30);
      setNotifications(all);
    } catch {
      // silently ignore network errors
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user?.email]);

  // Real-time subscription
  useEffect(() => {
    const result = base44.entities.Notification.subscribe((event) => {
      if (event.data?.user_email === user?.email) {
        load();
      }
    });
    return () => {
      if (typeof result === "function") result();
      else if (result && typeof result.destroy === "function") result.destroy();
      else if (result && typeof result.unsubscribe === "function") result.unsubscribe();
    };
  }, [user?.email]);

  const unread = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    const unreadList = notifications.filter(n => !n.read);
    await Promise.all(unreadList.map(n => base44.entities.Notification.update(n.id, { read: true })));
    load();
  };

  const markRead = async (n) => {
    if (!n.read) {
      await base44.entities.Notification.update(n.id, { read: true });
      load();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative p-2">
          <Bell className="w-5 h-5 text-gray-600" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm text-gray-800">Notificações</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline">
              Marcar todas como lidas
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-gray-400 text-sm p-4 text-center">Nenhuma notificação</p>
          ) : notifications.map(n => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={`flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors ${!n.read ? "bg-blue-50/50" : ""}`}
            >
              <span className="text-lg shrink-0 mt-0.5">{typeIcon[n.type] || "🔔"}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!n.read ? "font-semibold text-gray-900" : "text-gray-700"}`}>{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(n.created_date), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              </div>
              {!n.read && <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0" />}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}