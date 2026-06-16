import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import api from "@/lib/api";
import useSocket from "@/hooks/useSocket";
import { timeAgo } from "@/lib/utils";

// little helpers to read a notification regardless of which field-name shape the backend used
const isRead = (n) => Boolean(n.is_read ?? n.read);
const notifId = (n) => n.id ?? n.notification_id;
const notifTime = (n) => n.created_at ?? n.createdAt ?? n.time;

// bell icon with an unread badge + a dropdown of the recent ones
export default function NotificationBell() {
  const socket = useSocket();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [bounce, setBounce] = useState(0);
  const wrapRef = useRef(null);

  // grab the latest notifications. API hands back { data: { notifications, unread_count } }, unwrap it.
  async function fetchNotifications() {
    try {
      const { data } = await api.get("/notifications");
      const payload = data?.data ?? data;
      const list = Array.isArray(payload)
        ? payload
        : payload?.notifications ?? [];
      if (Array.isArray(list)) setItems(list);
      // trust the backend's unread_count, only count locally if it didn't send one
      const count = payload?.unread_count;
      setUnreadCount(
        typeof count === "number"
          ? count
          : Array.isArray(list)
          ? list.filter((n) => !isRead(n)).length
          : 0
      );
    } catch {
      // not important enough to surface, just leave the list as it was
    }
  }

  // first load
  useEffect(() => {
    fetchNotifications();
  }, []);

  // live updates over the socket. the backend never emits a generic "notification" event - it
  // sends domain events (order_received, order_accepted, ...) each backed by a real notification
  // row. so on any of these, just re-fetch and bounce the bell.
  useEffect(() => {
    if (!socket) return;
    const notificationEvents = [
      'new_registration',
      'new_driver_registration',
      'order_received',
      'order_accepted',
      'order_rejected',
      'driver_assigned',
      'driver_accepted',
      'driver_rejected',
      'driver_fired',
      'order_status_updated',
      'order_delivered',
      'driver_rejected_order',
      'account_deactivated',
      'account_activated',
    ];
    const onEvent = () => {
      fetchNotifications();
      setBounce((b) => b + 1);
    };
    notificationEvents.forEach((event) => {
      socket.on(event, onEvent);
    });
    return () => {
      notificationEvents.forEach((event) => {
        socket.off(event);
      });
    };
  }, [socket]);

  // click anywhere outside closes the dropdown
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markRead(id) {
    setItems((prev) =>
      prev.map((n) => (notifId(n) === id ? { ...n, is_read: true, read: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // we already updated the UI optimistically, so a failed call here is no big deal
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true, read: true })));
    setUnreadCount(0);
    try {
      await api.patch("/notifications/read-all");
    } catch {
      // same deal, UI's already updated
    }
  }

  const recent = items.slice(0, 5);

  return (
    <div ref={wrapRef} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors duration-150 hover:bg-slate-100 active:scale-95"
        aria-label="Notifications"
        key={bounce}
        animate={bounce ? { y: [0, -4, 0, -2, 0] } : {}}
        transition={{ duration: 0.5 }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              <button
                type="button"
                onClick={markAll}
                className="rounded text-xs font-medium text-primary transition-colors hover:text-primary/70 hover:underline"
              >
                Mark all read
              </button>
            </div>

            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">
                No notifications yet
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-slate-50 overflow-y-auto">
                {recent.map((n) => {
                  const id = notifId(n);
                  const read = isRead(n);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => !read && markRead(id)}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-slate-50"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                            read ? "bg-transparent" : "bg-primary-light ring-2 ring-primary-light/20"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-800">
                            {n.title}
                          </span>
                          <span className="block text-xs text-slate-400">
                            {timeAgo(notifTime(n))}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
