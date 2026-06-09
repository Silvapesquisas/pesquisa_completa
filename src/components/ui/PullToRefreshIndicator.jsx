import { RefreshCw } from "lucide-react";

/**
 * Visual indicator shown while pulling down to refresh.
 */
export default function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold = 64 }) {
  const visible = pullDistance > 0 || isRefreshing;
  if (!visible) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center transition-all duration-150 pointer-events-none"
      style={{ paddingTop: `calc(env(safe-area-inset-top) + ${isRefreshing ? 12 : pullDistance * 0.5}px)` }}
    >
      <div className={`
        flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium
        bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200
        border border-gray-200 dark:border-gray-700
        transition-all duration-200
      `}>
        <RefreshCw
          className={`w-4 h-4 text-blue-500 transition-transform duration-150 ${isRefreshing ? "animate-spin" : ""}`}
          style={!isRefreshing ? { transform: `rotate(${rotation}deg)` } : {}}
        />
        <span>{isRefreshing ? "Atualizando..." : progress >= 1 ? "Solte para atualizar" : "Puxe para atualizar"}</span>
      </div>
    </div>
  );
}