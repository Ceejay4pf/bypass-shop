/* One-off generator: turns the shop's real stock list into an INSERT sql file.
   Run:  node supabase/gen_myshop.mjs > supabase/myshop.sql
   These become normal rows in the DB — fully editable/deletable in the app. */

const BRANDS = {
  toyota: "TOY", nissan: "NIS", mazda: "MZD", honda: "HON", subaru: "SUB",
  mercedes: "MRC", bmw: "BMW", volkswagen: "VWG", audi: "AUD", isuzu: "ISZ",
  mitsubishi: "MIT", "land rover": "LRV", suzuki: "SUZ",
};
const abbr = (str, len = 3) => {
  const c = String(str || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c ? c.slice(0, len).padEnd(len, "X") : "XXX".slice(0, len);
};
const brandCode = (b) => BRANDS[String(b).toLowerCase()] || abbr(b, 3);
const sideCode = (s) => ({ Left: "L", Right: "R", Front: "F", Rear: "B" }[s] || "N");
const esc = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

// side: RHS->Right, LHS->Left ; position Front/Rear as-is
const R = "Right", L = "Left", F = "Front", B = "Rear";

// [cat, brand, model, year, side, spec]
const wings = [
  ["Toyota","Wish","2010",R,"Standard Wing"],
  ["Toyota","Wish","2010",R,"Wing with Indicator"],
  ["Toyota","Voxy","2010",R,"Wing with Bumper Slide"],
  ["Honda","Fit","2010",R,"Wing with Bumper Slide"],
  ["Unknown","","",R,"Standard Wing"],
  ["Toyota","Mark X","",R,"Wing with Bumper Slide"],
  ["Toyota","Caldina","2010",R,"Wing with Bumper Slide"],
  ["Toyota","Porte","",R,"Standard Wing"],
  ["Mazda","CX-5","",R,"Standard Wing"],
  ["Honda","Fit","2010",L,"Wing with Bumper Slide"],
  ["Toyota","Mark X","",L,"Wing with Bumper Slide"],
  ["Honda","CR-V RE4","",L,"Wing with Bumper Slide & Moulding"],
  ["Toyota","Raum","",L,"Standard Wing"],
  ["Mazda","CX-5","",L,"Standard Wing"],
  ["Toyota","Wish","2003",L,"Standard Wing"],
  ["Toyota","Wish","2003",L,"Wing with Bumper Slide"],
  ["Toyota","Ractis","2005",L,"Standard Wing"],
  ["Toyota","Wish","2010",L,"Standard Wing"],
  ["Toyota","Isis","",L,"Wing with Indicator"],
  ["Toyota","Rumion","",L,"Standard Wing"],
  ["Toyota","Premio","2008",L,"Standard Wing"],
  ["Nissan","Note","2012",L,"Standard Wing"],
  ["Nissan","Teana","2010",L,"Standard Wing"],
  ["Toyota","Auris","2010",L,"Standard Wing"],
  ["Toyota","Voxy","",L,"Standard Wing"],
  ["Toyota","Premio 240","",L,"Standard Wing"],
  ["Toyota","Wish","2003",L,"Wing with Indicator"],
  ["Subaru","N12","",L,"Standard Wing"],
  ["Nissan","X-Trail NT31","",L,"Standard Wing"],
  ["Toyota","Isis","",L,"Wing with Indicator"],
  ["Toyota","Belta","",L,"Standard Wing"],
  ["Toyota","Ractis","2010",L,"Standard Wing"],
  ["Toyota","Caldina","",L,"Wing with Bumper Slide"],
  ["Toyota","Wish","2003",L,"Wing with Moulding"],
  ["Toyota","Prado 150","",R,"Standard Wing"],
  ["Toyota","Isis","",R,"Wing with Indicator"],
  ["Nissan","X-Trail NT31","",R,"Wing with Bumper Slide & Wing Light"],
  ["Toyota","Passo","2005",R,"Standard Wing"],
  ["Nissan","Sylphy","2010",R,"Standard Wing"],
  ["Toyota","Premio 240","",R,"Standard Wing"],
  ["Toyota","Isis","",R,"Standard Wing"],
  ["Toyota","Rumion","",R,"Standard Wing"],
  ["Honda","CR-V RE4","",R,"Wing with Bumper Slide & Moulding"],
  ["Nissan","Teana","2010",R,"Standard Wing"],
  ["Toyota","Wish","2003",R,"Wing with Moulding & Bumper Slide"],
  ["Nissan","Note","2012",R,"Wing with Bumper Slide"],
  ["Mitsubishi","Pajero V75","2002",L,"Wing with Moulding & Wing Mirror"],
  ["Nissan","Juke","",L,"Wing with Bumper Slide"],
  ["Honda","CR-Z","",L,"Wing with Bumper Slide"],
  ["Mazda","Axela","2013",L,"Standard Wing"],
  ["Nissan","Dualis","",L,"Wing with Bumper Slide & Moulding"],
  ["Toyota","Isis","",L,"Standard Wing"],
  ["Nissan","Serena C26","",L,"Standard Wing"],
  ["Mitsubishi","RVR","",L,"Standard Wing"],
  ["Mitsubishi","Outlander","2012",L,"Wing with Bumper Slide"],
  ["Nissan","Dualis","",L,"Wing with Bumper Slide"],
  ["Suzuki","SX4","",L,"Standard Wing"],
  ["Mazda","Axela","2010",L,"Standard Wing"],
  ["Suzuki","Escudo","",R,"Wing with Bumper Slide"],
  ["Mazda","Axela","2010",R,"Standard Wing"],
  ["Honda","Crossroad","",R,"Wing with Bumper Slide"],
  ["Subaru","BP5","",R,"Wing with Bumper Slide"],
  ["Toyota","Prius","2008",R,"Wing with Bumper Slide"],
  ["Toyota","Vitz","2008",R,"Standard Wing"],
  ["Mitsubishi","Outlander","2012",R,"Wing with Bumper Slide"],
  ["Honda","Stream","",R,"Standard Wing"],
];

const bumpers = [
  ["Nissan","Teana","",F,"With Fog Lights"],
  ["Subaru","BR9","",F,"With Fog Lights & Grille"],
  ["Nissan","Serena (New Shape)","",F,"Standard"],
  ["Toyota","Spade","",B,"Standard"],
  ["Nissan","Note","",F,"With Grille"],
  ["Honda","Fit","2010",B,"With Reflector"],
  ["Honda","Fit (New Shape)","",B,"Standard"],
  ["Toyota","bB","",B,"Standard"],
  ["Mazda","CX-5","",B,"With Reflector"],
  ["Toyota","Prius","2008",F,"Complete with Fog Lights"],
  ["Nissan","March","2010",F,"Complete Assembly"],
];

const catFor = (side) =>
  side === "Left" ? "WNL" : side === "Right" ? "WNR" : side === "Front" ? "FBM" : "RBM";

let serial = 0;
const rows = [];
const build = (list) => {
  for (const [brand, model, year, side, spec] of list) {
    serial++;
    const cat = catFor(side);
    const yy = year ? String(year).slice(-2).padStart(2, "0") : "";
    const segs = [cat, brandCode(brand), abbr(model, 3)];
    if (yy) segs.push(yy);
    const sc = sideCode(side);
    if (sc !== "N") segs.push(sc);
    segs.push(String(serial).padStart(4, "0"));
    const code = segs.join("-");
    const yFrom = year ? Number(year) : null;
    const nameParts = [brand, model, year].filter((x) => x && x !== "Unknown" && x !== "—");
    const name = ([...nameParts, side, spec].filter(Boolean).join(" "));
    rows.push(
      `  (${esc(code)}, ${esc(cat)}, ${esc(brand)}, ${esc(model)}, ${yFrom ?? "null"}, ${yFrom ?? "null"}, ` +
      `'Genuine Used', ${esc(side)}, ${esc(name)}, 0, 1, 1, 'Unassigned', ${esc(spec)}, 'Active', 'Josphat Kamau')`
    );
  }
};
build(wings);
build(bumpers);

console.log("-- BYPASS SHOP — real stock import (editable rows, not hardcoded)");
console.log("-- Generated from the shop list dated 20 July 2026.");
console.log("insert into public.inventory");
console.log("  (code, cat, brand, model, year_from, year_to, condition, side, name, price, qty, min_qty, location, notes, status, created_by)");
console.log("values");
console.log(rows.join(",\n") + ";");
console.log("");
console.log("-- keep the app's serial generator ahead of these codes:");
console.log(`select setval('public.inventory_serial_seq', ${serial});`);
