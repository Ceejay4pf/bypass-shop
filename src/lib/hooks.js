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
  fetchPartCategories, subscribePartCategories, fetchSales, rowToSale,
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

/* Live sales register — the money figures on Reports.

   Separate from useNotifications on purpose. The feed is deliberately capped
   at 200 rows so it loads fast, which is right for "what happened today" and
   wrong for "what did we take this year": past a couple of weeks of trading
   the month and the year would read the same figures off the same ten days,
   with nothing on screen to say so.

   `ready` says whether the register answered. If it didn't — the table is
   there in schema.sql, but a database refusing it is not impossible — the
   caller falls back to the feed rather than showing a screen of zeros as
   though nothing had been sold. */
export function useSales(limit = 5000) {
  const [sales, setSales] = useState([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchSales(limit);
      setSales(rows.map(rowToSale));
      setReady(true);
    } catch {
      setReady(false);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    let active = true;
    fetchSales(limit)
      .then((rows) => { if (active) { setSales(rows.map(rowToSale)); setReady(true); } })
      .catch(() => active && setReady(false))
      .finally(() => active && setLoading(false));

    const channel = supabase
      .channel("sales-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, (payload) => {
        setSales((prev) => [rowToSale(payload.new), ...prev]);
      })
      // An undone sale is an UPDATE. Without this the takings would keep
      // counting money for goods that came back.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sales" }, (payload) => {
        setSales((prev) => prev.map((s) => (s.id === payload.new.id ? rowToSale(payload.new) : s)));
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { sales, ready, loading, reload };
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
