import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import useAuth from "@/hooks/useAuth";

// keeps a socket.io connection alive while logged in. joins the per-user room on connect
// and tears it down on logout/unmount.
export default function useSocket() {
  const { token, user } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      // gotcha: for company/pharmacy/driver, /auth/me returns the role row, where `id` is the
      // profile id and `user_id` is the real users.id. the backend rooms are keyed on users.id,
      // so use user_id first and only fall back to id (which is the right one for admin).
      const userId = user?.user_id ?? user?.id;
      if (userId) {
        socket.emit("join", userId);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, user?.user_id]);

  return socketRef.current;
}
