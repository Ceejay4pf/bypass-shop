import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search, Plus, PackagePlus, ShoppingCart, Bell, Boxes, LogOut, User,
  LayoutDashboard, FileBarChart, Settings as SettingsIcon,
  Menu, Check, AlertTriangle, Clock, Zap, History, Loader2, Wifi, ArrowLeft,
  FileText, HelpCircle, Pencil, Printer, UserCheck, ShieldCheck, MessageCircle,
  Receipt, Wallet, ArrowRightLeft, ListPlus, Sun, Moon, Scale, ClipboardList,
  Columns2, X, DollarSign, Store,
} from "lucide-react";
import { useTheme } from "./lib/theme.js";
import { SHOP_INFO } from "./lib/shopInfo.js";
import LoginGate from "./LoginGate.jsx";
import EntryDoors, { forgetEntry } from "./EntryDoors.jsx";
import Welcome from "./Welcome.jsx";
import LockScreen from "./LockScreen.jsx";
import PendingGate from "./PendingGate.jsx";
import { isLockEnabled, isUnlocked, markUnlocked, lockNow } from "./lib/appLock.js";
import { supabase, isConfigured } from "./lib/supabase.js";
import { useInventory, useNotifications, useAuth, usePartCategories, useSales } from "./lib/hooks.js";
import { getProfileName, signOut } from "./lib/auth.js";
import { getRolePersonName, clearRoleSession } from "./lib/roleAccounts.js";
import { isAdmin, hasCap, isRoleAccount, rolePermissions } from "./lib/roles.js";
import {
  screenAllowed, firstScreenFor, moduleLabel, orderScreens, moduleScreen,
} from "./lib/shopModules.js";
import * as api from "./lib/api.js";
import { generateCode, isLowStock } from "./data.js";
import { cacheAge } from "./lib/stockCache.js";
import { orderToDraft } from "./lib/receiptDraft.js";
import {
  readSplit, writeSplit, readRightTab, writeRightTab, rightScreen, canSplit,
} from "./lib/split.js";
import {
  DashboardTab, SearchTab, InventoryTab, AddItemTab, AddStockTab, BulkAddTab,
  SellTab, NotifyTab, ReportsTab, SettingsTab, QuotationTab, EditPartsTab,
  PricesTab,
  LowStockTab, PrintStockTab, ApprovalsTab, MyPermissionsTab, StaffFeedTab,
  ReceiptTab, CreditAccountsTab, TransfersTab, CustomerOrdersTab,
} from "./tabs.jsx";
import { QuickTab, LedgerTab } from "./quick.jsx";
import { FinanceTab } from "./finance.jsx";
import ShopMark from "./ShopMark.jsx";

// `admin: true` = admin-only screen. `cap: "<key>"` = needs that capability
// (admins always have every capability; staff need it granted).
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "quick", label: "Quick Transaction", icon: Zap, cap: "quick" },
  { id: "search", label: "Search Inventory", icon: Search },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "lowstock", label: "Low Stock", icon: AlertTriangle },
  { id: "ledger", label: "Inventory Ledger", icon: History },
  { id: "add", label: "Add New Item", icon: Plus, cap: "additem" },
  { id: "bulk", label: "Add a List of Parts", icon: ListPlus, cap: "additem" },
  { id: "edit", label: "Edit Parts", icon: Pencil, cap: "edit" },
  /* Under Edit Parts because it needs the same permission and does the same job,
     a shelf at a time instead of a part at a time. */
  { id: "prices", label: "Prices", icon: DollarSign, cap: "edit" },
  { id: "stock", label: "Add New Stock", icon: PackagePlus },
  /* "Sales", not "Sell Item": the screen both records a sale and shows every
     sale ever recorded, and a menu entry that names only half of that is a menu
     entry nobody taps when they want the other half. */
  { id: "sell", label: "Sales", icon: ShoppingCart },
  /* What came in off the public parts list. Above Quotation and Receipt
     because that is what an order turns into. */
  { id: "orders", label: "Customer Orders", icon: ClipboardList },
  { id: "quote", label: "Quotation", icon: FileText },
  { id: "receipt", label: "Receipt", icon: Receipt },
  { id: "credit", label: "Credit Accounts", icon: Wallet },
  { id: "transfers", label: "Branch Transfers", icon: ArrowRightLeft },
  { id: "feed", label: "Staff Feed", icon: MessageCircle },
  { id: "notify", label: "Notifications", icon: Bell, admin: true },
  { id: "print", label: "Print Stock", icon: Printer },
  { id: "reports", label: "Reports", icon: FileBarChart },
  { id: "finance", label: "Financial Statements", icon: Scale, admin: true },
  { id: "permissions", label: "My Permissions", icon: ShieldCheck, staffOnly: true },
  { id: "approvals", label: "Staff Approvals", icon: UserCheck, admin: true },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

/* `onLeave` forgets which of the two front doors this device chose, so a phone
   that answered "I work at the shop" by mistake is not stuck on a sign-in screen
   forever. Handed down to the sign-in screen, which is where somebody who is not
   staff will be sitting when they realise. See src/main.jsx.

   `shop` is which business's address is open — { slug, name }. It is not decoration:
   every read and write below is narrowed to it once the account's membership has
   been confirmed. See ShopGate.

   `onChooseShop` goes all the way back to the shop list, which is a different place
   from `onLeave`: leaving the sign-in screen means "I'm a customer, not staff, at
   THIS shop", while choosing again means "wrong shop entirely". Somebody sitting in
   front of "Wrong shop" needs the second one. */
export default function App({ onLeave, onChooseShop, shop }) {
  const session = useAuth();

  // undefined = auth state still loading; null = signed out.
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-[#F3F5F8] flex items-center justify-center text-[#5A6472]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!session) return <LoginGate onLeave={onLeave} shop={shop} />;
  /* The doors go OVER the app, not instead of it, so the inventory is being
     fetched while they roll — the animation costs the shop no waiting. */
  return (
    <ShopGate session={session} shop={shop} onChooseShop={onChooseShop}>
      {/* Both ways out are handed to the signed-in app too, not only to the sign-in
          screen. Somebody who is already in still has to be able to walk back — see
          the note over the Back button in the header. */}
      <BypassShop session={session} shop={shop} onLeave={onLeave} onChooseShop={onChooseShop} />
      <EntryDoors session={session} />
    </ShopGate>
  );
}

/* ---------------------------------------------------------
   DOES THIS ACCOUNT WORK AT THE SHOP IN THE ADDRESS?

   Signing in proves who somebody is. It does not prove which business they work
   at, and with two shops on one login system those are different questions. Without
   this, a Surefit account that opened /jaspare-auto/login would sign in perfectly
   and then sit looking at an empty system with no explanation — every query
   silently narrowed to a shop it has no rows in.

   It is also where the shop's id is fetched and handed to the query layer. The id
   deliberately does not come from the landing page: that list is read by strangers
   and carries a name, a slug and a phone, nothing more. The id arrives with the
   membership, which needs a session by definition.

   "UNKNOWN" IS TREATED AS YES, AND "COULDN'T ASK" IS NOT. Until supabase/multishop/
   has been pasted there is no user_shops table, so nobody has a membership and
   refusing everybody would lock the whole shop out of its own system over a
   migration that has not happened. Unscoped is also correct in that state: with no
   shop_id there is one shop's data.

   The two used to be the same answer, and that is what mixed the shops. A lookup
   that FAILED — a dropped connection, a request that timed out on a shop phone in a
   dead spot — came back as "unknown" too, and unknown let the person in with no shop
   on the screen and therefore no filter on any query. For the owner's own logins,
   which belong to every shop, that is every shop's stock in one list. So a failure
   is its own answer now and it stops here, with a Try again, rather than opening a
   system that is showing somebody else's business.

   It is a worse minute for whoever is standing at the counter and a much better
   year: an unreachable database is a screen you retry, a merged one is a stock take
   you cannot trust.
--------------------------------------------------------- */
function ShopGate({ session, shop, onChooseShop, children }) {
  const slug = shop?.slug || "";
  const [state, setState] = useState("checking"); // checking | ok | wrong | unavailable
  const [mine, setMine] = useState([]);
  const [tries, setTries] = useState(0);   // Try again re-runs the check below

  useEffect(() => {
    let alive = true;
    setState("checking");
    (async () => {
      let answer = "unknown";
      let hit = null;
      let all = [];
      try {
        const r = await api.checkShopMembership(slug);
        answer = r.answer;
        hit = r.shop;
        all = r.all || [];
      } catch {
        /* checkShopMembership catches its own failures and answers "unavailable";
           anything still thrown from here is the same kind of thing, so it is read
           the same way rather than waved through. */
        answer = "unavailable";
      }
      if (!alive) return;

      if (answer === "no") {
        setMine(all);
        setState("wrong");
        return;
      }
      /* A yes with no id would activate the shop with an empty one, which is the
         same open door by another route. There is no id to be had here — the public
         shop list deliberately doesn't carry one — so this is a retry too. */
      if (answer === "unavailable" || (answer === "yes" && !hit?.id)) {
        setState("unavailable");
        return;
      }
      await api.activateShop({
        slug,
        id: hit?.id || "",
        name: hit?.name || shop?.name || "",
      });
      if (alive) setState("ok");
    })();
    return () => { alive = false; };
  }, [slug, session.user.id, shop?.name, tries]);

  if (state === "checking") {
    return (
      <div className="min-h-screen bg-[#F3F5F8] flex items-center justify-center text-[#5A6472]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  /* Not "wrong shop" and not a blank system: the shop could not be confirmed, so
     nothing is shown yet. Worded as a connection problem because that is what it
     nearly always is, and it names the one thing that fixes it. */
  if (state === "unavailable") {
    return (
      <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0C1424] ring-1 ring-white/10 rounded-2xl p-6 text-center">
          <AlertTriangle size={28} className="text-[#E0A93B] mx-auto" />
          <h1 className="text-white text-lg font-extrabold uppercase tracking-wide mt-3">
            Couldn't reach the shop
          </h1>
          <p className="text-[#9FB3CC] text-sm mt-2 leading-relaxed">
            You're signed in, but this device couldn't check which shop it's opening.
            The stock list is kept shut until it can, so that no shop's parts show up
            under another shop's name. Check the connection and try again.
          </p>
          <button
            onClick={() => setTries((n) => n + 1)}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white font-bold py-2.5"
          >
            Try again
          </button>
          <button
            onClick={async () => { clearRoleSession(); forgetEntry(); await signOut(); }}
            className="mt-2 w-full rounded-xl bg-[#101A2E] ring-1 ring-white/15 text-[#C7D6E8] font-semibold py-2.5"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (state === "wrong") {
    const signOutNow = async () => { clearRoleSession(); forgetEntry(); await signOut(); };
    return (
      <div className="min-h-screen bg-[#070B12] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#0C1424] ring-1 ring-white/10 rounded-2xl p-6 text-center">
          <AlertTriangle size={28} className="text-[#E0A93B] mx-auto" />
          <h1 className="text-white text-lg font-extrabold uppercase tracking-wide mt-3">
            Wrong shop
          </h1>
          <p className="text-[#9FB3CC] text-sm mt-2 leading-relaxed">
            {session.user.email} is signed in, but this account does not work at{" "}
            <span className="font-semibold text-[#C7D6E8]">{shop?.name || slug}</span>.
          </p>

          {/* The way to where they DO belong, if they belong somewhere. A message
              that only says no is a message somebody has to guess their way out of. */}
          {mine.length > 0 && (
            <div className="mt-4">
              <p className="text-[#6F8299] text-[11px] uppercase tracking-widest font-bold mb-2">
                Your shop{mine.length > 1 ? "s" : ""}
              </p>
              {mine.map((m) => (
                <a
                  key={m.slug}
                  href={`/${m.slug}/login`}
                  className="block w-full rounded-xl bg-gradient-to-r from-[#2563EB] to-[#06B6D4] text-white font-bold py-2.5 mb-2"
                >
                  Open {m.name || m.slug}
                </a>
              ))}
            </div>
          )}

          <button
            onClick={signOutNow}
            className="mt-2 w-full rounded-xl bg-[#101A2E] ring-1 ring-white/15 text-[#C7D6E8] font-semibold py-2.5"
          >
            Sign out
          </button>
          {onChooseShop && (
            <button
              onClick={onChooseShop}
              className="mt-3 text-[#6F8299] text-[12px] underline"
            >
              Choose a different shop
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/* What to call a screen when it is being talked about rather than tapped: a Back
   button, a pane heading, a toast. The shop's own name for it, because a warning
   that says "Add a List of Parts" about a menu entry reading "Book In a Delivery" is
   a warning about some other shop's app. */
const labelFor = (id, slug = "") =>
  moduleLabel(slug, id, NAV.find((n) => n.id === id)?.label || "") || "Screen";

/* One half of a split screen.

   The heading is not decoration. Two lists side by side with nothing naming them
   is how somebody adds stock to the part they were only comparing against — so
   each pane says what it is, and the second one says it with the picker that
   changes it, which is also the only way to change it. */
function Pane({ side, title, value, choices, onPick, onClose, children }) {
  return (
    <section className="min-w-0 rounded-lg border border-[#DEE3E9] bg-[#FFFFFF]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#DEE3E9] bg-[#EEF2F6] rounded-t-lg">
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#5A6472] shrink-0">
          {side}
        </span>
        {choices ? (
          <select
            value={value}
            onChange={(e) => onPick(e.target.value)}
            aria-label="Which screen to show beside this one"
            className="min-w-0 flex-1 bg-[#FFFFFF] border border-[#DEE3E9] rounded-md px-2 py-1 text-sm font-semibold text-[#1B2430]"
          >
            {choices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 text-sm font-bold uppercase tracking-wide truncate">
            {title}
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            title="Close the second screen"
            aria-label="Close the second screen"
            className="shrink-0 p-1 rounded-md text-[#5A6472] hover:bg-[#FFFFFF] hover:text-[#DC3B2E]"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function BypassShop({ session, shop, onLeave, onChooseShop }) {
  /* The shop's own name, on its own screens. Hardcoding "Jaspare Auto" here was
     harmless while there was one shop and becomes a lie the moment there are two —
     a Surefit storekeeper reading "Jaspare Auto" above their own stock has every
     reason to think they are looking at the wrong shop's numbers. */
  const shopTitle = shop?.name || SHOP_INFO.branch.name;
  const { items, loading: itemsLoading, error, reload: reloadItems, stale } = useInventory();
  const { notifications, reload: reloadNotifications } = useNotifications();
  /* The full sales register, for Reports. The activity feed above is capped at
     200 rows so it loads fast, which makes it the wrong source for a month or a
     year of takings. */
  const { sales: salesRegister, ready: registerReady, reload: reloadSales } = useSales();
  /* The built-in sections plus any the shop has added itself. Live, so a
     category created on one phone reaches the others without a refresh. */
  const { categories: CATEGORIES, reload: reloadCategories } = usePartCategories();

  /* An undone sale changes both stock and the activity log, and it happens
     inside a database function that realtime can't fully describe — so pull
     both back down afterwards. */
  const refreshAfterUndo = useCallback(() => {
    reloadItems();
    reloadNotifications();
    // The register too, or Reports keeps counting money for goods that came back.
    reloadSales();
  }, [reloadItems, reloadNotifications, reloadSales]);

  /* After the instruction box has written something. It can add a section as
     well as change parts, and a new section that doesn't appear in the pickers
     until the app is restarted looks like it wasn't saved — so the section list
     is pulled back down too. */
  const refreshAfterCommand = useCallback(async () => {
    await Promise.all([
      reloadItems(),
      reloadNotifications(),
      reloadCategories(),
    ].map((p) => Promise.resolve(p).catch(() => {})));
  }, [reloadItems, reloadNotifications, reloadCategories]);
  const admin = isAdmin(session);
  // Shared role logins are pre-trusted — the role password is the
  // authorisation, so they never sit in the approval queue.
  const roleLogin = isRoleAccount(session);
  const [user, setUser] = useState(session.user.user_metadata?.full_name || "Staff");
  /* Where a sign-in lands. Not always the dashboard: Quick Jet has no dashboard, so
     it opens on its parts list. See src/lib/shopModules.js. */
  const [tab, setTab] = useState(() => firstScreenFor(shop?.slug));
  const [history, setHistory] = useState([]); // screens visited, for the Back button
  const [toast, setToast] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  // Light or dark screen — the header button flips it, Settings has all
  // three choices (light / dark / match the device).
  const [, setThemeChoice, themeMode] = useTheme();
  const [ledgerCode, setLedgerCode] = useState("");
  // A part chosen from the Search long-press menu, carried to the target screen.
  // { code, action } — action is "sell" | "quote" | "edit" | "info" | "stock".
  const [picked, setPicked] = useState(null);
  // Biometric app-lock: gate the app until unlocked this session.
  const [locked, setLocked] = useState(() => isLockEnabled() && !isUnlocked());
  // Show the welcome guide until this device has seen it once.
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem("bp_seen_welcome") !== "1"
  );
  const now = useClock();
  // Admin-approval gate: null = still checking, true/false = known.
  // Admins are always allowed; only non-admin accounts can be held pending.
  const [approved, setApproved] = useState(admin || roleLogin ? true : null);
  // This staff account's granted capabilities (admins have all implicitly).
  const [myPerms, setMyPerms] = useState(() => rolePermissions(session));

  useEffect(() => {
    if (admin || roleLogin) { setApproved(true); return; }
    let alive = true;
    // Baseline force-logout time seen at load; a newer one means an admin
    // signed us out since. null until first read so we don't sign out on boot.
    let logoutBaseline = null;
    const check = () => {
      api.getMyApproval(session.user.id).then((ok) => { if (alive) setApproved(ok); });
      api.getMyPermissions(session.user.id).then((p) => { if (alive) setMyPerms(p.permissions); });
      api.getForceLogoutAt(session.user.id).then((ts) => {
        if (!alive) return;
        if (logoutBaseline === null) { logoutBaseline = ts; return; }
        if (ts > logoutBaseline) { forgetEntry(); signOut(); }
      });
    };
    check();
    // Re-check whenever profiles change so a pending screen unlocks instantly,
    // newly-granted permissions appear, and a force-logout takes effect — all
    // without a refresh.
    const unsub = api.subscribeProfiles(check);
    return () => { alive = false; unsub(); };
  }, [admin, roleLogin, session.user.id]);

  const can = useCallback(
    (cap) => hasCap(cap, { admin, permissions: myPerms }),
    [admin, myPerms]
  );
  /* TWO DIFFERENT QUESTIONS, BOTH ASKED.

     Does this SHOP have the screen (shopModules.js — Quick Jet does not buy on
     credit, so it has no Credit Accounts at all), and is it open to this PERSON
     (NAV's own cap / admin rules). A Quick Jet admin passes the second and still
     does not see Financial Statements, because being allowed to do everything is not
     the same as having everywhere to do it. */
  const shopSlug = shop?.slug || "";
  /* Then the shop's own order and its own words for what is left — see
     shopModules.js. Both are no-ops at a shop that has not asked for either, so this
     is the whole menu for every shop and there is no second path to keep in step. */
  const navItems = orderScreens(
    shopSlug,
    NAV.filter((n) => {
      if (!screenAllowed(shopSlug, n.id)) return false;
      if (n.admin) return admin;
      if (n.staffOnly) return !admin;
      if (n.cap) return can(n.cap);
      return true;
    })
  ).map((n) => {
    const label = moduleLabel(shopSlug, n.id, n.label);
    return label === n.label ? n : { ...n, label };
  });

  /* Handed to the screens that have their own name here, so the heading on the page
     matches the entry in the menu. Null everywhere else, and a screen given null keeps
     the words written inside it. */
  const screenName = (id) => moduleScreen(shopSlug, id);

  /* A screen the shop does not have can still be ASKED for — a tab remembered from
     a bigger shop on the same phone, a long-press that offers to sell a part, a
     handoff from the ask-or-tell box. The menu filter above hides them; this is what
     makes the hiding true. Sent to the shop's own first screen rather than to the
     dashboard, because at Quick Jet there isn't one. */
  useEffect(() => {
    if (!screenAllowed(shopSlug, tab)) setTab(firstScreenFor(shopSlug));
  }, [shopSlug, tab]);

  /* ---- two screens at once ----
     So a list can be read against another list — what to reorder beside what is
     on the shelf, a printed stock list beside the parts it came from — instead of
     tapping back and forth holding a part number in your head.

     Offered from a wide screen only, and the panes stack on anything narrower.
     Which screen sits on the right is remembered per device; the rules for
     choosing it, including never showing the same screen twice, are in
     src/lib/split.js where they can be tested. */
  const splitOffered = canSplit(navItems);
  const [splitOn, setSplitOn] = useState(() => readSplit(localStorage));
  const [rightWant, setRightWant] = useState(() => readRightTab(localStorage));
  const rightTab = rightScreen({ want: rightWant, left: tab, allowed: navItems });
  const split = splitOn && splitOffered && Boolean(rightTab);
  const toggleSplit = () => {
    setSplitOn((on) => { writeSplit(localStorage, !on); return !on; });
    setNavOpen(false);
  };
  const pickRight = (id) => { writeRightTab(localStorage, id); setRightWant(id); };

  // Re-lock when the app goes to the background, so returning asks for biometric again.
  useEffect(() => {
    // Only re-lock after being in the background for a while, so a quick
    // switch to another app (or a notification) doesn't force a re-unlock.
    const GRACE_MS = 3 * 60 * 1000; // 3 minutes
    let hiddenAt = 0;
    const onVisibility = () => {
      if (!isLockEnabled()) return;
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > GRACE_MS) {
        lockNow();
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const dismissWelcome = () => {
    localStorage.setItem("bp_seen_welcome", "1");
    setShowWelcome(false);
  };

  // Resolve the staff display name. On a shared role login the profile name
  // belongs to whoever logged in last, so trust the name typed on this device.
  useEffect(() => {
    if (roleLogin) {
      const mine = getRolePersonName();
      if (mine) { setUser(mine); return; }
    }
    getProfileName(session.user.id, session.user.email).then((n) => n && setUser(n));
  }, [roleLogin, session.user.id]);

  // Log this login once per session so the main shop sees who signed in.
  useEffect(() => {
    const key = `bp_login_logged_${session.user.id}_${session.access_token?.slice(-8)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const who = session.user.user_metadata?.full_name || session.user.email || "Staff";
    api.logLogin(who).catch(() => {});
  }, [session.access_token]);

  const openLedger = (code) => {
    setLedgerCode(code);
    go("ledger");
  };

  /* The code to preselect on a screen, but only for the action that asked
     for it — so returning to Sell later starts clean. */
  const pickFor = (action) => (picked?.action === action ? picked.code : "");

  /* A quotation or a batch of sales, carried into the Receipt screen so the same
     list of parts is not typed a second time off a printed page. Held here rather
     than inside ReceiptTab because the thing that starts it — a saved quote, a
     recorded sale — is on a different screen.

     The whole draft is kept, not an id, so the receipt screen needs no second
     fetch and works the same whether the source was a quote or a set of sales. */
  const [receiptDraft, setReceiptDraft] = useState(null);
  /* The receipt screen is remounted when a draft arrives, which is how its fields
     get seeded. Counted rather than keyed on the draft itself, for two reasons:
     the same quote sent over twice must still open a fresh receipt, and clearing
     the draft once it has been used must NOT remount — doing that wiped the
     "Saved as RC-…" line off the screen the instant a receipt saved. */
  const [receiptSeq, setReceiptSeq] = useState(0);
  const openReceiptFrom = (draft) => {
    setReceiptDraft(draft);
    setReceiptSeq((n) => n + 1);
    go("receipt");
  };

  /* The same idea for a quotation. An order off the public list can become
     either document — the price they asked for, or the receipt for the money
     they are bringing — and which one it is only becomes clear on the phone. */
  const [quoteDraft, setQuoteDraft] = useState(null);
  const [quoteSeq, setQuoteSeq] = useState(0);
  const openQuoteFrom = (draft) => {
    setQuoteDraft(draft);
    setQuoteSeq((n) => n + 1);
    go("quote");
  };
  /* A customer order, on its way to being one or the other. Converted here so
     both screens are handed the identical draft — see src/lib/receiptDraft.js. */
  const quoteFromOrder = (order) => {
    const d = orderToDraft(order);
    if (d) openQuoteFrom(d);
    else showToast("That order has no parts on it.", "warn");
  };
  const receiptFromOrder = (order) => {
    const d = orderToDraft(order);
    if (d) openReceiptFrom(d);
    else showToast("That order has no parts on it.", "warn");
  };

  /* A part was long-pressed in Search and an action chosen. Carry the part
     over to the right screen so staff don't have to search for it twice. */
  const handlePick = (action, item) => {
    if (action === "ledger") { openLedger(item.code); return; }
    const target = action === "info" ? "edit" : action;
    /* Said out loud rather than silently bounced by the guard above: a tap that
       appears to do nothing is a tap somebody makes four more times. */
    if (!navItems.some((n) => n.id === target)) {
      showToast(`${labelFor(target, shopSlug)} isn't on this shop's menu.`, "warn");
      return;
    }
    setPicked({ code: item.code, action, tab: target });
    go(target);
  };

  // Once the person leaves the screen we sent them to, forget the pick so
  // opening that screen again from the menu starts fresh.
  useEffect(() => {
    if (picked && tab !== picked.tab) setPicked(null);
  }, [tab, picked]);
  // Step back to the previous screen. Also driven by the phone's hardware/
  // gesture back button via the popstate listener below.
  const goBack = useCallback(() => {
    setNavOpen(false);
    setHistory((h) => {
      if (h.length === 0) return h;
      setTab(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }, []);

  /* ---------- WHAT "BACK" MEANS, AND WHERE IT STOPS ----------

     Every screen visited is on the stack above, so Back walks back through them.
     The screen you land on after signing in is not on it — nothing was visited
     before it — and until now that meant the Back button simply was not there, and
     the whole way in (shop list → this shop → working here → sign in) was a
     one-way street. On a phone, with no address bar to edit, a storekeeper who
     opened the wrong shop had nothing to press.

     So when the stack runs out, Back keeps going: out to this shop's front door,
     which is where the shop list and the customer page both are. It does NOT sign
     anybody out — the session is still there, "working here" walks straight back
     in — because logging somebody out for pressing Back would be a punishment for
     looking.

     This is the same route the phone's own back gesture already takes, and that is
     the point: the button on the screen and the button on the phone should not
     disagree about where back is.

     Named, not just an arrow. "Back" from a screen you reached three taps ago is a
     question; "Back to Search" is an answer. */
  const back = useMemo(() => {
    if (history.length) {
      const id = history[history.length - 1];
      /* Every screen the menu can reach is in NAV, so the name comes from there and
         cannot drift from the menu. A screen that is not in it (there is none today)
         gets the plain word rather than a made-up name. */
      const label = moduleLabel(shopSlug, id, NAV.find((n) => n.id === id)?.label || "");
      return { label: label || "Back", title: `Back to ${label || "the last screen"}`, act: goBack };
    }
    if (onLeave) {
      return {
        label: "Front page",
        title: `Back to ${shop?.name || "this shop"}'s front page — you stay signed in`,
        act: onLeave,
      };
    }
    /* Neither a screen behind nor a door out: one shop, opened at a bare address.
       Nothing to offer, and an arrow that goes nowhere is worse than no arrow. */
    return null;
  }, [history, goBack, onLeave, shop?.name, shopSlug]);
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
  /* A whole pasted list at once. Each part is saved on its own so one bad
     line can never lose the rest — the screen reports what went in and
     what didn't. Serials come from the DB one at a time, so codes stay
     unique even if another phone is adding stock at the same moment. */
  const handleAddMany = async (newItems) => {
    let failed = 0;
    let firstError = "";
    // What went in, so ONE summary notification can name the batch instead
    // of the feed filling with a near-identical line for every part.
    const saved = [];
    for (const it of newItems) {
      try {
        const serial = await api.nextSerial();
        const base = generateCode(it, items).replace(/-\d+$/, "");
        const code = `${base}-${String(serial).padStart(4, "0")}`;
        await api.insertItem({ ...it, code }, user, { batch: true });
        saved.push({ code, name: it.name, qty: it.qty });
      } catch (e) {
        failed++;
        if (!firstError) firstError = e.message || String(e);
      }
    }
    const added = saved.length;
    if (added) {
      await api.addBatchNotification({ type: "new_item", by_name: user, parts: saved });
      api.emailBatch("new_item", saved, user);
      reloadItems();
    }
    showToast(
      failed
        ? `${added} added, ${failed} failed`
        : `${added} part${added !== 1 ? "s" : ""} added to inventory`,
      failed ? "warn" : "ok"
    );
    return { added, failed, firstError };
  };
  /* There is no longer a second half to a pasted list. Every line on it is a new
     part — the owner's rule, recorded in planRows (src/lib/parseParts.js) — so the
     batch restock handler that used to live here has gone with the screen that
     called it. Adding pieces to a part that exists is handleAddStock, below, one
     part at a time, from the screen where somebody is looking at that part. */
  const handleAddStock = (code, amount, supplier = "") =>
    run(() => api.addStock(code, amount, user, supplier), `+${amount} stock added to ${code}`);
  const handleSell = (sale) =>
    run(async () => { await api.sellItem(sale, user); setTab(admin ? "notify" : "dashboard"); },
      `Sold ${sale.qty} × ${sale.code}${sale.deduct === false ? " (from another branch — stock unchanged)" : ""} — sent to ${shopTitle}`,
      sale.paid ? "ok" : "warn");
  /* Returns whether it actually went through, because Edit Parts saves the
     count and the details one after the other and must not carry on past a
     failed count. */
  const handleAdjust = async (code, newQty, reason) => {
    let ok = false;
    await run(async () => { await api.adjustQty(code, newQty, reason, user); ok = true; },
      `Adjusted ${code} → ${newQty}`);
    return ok;
  };
  /* `info` says where the stock went — see DeleteItemSheet. It is optional
     so any caller that still deletes without asking keeps working. */
  const handleDelete = (code, info = {}) =>
    run(
      () => api.deleteItem(code, user, info),
      info.disposal
        ? `${code} removed — ${api.disposalLabel(info.disposal).toLowerCase()}${info.takenBy ? `: ${info.takenBy}` : ""}`
        : `Deleted ${code}`,
      "warn"
    );
  const handleEditItem = async (code, patch) => {
    let ok = false;
    await run(async () => { await api.updateItem(code, patch, user); ok = true; }, `Updated ${code}`);
    return ok;
  };
  // Bulk actions from the Inventory multi-select toolbar.
  // Several parts leaving together share one answer about where they went,
  // and produce ONE notification and one email between them.
  const handleBulkDelete = (codes, info = {}) =>
    run(async () => {
      const { gone } = await api.deleteItemsBulk(codes, user, info);
      api.emailBatch("delete", gone, user);
    }, `${codes.length} item${codes.length !== 1 ? "s" : ""} removed${info.takenBy ? ` — ${info.takenBy}` : ""}`, "warn");
  const handleBulkAddStock = (codes, amount) =>
    run(async () => {
      const { done } = await api.addStockBulk(codes, amount, user);
      api.emailBatch("stock", done, user);
    }, `+${amount} added to ${codes.length} item${codes.length !== 1 ? "s" : ""}`);

  const handleQuick = (t) => {
    if (t.kind === "new") handleAddItem(t.item);
    else if (t.kind === "add") handleAddStock(t.code, t.qty, t.supplier);
    else if (t.kind === "out") handleSell(t);
    else if (t.kind === "adjust") handleAdjust(t.code, t.newQty, t.reason);
  };

  /* forgetEntry() so the doors belong to a login and not to a phone: the next
     person to sign in on this counter phone gets the whole way in, not the tail
     end of somebody else's. */
  const handleLogout = async () => { clearRoleSession(); forgetEntry(); await signOut(); };

  const lowStockCount = useMemo(
    () => items.filter(isLowStock).length,
    [items]
  );

  const go = useCallback((id) => {
    setNavOpen(false);
    setTab((cur) => {
      if (id === cur) return cur;
      // Remember where we came from, and push a browser history entry so the
      // phone's back button / gesture pops back to it instead of leaving the app.
      setHistory((h) => (h[h.length - 1] === cur ? h : [...h, cur]));
      try { window.history.pushState({ tab: id }, ""); } catch { /* ignore */ }
      return id;
    });
  }, []);

  /* ---------- the assistant sending somebody somewhere ----------
     "generate a report for last month" opens Reports already set to last month;
     "who owes us money" opens Credit Accounts; a question about one part offers
     its ledger or the Sell screen with the part already chosen.

     The assistant does not build the document itself. Reports, Receipt,
     Quotation and Financial Statements already do it properly, and a second
     half-built version somewhere else is how two papers for the same sale start
     to disagree. So the box answers the question and then opens the screen,
     pointed at the same window the answer measured — an answer that says one
     thing and a screen that shows another is worse than no button at all.

     Held as one handoff rather than a state per screen, because only one screen
     is open at a time and each of them reads its opening position once, on
     mount. The counter is what makes a second handoff to the SAME screen take
     effect: asking twice must move the screen twice. */
  const [handoff, setHandoff] = useState(null); // { tab, options, seq }
  const handoffFor = (id) => (handoff && handoff.tab === id ? handoff.options : null);
  const assistantGo = (id, options = {}) => {
    if (!id) return;
    /* Somebody without the rights for a screen should be told, not shown a blank
       one. The rules live in NAV, so this can never drift from the menu. */
    const nav = NAV.find((n) => n.id === id);
    if (nav && !navItems.some((n) => n.id === id)) {
      showToast(`${labelFor(id, shopSlug)} isn't open to your account — ask an admin.`, "warn");
      return;
    }
    if (id === "ledger" && options.code) { setHandoff(null); openLedger(options.code); return; }
    /* Screens that take a part use the same carrier as a long-press in Search,
       so there is one way a part travels between screens rather than two. */
    if (options.code && ["sell", "stock", "edit", "quote"].includes(id)) {
      setPicked({ code: options.code, action: id, tab: id });
    }
    setHandoff({ tab: id, options, seq: (handoff?.seq || 0) + 1 });
    go(id);
  };
  /* Forget it once the screen has been left, so reaching that screen from the
     menu later opens it clean — the same rule as a long-pressed part. */
  useEffect(() => {
    if (handoff && tab !== handoff.tab) setHandoff(null);
  }, [tab, handoff]);

  // Make the phone's hardware/gesture back button step back one screen.
  useEffect(() => {
    const onPop = () => goBack();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [goBack]);

  if (locked) {
    return <LockScreen user={user} onUnlocked={() => { markUnlocked(); setLocked(false); }} />;
  }

  // Hold personal (non-admin, non-role) accounts on the pending screen until
  // an admin approves them. Role logins are already authorised by password.
  if (!admin && !roleLogin && approved === false) {
    return <PendingGate user={user} onSignOut={handleLogout} />;
  }

  /* ---------- one screen, drawn for whichever pane asked ----------
     Every screen in the system is in here. It was written inline in <main> when
     only one could be open at a time; it takes an id now so the split view can
     ask for two of them. Nothing about a screen changed — only who is asking.

     The screens share the state that carries a part between them (`picked`,
     `handoff`), because there is one person tapping. Two panes on the same screen
     would therefore fight over it, which is why src/lib/split.js refuses to put
     the same screen in both. */
  const screenFor = (id) => (
    <>
      {id === "dashboard" && (
        <DashboardTab
          items={items}
          notifications={notifications}
          categories={CATEGORIES}
          user={user}
          onNav={go}
          onOpenLedger={openLedger}
          admin={admin}
        />
      )}
      {id === "quick" && can("quick") && (
        <QuickTab items={items} categories={CATEGORIES} onQuick={handleQuick} onOpenLedger={openLedger} />
      )}
      {id === "search" && (
        <SearchTab
          /* Keyed so a second handoff with different words re-seeds the
             field instead of leaving the first search sitting there. */
          key={`search-${handoff?.seq || 0}`}
          items={items}
          categories={CATEGORIES}
          onDelete={can("delete") ? handleDelete : undefined}
          onPick={handlePick}
          canEdit={can("edit")}
          initialQuery={handoffFor("search")?.q || ""}
          screen={screenName("search")}
        />
      )}
      {id === "inventory" && (
        <InventoryTab
          items={items}
          categories={CATEGORIES}
          onDelete={can("delete") ? handleDelete : undefined}
          onOpenLedger={openLedger}
          canEdit={can("edit")}
          onBulkDelete={can("delete") ? handleBulkDelete : undefined}
          onBulkAddStock={handleBulkAddStock}
          screen={screenName("inventory")}
        />
      )}
      {id === "lowstock" && <LowStockTab items={items} categories={CATEGORIES} onOpenLedger={openLedger} />}
      {id === "ledger" && <LedgerTab items={items} categories={CATEGORIES} initialCode={ledgerCode} onDelete={can("delete") ? handleDelete : undefined} />}
      {/* The instruction box lives at the bottom of both adding screens, so
          it needs who is asking (for the ledger entry), whether they may
          change a section or many parts, and a way to pull the stock list
          and the section list back down once it has. */}
      {id === "add" && can("additem") && (
        <AddItemTab
          items={items}
          categories={CATEGORIES}
          sales={salesRegister}
          salesReady={registerReady}
          onAdd={handleAddItem}
          user={user}
          admin={admin}
          canEdit={can("edit")}
          canDelete={can("delete")}
          onChanged={refreshAfterCommand}
          onGo={assistantGo}
        />
      )}
      {id === "bulk" && can("additem") && (
        <BulkAddTab
          /* Remounted on each handoff so a list sent over from the Ask-or-tell box
             replaces whatever was on this screen. Without the key, React keeps the
             old state and the new list never appears. */
          key={`bulk-${handoff?.seq || 0}`}
          initialText={handoffFor("bulk")?.text || ""}
          screen={screenName("bulk")}
          items={items}
          categories={CATEGORIES}
          sales={salesRegister}
          salesReady={registerReady}
          onAddMany={handleAddMany}
          user={user}
          admin={admin}
          canEdit={can("edit")}
          canDelete={can("delete")}
          onChanged={refreshAfterCommand}
          onGo={assistantGo}
        />
      )}
      {id === "prices" && can("edit") && (
        <PricesTab
          items={items}
          categories={CATEGORIES}
          user={user}
          canEdit={can("edit")}
          onChanged={refreshAfterCommand}
        />
      )}
      {id === "edit" && can("edit") && (
        <EditPartsTab
          key={pickFor("edit") || pickFor("info") || "edit"}
          items={items}
          categories={CATEGORIES}
          onSave={handleEditItem}
          onAdjust={handleAdjust}
          initialCode={pickFor("edit") || pickFor("info")}
          focusInfo={Boolean(pickFor("info"))}
        />
      )}
      {id === "stock" && (
        <AddStockTab
          key={pickFor("stock") || "stock"}
          items={items}
          categories={CATEGORIES}
          onAddStock={handleAddStock}
          initialCode={pickFor("stock")}
        />
      )}
      {id === "sell" && (
        <SellTab
          key={pickFor("sell") || "sell"}
          items={items}
          categories={CATEGORIES}
          onSell={handleSell}
          /* So a wrong count can be corrected without leaving the sale. It
             is the same action as Add New Stock, which everybody may use —
             just reached from where the wrong count actually shows up. */
          onAddStock={handleAddStock}
          initialCode={pickFor("sell")}
          /* Whose name goes against an M-Pesa prompt. A prompt is a request for
             money made in the shop's name, so it records who made it. */
          user={user}
          /* Who may undo somebody else's sale on the All sales list. Staff can
             undo their own; the owner can undo anyone's. */
          admin={admin}
          /* A return puts the part back on the shelf, so the shelf on every other
             screen has to be told. Same callback the Notifications undo uses. */
          onChanged={refreshAfterUndo}
        />
      )}
      {id === "orders" && (
        <CustomerOrdersTab user={user} onQuote={quoteFromOrder} onReceipt={receiptFromOrder} />
      )}
      {id === "quote" && (
        /* Keyed on the arrival count as well as the picked part, for the same
           reason the receipt screen is: a quote arriving from an order must
           replace what is half-typed here rather than merge into it. */
        <QuotationTab
          key={`quote-${quoteSeq}-${pickFor("quote") || ""}`}
          items={items}
          user={user}
          initialCode={pickFor("quote")}
          draft={quoteDraft}
          onMakeReceipt={openReceiptFrom}
        />
      )}
      {id === "receipt" && (
        /* Keyed on the arrival count, so coming from a quote replaces whatever
           was half-typed on this screen instead of merging into it — a receipt
           that is half one customer and half another is worse than a blank
           one. The key does not change when the draft is cleared. */
        <ReceiptTab
          key={`receipt-${receiptSeq}`}
          items={items}
          user={user}
          draft={receiptDraft}
          onDraftUsed={() => setReceiptDraft(null)}
        />
      )}
      {id === "credit" && <CreditAccountsTab user={user} admin={admin} />}
      {id === "transfers" && <TransfersTab items={items} user={user} admin={admin} />}
      {id === "feed" && (
        <StaffFeedTab
          userId={session.user.id}
          user={user}
          admin={admin}
          screen={screenName("feed")}
          /* The assistant pane's half. The register, not the activity feed,
             so "what did we sell this month" counts every sale rather than
             the last 200 things that happened — and registerReady so an
             unreadable register is said out loud instead of read as zero. */
          items={items}
          categories={CATEGORIES}
          sales={salesRegister}
          salesReady={registerReady}
          canEdit={can("edit")}
          canDelete={can("delete")}
          onChanged={refreshAfterCommand}
          onGo={assistantGo}
        />
      )}
      {id === "notify" && admin && (
        <NotifyTab notifications={notifications} admin={admin} onChanged={refreshAfterUndo} />
      )}
      {id === "print" && <PrintStockTab items={items} categories={CATEGORIES} />}
      {id === "reports" && (
        <ReportsTab
          /* Keyed on the handoff, so being sent here a second time for a
             different period actually moves the screen. Without it the
             answer would say July and the report would still show today. */
          key={`reports-${handoff?.seq || 0}`}
          items={items}
          notifications={notifications}
          categories={CATEGORIES}
          admin={admin}
          onChanged={refreshAfterUndo}
          onNav={go}
          salesRegister={salesRegister}
          registerReady={registerReady}
          initialTarget={handoffFor("reports")}
        />
      )}
      {id === "finance" && (
        <FinanceTab
          key={`finance-${handoff?.seq || 0}`}
          user={user}
          admin={admin}
          initialView={handoffFor("finance")?.view || "statements"}
        />
      )}
      {id === "permissions" && !admin && <MyPermissionsTab userId={session.user.id} />}
      {id === "approvals" && admin && <ApprovalsTab currentUserId={session.user.id} />}
      {id === "settings" && (
        <SettingsTab
          categories={CATEGORIES}
          user={user}
          email={session.user.email}
          admin={admin}
          onCategoriesChanged={reloadCategories}
          screen={screenName("settings")}
        />
      )}
    </>
  );

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
          <div className="text-[#5A6472] text-[10px] font-bold tracking-[0.25em] uppercase">{SHOP_INFO.eyebrow}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <ShopMark size={20} fallback={<Boxes size={20} className="text-[#2563EB]" />} />
            <span className="text-lg font-extrabold uppercase tracking-wide bg-gradient-to-r from-[#2563EB] to-[#15926A] bg-clip-text text-transparent">{shopTitle}</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {navItems.map((n) => {
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
          <button onClick={() => { setShowWelcome(true); setNavOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#2563EB]">
            <HelpCircle size={17} /> Guide
          </button>
          {/* For the people who work at more than one of these shops. Offered only
              where there is more than one shop to go to (see chooseShop in main.jsx),
              and it does not sign anybody out — the other shop's own sign-in decides
              that, which is the whole point of them being separate shops. */}
          {onChooseShop && (
            <button
              onClick={() => { setNavOpen(false); onChooseShop(); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#2563EB]"
            >
              <Store size={17} /> Another shop
            </button>
          )}
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#DC3B2E]">
            <LogOut size={17} /> Logout
          </button>
          <div className="text-center text-[10px] text-[#5A6472] mt-2 leading-tight">
            Developed by
            <div className="font-semibold text-[#1B2430]">Josphat Mbugua Kagiri</div>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-[#DEE3E9] bg-[#FFFFFF] px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
          <button onClick={() => setNavOpen(true)} className="lg:hidden text-[#5A6472]">
            <Menu size={22} />
          </button>
          {back && (
            <button
              onClick={back.act}
              className="flex items-center gap-1 text-[#2563EB] font-semibold text-sm rounded-md px-2 py-1 hover:bg-[#EEF2F6] transition-colors shrink-0 max-w-[45%]"
              title={back.title}
            >
              <ArrowLeft size={18} className="shrink-0" />
              {/* The name of the screen it goes back to, where there is room for it.
                  On a phone the arrow alone, which is what a phone already means by
                  it. */}
              <span className="hidden sm:inline truncate">{back.label}</span>
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[#5A6472] text-[10px] font-bold tracking-[0.2em] uppercase">
              {shopTitle}
            </div>
            <div className="text-sm sm:text-base font-bold uppercase tracking-wide truncate">
              Branch Inventory Management
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 sm:gap-4 shrink-0">
            {/* Two lists at once. Offered on a wide screen only — the panes do
                stack on a narrow one, but nobody wants that on a phone, so the
                button is not put where a thumb will find it by accident. */}
            {splitOffered && (
              <button
                onClick={toggleSplit}
                aria-pressed={split}
                className={`hidden lg:block p-2 rounded-md transition-colors ${
                  split ? "bg-[#2563EB] text-[#F3F5F8]" : "text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#2563EB]"
                }`}
                title={split ? "Back to one screen at a time" : "Open a second screen beside this one"}
                aria-label={split ? "Close the second screen" : "Open a second screen"}
              >
                <Columns2 size={18} />
              </button>
            )}
            {/* One tap between the bright and dark screen. Settings has the
                third option (follow the phone's own setting). */}
            <button
              onClick={() => setThemeChoice(themeMode === "dark" ? "light" : "dark")}
              className="p-2 rounded-md text-[#5A6472] hover:bg-[#EEF2F6] hover:text-[#2563EB] transition-colors"
              title={themeMode === "dark" ? "Switch to the bright screen" : "Switch to the dark screen"}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {themeMode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
              <div className="text-[10px]">
                <span className={`font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${admin ? "bg-[#2563EB22] text-[#2563EB]" : "bg-[#6B748022] text-[#5A6472]"}`}>
                  {admin ? "Admin" : "Staff"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* One screen keeps its comfortable reading width; two are given the
            whole window, because half of 3xl is a column too narrow for a table
            of parts. */}
        <main className={`flex-1 p-4 w-full mx-auto ${split ? "max-w-[1700px]" : "max-w-3xl"}`}>
          {/* When the phone's saved copy of the stock list is what's on screen,
              this replaces the red error rather than joining it. Both at once
              would say "broken" about a screen that is full of usable stock —
              but saying nothing would be worse, because every quantity below is
              as old as the timestamp and somebody is about to sell from it. */}
          {stale ? (
            <div className="bg-[#FEF6E7] border border-[#E0A93B] text-[#6B5417] rounded-md p-3 text-sm mb-4 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">No connection — this is what this phone last saw.</span>{" "}
                Taken {cacheAge(stale.at, Date.now())}. Quantities and prices may
                have changed since, and nothing can be sold or edited until the
                shop is back online.
              </div>
            </div>
          ) : error ? (
            <div className="bg-[#FBEAE8] border border-[#DC3B2E] text-[#DC3B2E] rounded-md p-3 text-sm mb-4 flex items-center gap-2">
              <AlertTriangle size={15} /> {error}
            </div>
          ) : null}
          {itemsLoading && (
            <div className="flex items-center gap-2 text-[#5A6472] text-sm mb-4">
              <Loader2 size={14} className="animate-spin" /> Loading shared inventory from the cloud…
            </div>
          )}

          {split ? (
            /* Side by side from lg up, one under the other below it — two
               half-width lists on a phone are two lists nobody can read. */
            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <Pane side="This screen" title={labelFor(tab, shopSlug)}>
                {screenFor(tab)}
              </Pane>
              <Pane
                side="Second screen"
                title={labelFor(rightTab, shopSlug)}
                value={rightTab}
                /* Not the screen already on the left: two of the same screen
                   would be two halves of one form pulling against each other. */
                choices={navItems.filter((n) => n.id !== tab)}
                onPick={pickRight}
                onClose={toggleSplit}
              >
                {screenFor(rightTab)}
              </Pane>
            </div>
          ) : (
            screenFor(tab)
          )}
        </main>
      </div>

      {showWelcome && <Welcome user={user} onClose={dismissWelcome} />}

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
