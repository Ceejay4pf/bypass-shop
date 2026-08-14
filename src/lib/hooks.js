/* ---------------------------------------------------------
   React hooks — live data with realtime sync.

   Each hook loads once, then subscribes to Supabase Realtime.
   When ANY device changes a row, Postgres broadcasts it and
   these hooks update state — so Bypass Shop and Jaspare Auto
   see changes within a second, no refresh needed.
--------------------------------------------------------- */
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "./supabase.js";
import {
  fetchInventory, fetchInventoryImages, fetchNotifications, rowToItem, rowToNotif,
  fetchPartCategories, subscribePartCategories,
} from "./api.js";
import { DEFAULT_CATEGORIES, mergeCategories } from "../data.js";

/* Live inventory. Returns { items, loading, error, reload }. */
export function useInventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      // The parts list, without photos — small and fast, so stock appears
      // almost immediately even on a weak shop connection.
      const list = await fetchInventory();
      setItems(list);
      setError(null);
      setLoading(false);

      // Then the photos, merged in as they arrive. A slow or failed photo
      // fetch never stops staff from seeing and selling stock.
      fetchInventoryImages()
        .then((byCode) => {
          if (!Object.keys(byCode).length) return;
          setItems((prev) =>
            prev.map((i) => (byCode[i.code] ? { ...i, images: byCode[i.code] } : i))
          );
        })
        .catch(() => {});
    } catch (e) {
      setError(e.message || String(e));
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

/* The category list: the built-in sections plus whatever the shop has added.
   Returns { categories, reload }.

   It never fails closed. If part_categories.sql has not been run, or the read
   errors, the built-in thirteen are used - a shop that cannot list its own
   sections cannot sell anything, so losing the added ones is bad but losing
   all of them would stop the counter. */
export function usePartCategories() {
  const [extra, setExtra] = useState([]);

  const reload = useCallback(async () => {
    try {
      setExtra(await fetchPartCategories());
    } catch {
      /* keep whatever we already have - see above */
    }
  }, []);

  useEffect(() => {
    reload();
    return subscribePartCategories(() => reload());
  }, [reload]);

  const categories = useMemo(() => mergeCategories(extra, DEFAULT_CATEGORIES), [extra]);
  return { categories, reload };
}

/* Live notifications feed. */
export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setNotifications(await fetchNotifications());
    } catch {
      /* leave what we have */
    } finally {
      setLoading(false);
    }
  }, []);

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
      // An undone sale is an UPDATE, not an insert — without this the feed
      // would keep showing it as a live sale until the next refresh.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, (payload) => {
        setNotifications((prev) =>
          prev.map((n) => (n.id === payload.new.id ? rowToNotif(payload.new) : n))
        );
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { notifications, loading, reload };
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
