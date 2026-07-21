/* ---------------------------------------------------------
   Database types — the shape of every table row.
   These mirror supabase/schema.sql exactly. Import them in
   editors for autocomplete; they also document the data model.
--------------------------------------------------------- */

export type MovementType = "new_item" | "stock" | "sale" | "adjust" | "return" | "delete";

export interface InventoryRow {
  code: string;            // primary key, e.g. "HDL-TOY-AUR-10-L-NX-0009"
  cat: string;             // category key, e.g. "HDL"
  brand: string | null;
  model: string | null;
  series: string | null;
  year_from: number | null;
  year_to: number | null;
  condition: string | null;
  side: string | null;
  variant: string | null;
  color: string | null;
  name: string | null;
  price: number;
  qty: number;
  min_qty: number;
  location: string | null;
  supplier: string | null;
  notes: string | null;
  images: string[];        // jsonb array of data URLs
  status: string;          // "Active" | ...
  created_by: string | null;
  created_at: string;      // ISO timestamp
  updated_at: string;
}

export interface NotificationRow {
  id: string;
  ts: string;
  type: MovementType;
  code: string | null;
  name: string | null;
  qty: number | null;
  by_name: string | null;
  buyer: string | null;
  phone: string | null;
  paid: boolean | null;
  total: number | null;
  remaining: number | null;
}

export interface StockMovementRow {
  id: string;
  ts: string;
  code: string;
  type: MovementType;
  qty: number | null;
  by_name: string | null;
  buyer: string | null;
  supplier: string | null;
  reason: string | null;
  paid: boolean | null;
  remaining: number | null;
}

export interface SaleRow {
  id: string;
  ts: string;
  code: string | null;
  name: string | null;
  qty: number | null;
  buyer: string | null;
  phone: string | null;
  paid: boolean | null;
  total: number | null;
  by_name: string | null;
}

export interface ProfileRow {
  id: string;              // = auth.users.id
  full_name: string | null;
  shop: string | null;
  created_at: string;
}

/* The in-app Item shape (camelCase) used by the UI. api.js maps
   between InventoryRow (snake_case, DB) and this. */
export interface Item {
  code: string;
  cat: string;
  brand: string;
  model: string;
  series?: string;
  yearFrom: number;
  yearTo: number;
  condition: string;
  side: string;
  variant?: string;
  color?: string;
  name: string;
  price: number;
  qty: number;
  min: number;
  location: string;
  supplier?: string;
  notes?: string;
  images: string[];
  status: string;
}
