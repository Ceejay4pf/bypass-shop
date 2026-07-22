import React, { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, PackagePlus, ShoppingCart, Bell, Boxes, LogOut, User,
  LayoutDashboard, FileBarChart, Settings as SettingsIcon,
  Menu, Check, AlertTriangle, Clock, Zap, History, Loader2, Wifi, ArrowLeft,
} from "lucide-react";
import LoginGate from "./LoginGate.jsx";
import { supabase, isConfigured } from "./lib/supabase.js";
import { useInventory, useNotifications, useAuth } from "./lib/hooks.js";
import { getProfileName, signOut } from "./lib/auth.js";
import * as api from "./lib/api.js";
import { DEFAULT_CATEGORIES, generateCode, LOW_STOCK_THRESHOLD } from "./data.js";
import {
  DashboardTab, SearchTab, InventoryTab, AddItemTab, AddStockTab,
  SellTab, NotifyTab, ReportsTab, SettingsTab,
} from "./tabs.jsx";
import { QuickTab, LedgerTab } from "./quick.jsx";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quick", label: "Quick Transaction", icon: Zap },
  { id: "search", label: "Search Inventory", icon: Search },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "ledger", label: "Inventory Ledger", icon: History },
  { id: "add", label: "Add New Item", icon: Plus },
  { id: "stock", label: "Add New Stock", icon: PackagePlus },
  { id: "sell", label: "Sell Item", icon: ShoppingCart },
  { id: "notify", label: "Notifications", icon: Bell },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const CATEGORIES = DEFAULT_CATEGORIES;

export default function App() {
  const session = useAuth();

  // undefined = auth state still loading; null = signed out.
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#F3F5F8] flex items-center justify-center text-[#5A6472]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!session) return <LoginGate />;
  return <BypassShop session={session} />;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function BypassShop({ session }) {
  const { items, loading: itemsLoading, error } = useInventory();
  const { notifications } = useNotifications();
  const [user, setUser] = useState(session.user.user_metadata?.full_name || "Staff");
  const [tab, setTab] = useState("dashboard");
  const [history, setHistory] = useState([]); // screens visited, for the Back button
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [ledgerCode, setLedgerCode] = useState("");
  const now = useClock();

  // Resolve the staff display name from the profiles table.
  useEffect(() => {
    getProfileName(session.user.id, session.user.email).then((n) => n && setUser(n));
  }, [session.user.id]);

  // Navigate to a screen, remembering where we came from so Back works.
  const openLedger = (code) => {
    setLedgerCode(code);
    setHistory((h) => [...h, tab]);
    setTab("ledger");
    setNavOpen(false);
  };
  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setTab(prev);
      return h.slice(0, -1);
    });
    setNavOpen(false);
  };
  const showToast = (msg, tone = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2800);
  };

  // A thin wrapper so any API error surfaces as a toast instead of a silent fail.
  const run = async (fn, okMsg, tone) => {
    try {
      await fn();
      if (okMsg) showToast(okMsg, tone);
    } catch (e) {
      showToast(e.message || "Something went wrong", "warn");
    }
  };

  /* ---- handlers (all write to Supabase; realtime updates the UI) ---- */
  const handleAddItem = async (newItem) => {
    const serial = await api.nextSerial().catch(() => Date.now() % 10000);
    // Build the rich code, then swap the serial suffix for the DB-issued one.
    const base = generateCode(newItem, items).replace(/-\d+$/, "");
    const code = `${base}-${String(serial).padStart(4, "0")}`;
    await run(() => api.insertItem({ ...newItem, code }, user), `Added ${code}`);
    setTab("search");
    return true;
  };
  const handleAddStock = (code, amount, supplier = "") =>
    run(() => api.addStock(code, amount, user, supplier), `+${amount} stock added to ${code}`);
  const handleSell = (sale) =>
    run(async () => { await api.sellItem(sale, user); setTab("notify"); },
      `Sold ${sale.qty} × ${sale.code} — sent to Jaspare Auto`, sale.paid ? "ok" : "warn");
  const handleAdjust = (code, newQty, reason) =>
    run(() => api.adjustQty(code, newQty, reason, user), `Adjusted ${code} → ${newQty}`);
  const handleDelete = (code) =>
    run(() => api.deleteItem(code, user), `Deleted ${code}`, "warn");

  const handleQuick = (t) => {
    if (t.kind === "new") handleAddItem(t.item);
    else if (t.kind === "add") handleAddStock(t.code, t.qty, t.supplier);
    else if (t.kind === "out") handleSell(t);
    else if (t.kind === "adjust") handleAdjust(t.code, t.newQty, t.reason);
  };

  const handleLogout = async () => { await signOut(); };

  const lowStockCount = useMemo(
    () => items.filter((i) => i.qty <= (i.min ?? LOW_STOCK_THRESHOLD)).length,
    [items]
  );

  const go = (id) => {
    if (id !== tab) setHistory((h) => [...h, tab]);
    setTab(id);
    setNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F3F5F8] text-[#1B2430] lg:flex">
      {/* ---------- Sidebar ---------- */}
      {navOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setNavOpen(false)} />}
      <aside
        className={`fixed lg:static z-40 top-0 left-0 h-full w-64 bg-[#FFFFFF] border-r border-[#DEE3E9] flex flex-col transition-transform ${
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-[#DEE3E9]">
          <div className="text-[#5A6472] text-[10px] font-bold tracking-[0.25em] uppercase">Jaspare Auto</div>
          <div className="flex items-center gap-2 mt-0.5">
            <Boxes size={20} className="text-[#2563EB]" />
            <span className="text-lg font-extrabold uppercase tracking-wide">Bypass Shop</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => go(n.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium mb-0.5 transition-colors ${
                  active ? "bg-[#2563EB] text-[#F3F5F8]" : "text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#1B2430]"
                }`}
              >
                <Icon size={17} />
                <span className="flex-1 text-left">{n.label}</span>
                {n.id === "notify" && lowStockCount > 0 && (
                  <span className={`text-[10px] font-bold rounded-full px-1.5 ${active ? "bg-[#F3F5F8] text-[#2563EB]" : "bg-[#DC3B2E] text-white"}`}>
                    {lowStockCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[#DEE3E9]">
          <div className="flex items-center gap-1.5 text-[10px] text-[#15926A] px-3 mb-1">
            <Wifi size={11} /> Live sync on
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#DC3B2E]">
            <LogOut size={17} /> Logout
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-[#DEE3E9] bg-[#FFFFFF] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setNavOpen(true)} className="lg:hidden text-[#5A6472]">
            <Menu size={22} />
          </button>
          {history.length > 0 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm rounded-md px-2 py-1 hover:bg-[#EEF2F6] transition-colors shrink-0"
              title="Go back to the previous screen"
            >
              <ArrowLeft size={18} /> <span className="hidden sm:inline">Back</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[#5A6472] text-[10px] font-bold tracking-[0.2em] uppercase">
              Jaspare Auto · Main Shop
            </div>
            <div className="text-sm sm:text-base font-bold uppercase tracking-wide truncate">
              Branch Inventory Management
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 text-[#5A6472] text-xs">
              <Clock size={13} />
              <span>{now.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" })}</span>
              <span className="text-[#1B2430] font-semibold tabular-nums">
                {now.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-1.5 text-[#1B2430] text-sm font-semibold">
                <User size={14} className="text-[#2563EB]" /> {user}
              </div>
              <div className="text-[10px] text-[#5A6472]">Logged in as</div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 max-w-3xl w-full mx-auto">
          {error && (
            <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-4 flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          )}
          {itemsLoading && (
            <div className="flex items-center gap-2 text-[#5A6472] text-sm mb-4">
              <Loader2 size={14} className="animate-spin" /> Loading shared inventory from the cloud…
            </div>
          )}

          {tab === "dashboard" && (
            <DashboardTab items={items} notifications={notifications} categories={CATEGORIES} user={user} onNav={go} onOpenLedger={openLedger} />
          )}
          {tab === "quick" && (
            <QuickTab items={items} categories={CATEGORIES} onQuick={handleQuick} onOpenLedger={openLedger} />
          )}
          {tab === "search" && <SearchTab items={items} categories={CATEGORIES} />}
          {tab === "inventory" && <InventoryTab items={items} categories={CATEGORIES} onDelete={handleDelete} onOpenLedger={openLedger} />}
          {tab === "ledger" && <LedgerTab items={items} categories={CATEGORIES} initialCode={ledgerCode} />}
          {tab === "add" && <AddItemTab items={items} categories={CATEGORIES} onAdd={handleAddItem} />}
          {tab === "stock" && <AddStockTab items={items} categories={CATEGORIES} onAddStock={handleAddStock} />}
          {tab === "sell" && <SellTab items={items} categories={CATEGORIES} onSell={handleSell} />}
          {tab === "notify" && <NotifyTab notifications={notifications} />}
          {tab === "reports" && <ReportsTab items={items} notifications={notifications} categories={CATEGORIES} />}
          {tab === "settings" && <SettingsTab categories={CATEGORIES} user={user} email={session.user.email} />}
        </main>
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-md shadow-lg text-sm font-medium flex items-center gap-2 border z-50 bp-pop ${
            toast.tone === "warn"
              ? "bg-[#FBEAE8] border-[#DC3B2E] text-[#DC3B2E]"
              : "bg-[#E6F6EF] border-[#15926A] text-[#15926A]"
          }`}
        >
          {toast.tone === "warn" ? <AlertTriangle size={16} /> : <Check size={16} />} {toast.msg}
        </div>
      )}
    </div>
  );
}
