/* ---------------------------------------------------------
   React hooks — live data with realtime sync.

   Each hook loads once, then subscribes to Supabase Realtime.
   When ANY device changes a row, Postgres broadcasts it and
   these hooks update state — so Bypass Shop and Jaspare Auto
   see changes within a second, no refresh needed.
--------------------------------------------------------- */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "./supabase.js";
import { fetchInventory, fetchNotifications, rowToItem, rowToNotif } from "./api.js";

/* Live inventory. Returns { items, loading, error, reload }. */
export function useInventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setItems(await fetchInventory());
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel("inventory-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, (payload) => {
        setItems((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((i) => i.code !== payload.old.code);
          }
          const item = rowToItem(payload.new);
          const idx = prev.findIndex((i) => i.code === item.code);
          if (idx === -1) return [item, ...prev];
          const next = prev.slice();
          next[idx] = item;
          return next;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [reload]);

  return { items, loading, error, reload };
}

/* Live notifications feed. */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchNotifications()
      .then((d) => active && setNotifications(d))
      .catch(() => {})
      .finally(() => active && setLoading(false));

    const channel = supabase
      .channel("notifications-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        setNotifications((prev) => [rowToNotif(payload.new), ...prev]);
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { notifications, loading };
}

/* Current auth session + staff name. */
export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return session;
}
