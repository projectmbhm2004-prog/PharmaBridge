import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import useAuth from "@/hooks/useAuth";

/**
 * Maintains a Socket.io connection while the user is authenticated.
 * Joins the per-user room (`user_${userId}`) on connect and tears the
 * connection down on logout/unmount.
 */
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
      // For company/pharmacy/driver, /auth/me returns the role-table row where
      // `id` is the profile id and `user_id` is the users.id. The backend emits
      // to room `user_${users.id}`, so prefer user_id and fall back to id (admin).
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
