/* ---------------------------------------------------------
   BYPASS SHOP — reading a list out of a document

   Somebody is sent a stock list. It arrives as an Excel file, or a Word table,
   or a WhatsApp text file, or a CSV off another shop's system. Retyping ninety
   lines of it is an evening's work and three typos, so this file opens the
   document, finds the list inside it and hands back plain text.

   WHAT IT DOES NOT DO, AND WHY THAT MATTERS
   It does not save anything. It produces TEXT and nothing else — the text drops
   into the same box somebody would have typed into, and from there it goes
   through the same reader, the same "is this already on the shelf" check and the
   same screen where every line is shown before a single part is written. A
   document is never trusted; it is only saved typing. That is deliberate: a
   spreadsheet from outside the shop is somebody else's idea of what a part is,
   and a person has to look at it before it becomes stock.

   WHAT IT CAN OPEN
     .csv .tsv .txt .md      read straight
     .xlsx                   unzipped and read (Excel 2007 and later)
     .docx                   unzipped and read, tables included
     .html .htm              tables and paragraphs
     .json                   a list of records
     .pdf                    best effort, and it says when the effort failed
   And what it cannot, with a straight answer rather than a mangled result:
     .xls .doc               the old binary formats — "save it as .xlsx or CSV"
     photographs, scans      there is no text in a picture to read

   HOW IT READS A SPREADSHEET
   A sheet with a header row is turned back into the shop's own way of writing a
   part: `Left headlight - Toyota Premio 2016 @ 8500 x2 shelf D-01 from Ex Japan`.
   The columns it recognises are listed in COLUMNS below, and the ones it does not
   recognise are named in the note it hands back, so nobody has to guess whether a
   column was used or quietly dropped. With no header it recognises, the cells of
   each row are simply run together and it says so — the reader still finds the
   part and the vehicle, and the person still checks every line.

   NO NEW DEPENDENCY
   The unzipping is done with DecompressionStream, which every browser this shop
   is opened in already has. The obvious spreadsheet package on npm has not been
   released in years and carries an unpatched advisory, and a shop's stock list is
   not worth taking that on. It also means this file is plain JavaScript with no
   imports, so the awkward parts can be tested on their own.
--------------------------------------------------------- */

/* A document big enough to be a mistake. 8 MB of spreadsheet is tens of
   thousands of rows and something has gone wrong upstream. */
const MAX_BYTES = 8 * 1024 * 1024;
/* And however many rows it holds, only this many are handed over at once. A
   review screen with 4,000 rows on it cannot be checked by a human being, which
   is the entire point of the review screen. Whatever is left out is counted and
   said out loud — never silently dropped. */
const MAX_LINES = 400;

/* ---------- little helpers ---------- */
const bytes = (buffer) => (buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
const squeeze = (s) => String(s == null ? "" : s).replace(/[ \s]+/g, " ").trim();
/* Header names compared without their punctuation, so "Part Name", "part_name"
   and "PART-NAME" are one column. */
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};
function unentity(s) {
  return String(s || "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    const hit = ENTITIES[body.toLowerCase()];
    return hit === undefined ? whole : hit;
  });
}

/* Text out of a file that is meant to be text.

   Windows Excel writes CSV in the old single-byte Windows encoding, not UTF-8,
   and a strict UTF-8 read of it throws. So: honour a byte-order mark if there is
   one, try UTF-8 strictly, and fall back to Windows-1252 rather than handing back
   a line full of replacement characters. */
export function decodeText(buffer) {
  const b = bytes(buffer);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  const start = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
  const body = start ? b.subarray(start) : b;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    try {
      return new TextDecoder("windows-1252").decode(body);
    } catch {
      return new TextDecoder("utf-8").decode(body);   // replacement chars, but readable
    }
  }
}

/* ---------- WHAT A COLUMN MIGHT BE CALLED ----------

   Every field the shop's own reader understands, and the headings people
   actually write above them. Order matters: the first entry whose synonyms
   contain the heading wins, so the specific ones ("year from") come before the
   general ones ("year").

   Deliberately absent: anything that looks like a part number or a row number.
   The shop generates its own codes — see rowToNewItem — and a column of 1, 2, 3
   read as a quantity would put the wrong number of pieces on every shelf. Also
   absent: cost, buying price, purchase price. There is one money field in this
   shop and it is what the part SELLS for; filing a buying price into it would
   quietly undercharge every customer. Those columns are named in the note
   instead, so somebody can see they were left. */
const COLUMNS = [
  ["yearFrom",  ["yearfrom", "fromyear", "yearstart", "startyear", "yrfrom"]],
  ["yearTo",    ["yearto", "toyear", "yearend", "endyear", "yrto"]],
  ["year",      ["year", "yr", "modelyear", "yearofmanufacture", "yom"]],
  ["name",      ["name", "part", "partname", "item", "itemname", "description", "desc",
                 "details", "particulars", "product", "spare", "sparepart", "parttype",
                 "type", "partdescription"]],
  ["brand",     ["brand", "make", "manufacturer", "carmake", "vehiclemake", "marque"]],
  ["model",     ["model", "car", "vehicle", "carmodel", "vehiclemodel", "cartype"]],
  ["series",    ["series", "trim", "chassis", "chassiscode", "bodycode", "variantcode"]],
  ["side",      ["side", "hand", "lhsrhs", "leftright", "position"]],
  ["condition", ["condition", "cond", "grade", "quality", "state", "status"]],
  ["color",     ["color", "colour"]],
  ["price",     ["price", "sellingprice", "sellprice", "retail", "retailprice",
                 "unitprice", "amount", "rate", "ksh", "kes", "shs", "priceksh"]],
  ["qty",       ["qty", "quantity", "pieces", "pcs", "units", "instock", "stock",
                 "stockqty", "available", "balance", "onhand"]],
  ["location",  ["location", "shelf", "rack", "bin", "shelfno", "shelflocation", "place"]],
  ["supplier",  ["supplier", "source", "vendor", "seller", "boughtfrom", "importedfrom", "origin"]],
  ["notes",     ["notes", "note", "remarks", "remark", "comment", "comments", "extra", "other"]],
];

/* Headings that are a spreadsheet's own furniture rather than a field. Matched
   so they can be ignored quietly instead of being reported as skipped. */
const FURNITURE = new Set([
  "", "no", "sn", "sno", "serial", "serialno", "sr", "srno", "index", "row",
  "itemno", "count", "num", "number", "id", "code", "partno", "partnumber",
  "partcode", "sku", "barcode", "ref", "reference", "date", "total", "subtotal",
  "cost", "costprice", "buyingprice", "purchaseprice", "buying", "purchase",
  "profit", "margin", "cash", "paid",
]);

function columnFor(heading) {
  const key = slug(heading);
  if (!key) return "";
  for (const [field, names] of COLUMNS) if (names.includes(key)) return field;
  return "";
}

/* ---------- CSV, TSV and whatever the file actually turned out to be ---------- */

/* Which character separates the cells — or "" for "this is not a table at all".

   That second answer is the important one. "Door, front, left - Toyota Premio" is
   how somebody writes a part, and reading it as three cells and joining them back
   with spaces would quietly eat the commas out of every list anybody types. So a
   delimiter only wins if the lines AGREE: most of them have to contain it, and
   most of them have to want the same number of cells. A list of prose fails both
   and comes back as prose. */
export function sniffDelimiter(text) {
  const lines = String(text || "").split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length < 2) return "";
  let best = "", bestScore = 0;
  for (const d of ["\t", ",", ";", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const present = counts.filter((c) => c >= 1).length / counts.length;
    if (present < 0.7) continue;              // most lines must have it at all
    /* The commonest number of cells, not the largest: one long description with
       four commas in it should not decide what the table's shape is. */
    const tally = new Map();
    for (const c of counts) if (c >= 1) tally.set(c, (tally.get(c) || 0) + 1);
    const [mode, hits] = [...tally.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const agree = hits / counts.length;
    if (agree < 0.6) continue;                // and most must agree on the shape
    const score = agree * 10 + present * 5 + Math.min(mode, 20) / 100;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/* A real CSV reader: quotes, doubled quotes inside them, and newlines inside a
   quoted cell. Splitting on commas is what turns "Door, front, left" into three
   parts, and this shop's part names are full of commas. */
export function parseDelimited(text, delimiter = ",") {
  const s = String(text || "");
  const d = delimiter || ",";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell.trim() === "") { quoted = true; cell = ""; continue; }
    if (c === d) { row.push(cell); cell = ""; continue; }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      continue;
    }
    cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows
    .map((r) => r.map((v) => squeeze(v)))
    .filter((r) => r.some((v) => v !== ""));
}

/* ---------- A TABLE, TURNED BACK INTO THE WAY THE SHOP WRITES A PART ----------

   This is the part that earns the feature. The shop's reader already understands
   "Left headlight - Toyota Premio 2016 @ 8500 x2 shelf D-01 from Ex Japan", and
   it has been read line by line against the real shelf for months. So rather
   than a second way of importing parts, a table is rewritten into that sentence
   and the tested path does the rest.

   With no header it can recognise, the cells are simply joined with a space:
   the reader still picks out the section, the vehicle and the year, and the note
   handed back says the columns were not understood so nobody assumes otherwise. */
export function tableToText(rows = []) {
  const table = (rows || []).map((r) => (r || []).map((v) => squeeze(v)));
  const body = table.filter((r) => r.some(Boolean));
  if (!body.length) return { text: "", lines: 0, columns: [], ignored: [], headed: false };

  /* Some sheets open with a title row — "STOCK LIST JUNE" in A1 and nothing
     else. Look for the header among the first few rows, not only the first. */
  let headAt = -1, map = null;
  for (let i = 0; i < Math.min(body.length, 6); i++) {
    const candidate = body[i].map(columnFor);
    const named = candidate.filter(Boolean);
    const usable = named.includes("name") || (named.includes("brand") && named.includes("model"));
    if (named.length >= 2 && usable) { headAt = i; map = candidate; break; }
  }

  if (headAt < 0) {
    const lines = body.map((r) => r.filter(Boolean).join(" ")).filter(Boolean);
    return { text: lines.join("\n"), lines: lines.length, columns: [], ignored: [], headed: false };
  }

  const header = body[headAt];
  const columns = [...new Set(map.filter(Boolean))];
  const ignored = header
    .filter((h, i) => !map[i] && !FURNITURE.has(slug(h)) && squeeze(h) !== "")
    .map((h) => squeeze(h));

  const lines = [];
  for (let i = headAt + 1; i < body.length; i++) {
    const r = body[i];
    /* A repeated header — spreadsheets printed page by page do this. */
    if (r.map(columnFor).filter(Boolean).length >= 2 && r.every((v, j) => !v || slug(v) === slug(header[j] || ""))) continue;
    const f = {};
    r.forEach((v, j) => {
      const field = map[j];
      if (!field || !v) return;
      f[field] = f[field] ? `${f[field]} ${v}` : v;
    });
    const line = rowToLine(f);
    if (line) lines.push(line);
  }
  return { text: lines.join("\n"), lines: lines.length, columns, ignored, headed: true };
}

const digits = (v) => {
  const m = String(v || "").match(/-?[\d.,]+/);
  if (!m) return null;
  const num = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
};

/* One row of named fields, said the way somebody at the counter would write it.
   Anything the fields do not cover goes on the end as words, which the reader
   keeps as a note rather than dropping — see parsePartLine. */
export function rowToLine(f = {}) {
  const name = squeeze(f.name);
  const brand = squeeze(f.brand);
  const model = squeeze(f.model);
  if (!name && !brand && !model) return "";

  const said = [];
  const already = (v) => v && new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`, "i").test(said.join(" "));
  const say = (v) => { const t = squeeze(v); if (t && !already(t)) said.push(t); };

  /* The side first when it is its own column, because "Left" belongs in front of
     "headlight" in every list this shop has ever been sent. */
  say(f.side);
  say(name);
  /* A stock list usually names the car inside the description as well. Saying it
     twice reads badly on the review screen, so it is only added if it is missing. */
  const car = [brand, model, squeeze(f.series)].filter(Boolean).join(" ");
  if (car) {
    const bits = [brand, model, squeeze(f.series)].filter((b) => b && !already(b));
    if (bits.length) said.push((said.length ? "- " : "") + bits.join(" "));
  }

  /* Years. A "year" column typed as a date comes through as a serial number, so
     anything that is not a plausible year is left out rather than saved as one. */
  const year = (v) => { const y = digits(v); return y && y >= 1950 && y <= 2100 ? y : null; };
  const from = year(f.yearFrom) || year(f.year);
  const to = year(f.yearTo);
  if (from && to && to !== from) said.push(`${from}-${to}`);
  else if (from) said.push(String(from));
  else if (to) said.push(String(to));

  say(f.condition);
  say(f.color);

  /* The reader's own markers, so price and quantity cannot be mistaken for a
     year or for part of the name. */
  const price = digits(f.price);
  if (price && price > 0) said.push(`@ ${price}`);
  const qty = digits(f.qty);
  if (qty && qty > 0) said.push(`x${Math.round(qty)}`);
  if (squeeze(f.location)) said.push(`shelf ${squeeze(f.location)}`);
  if (squeeze(f.supplier)) said.push(`from ${squeeze(f.supplier)}`);
  if (squeeze(f.notes)) said.push(squeeze(f.notes));

  return squeeze(said.join(" "));
}

/* ---------- OPENING A ZIP, WHICH IS WHAT .xlsx AND .docx ARE ----------

   Both are a folder of XML files in a zip. The browser can already undo the
   compression — DecompressionStream has been in every one of them for years — so
   the only work here is finding where each file starts.

   Only what is needed is read: the central directory at the end lists the
   entries, and one or two of them are inflated. A 40-sheet workbook is not
   decompressed to get at the first sheet. */
async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function unzip(buffer) {
  const b = bytes(buffer);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  /* The end-of-directory record is last, but a zip may carry a comment after it,
     so it is searched for backwards. */
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i >= b.length - 22 - 65535; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That file looks damaged — it is not a complete Excel or Word file. Try opening it and saving it again.");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (at === 0xffffffff) throw new Error("That file is stored in a newer zip format this cannot open. Please save it again as .xlsx or as CSV.");

  const entries = new Map();
  const name = (start, len) => new TextDecoder("utf-8").decode(b.subarray(start, start + len));
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) break;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    entries.set(name(at + 46, nameLen), { method, compressed, localAt });
    at += 46 + nameLen + extraLen + commentLen;
  }

  /* Read on demand. Nothing is inflated until somebody asks for it by name. */
  return {
    names: () => [...entries.keys()],
    has: (n) => entries.has(n),
    async text(n) {
      const e = entries.get(n);
      if (!e) return "";
      const lv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      if (lv.getUint32(e.localAt, true) !== 0x04034b50) return "";
      const nameLen = lv.getUint16(e.localAt + 26, true);
      const extraLen = lv.getUint16(e.localAt + 28, true);
      const start = e.localAt + 30 + nameLen + extraLen;
      const raw = b.subarray(start, start + e.compressed);
      if (e.method === 0) return decodeText(raw);
      if (e.method !== 8) throw new Error("Part of that file is compressed in a way this cannot open. Please save it again as .xlsx or as CSV.");
      return decodeText(await inflateRaw(raw));
    },
  };
}

/* ---------- EXCEL ----------
   Cell values live in the sheet; text values usually live once in a shared table
   and the sheet points at them by number. Both are read. Numbers come through as
   they were stored, which is what a price and a year want. */
function xmlTags(xml, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tag}>)`, "g");
  let m;
  while ((m = re.exec(xml))) out.push(m[1] === undefined ? "" : m[1]);
  return out;
}
const attr = (openTag, name) => {
  const m = openTag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : "";
};
/* "BC" is column 55. Needed because a row's XML skips empty cells entirely, and
   a list read without honouring that puts the price in the model column. */
const colOf = (ref) => {
  const letters = String(ref || "").match(/^[A-Z]+/i);
  if (!letters) return 0;
  let n = 0;
  for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function xlsxToTable(buffer) {
  const zip = await unzip(buffer);
  const sheets = zip.names().filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => (Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1])));
  if (!sheets.length) throw new Error("That Excel file has no sheet in it that could be read. Please save it again as .xlsx or as CSV.");

  /* The shared string table. `<si>` may be one `<t>` or several runs of one,
     which is what happens when part of a cell is bold. */
  const shared = [];
  if (zip.has("xl/sharedStrings.xml")) {
    for (const si of xmlTags(await zip.text("xl/sharedStrings.xml"), "si")) {
      shared.push(unentity(xmlTags(si, "t").join("")).replace(/<[^>]*>/g, ""));
    }
  }

  /* Only the first sheet. A workbook's other sheets are usually last month's
     list or somebody's working, and importing all of them silently would put
     last month's stock back on the shelf. */
  const xml = await zip.text(sheets[0]);
  const table = [];
  const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells = [];
    const cellRe = /<c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) {
      const open = cellMatch[1] || "";
      const inner = cellMatch[2] || "";
      const type = attr(open, "t");
      let value = "";
      if (type === "s") {
        const idx = Number(unentity(xmlTags(inner, "v")[0] || ""));
        value = shared[idx] || "";
      } else if (type === "inlineStr") {
        value = unentity(xmlTags(inner, "t").join(""));
      } else {
        value = unentity(xmlTags(inner, "v")[0] || xmlTags(inner, "t")[0] || "");
      }
      const at = colOf(attr(open, "r"));
      cells[at >= 0 ? at : cells.length] = squeeze(value);
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
    table.push(cells);
  }
  if (!table.length) throw new Error("That Excel file's first sheet is empty. Check the list is on the first sheet, or save it as CSV.");
  return table;
}

/* ---------- WORD, AND HTML, WHICH COME OUT THE SAME WAY ----------
   Both are tags round text. Turning the end of a table cell into a tab and the
   end of a row into a newline gets a Word table out as a table and a Word list
   out as lines, with one pass and no XML tree.

   THE ONE THING THAT HAS TO BE GOT RIGHT
   A paragraph ending means a new line everywhere EXCEPT inside a table cell,
   where it means nothing at all. Word wraps every single cell in its own
   paragraph, so honouring that break turns a four-column table into four separate
   lines and the table stops being a table. Cells are therefore flattened first,
   leaving a mark where each one ended, and only then is the rest of the document
   broken into lines. The mark becomes a tab last of all — after the blank lines
   have been dropped — so a row whose first cell is empty keeps its empty first
   column instead of quietly shifting everything one place left.

   The mark is a control character. Nothing in a document anybody sends this shop
   will contain one. */
const CELL = "\u0001";

function markupToText(xml, { cellTags, rowTags, breakTags }) {
  let s = String(xml || "");
  const breakRe = new RegExp(breakTags.join("|"), "gi");

  if (cellTags && cellTags.length) {
    const tags = cellTags.join("|");
    s = s.replace(
      new RegExp(`<(?:${tags})(?:\\s[^>]*)?>([\\s\\S]*?)</(?:${tags})>`, "gi"),
      (_, inner) => inner.replace(breakRe, " ") + CELL,
    );
  }
  s = s.replace(new RegExp(rowTags.join("|"), "gi"), "\n");
  s = s.replace(breakRe, "\n");
  s = s.replace(/<[^>]*>/g, "");

  const marks = new RegExp(CELL, "g");
  return unentity(s)
    .split("\n")
    .map((l) => l.split(CELL).map((c) => squeeze(c)).join(CELL))
    .map((l) => l.replace(new RegExp(`${CELL}+$`), ""))   // the last cell needs no mark
    .filter((l) => l.replace(marks, "").trim() !== "")
    .map((l) => l.replace(marks, "\t"))
    .join("\n");
}

export async function docxToText(buffer) {
  const zip = await unzip(buffer);
  if (!zip.has("word/document.xml")) {
    throw new Error("That Word file could not be opened. If it is an older .doc, open it in Word and save it as .docx.");
  }
  const text = markupToText(await zip.text("word/document.xml"), {
    cellTags: ["w:tc"], rowTags: ["</w:tr>"], breakTags: ["</w:p>", "<w:br\\s*/?>"],
  });
  if (!text.trim()) throw new Error("That Word file has no text in it \u2014 if the list is a picture pasted into the document, there is nothing here to read.");
  return text;
}

export function htmlToText(html) {
  return markupToText(html, {
    cellTags: ["td", "th"],
    rowTags: ["</tr>"],
    breakTags: ["</p>", "<br\\s*/?>", "</div>", "</li>", "</h[1-6]>", "</table>", "</caption>"],
  });
}

/* ---------- JSON ----------
   A list of records out of another system. The keys are the header. */
export function jsonToTable(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file says it is JSON but could not be read. Ask whoever sent it for a CSV or an Excel file instead.");
  }
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.items) ? data.items
    : Array.isArray(data?.rows) ? data.rows
    : Array.isArray(data?.data) ? data.data
    : Array.isArray(data?.parts) ? data.parts
    : null;
  if (!list || !list.length) throw new Error("There is no list of parts in that file.");
  if (typeof list[0] !== "object" || list[0] === null) {
    return [["name"], ...list.map((v) => [squeeze(v)])];
  }
  const keys = [...new Set(list.flatMap((r) => Object.keys(r || {})))];
  return [keys, ...list.map((r) => keys.map((k) => {
    const v = r?.[k];
    return v === null || v === undefined || typeof v === "object" ? "" : squeeze(v);
  }))];
}

/* ---------- PDF ----------
   Read as far as a PDF can be read without a typesetting library, and honest
   when that is not far enough. Text in a PDF sits in compressed streams as
   drawing instructions; the words can usually be pulled back out, but a PDF
   whose fonts carry their own private encoding comes out as gibberish and a PDF
   that is a photograph of a page has no text in it at all. Both are checked for,
   and both get a straight answer instead of 300 lines of nonsense. */
function pdfStrings(chunk) {
  const out = [];
  /* Two instructions draw text: `(some words) Tj` and `[(some) -250 (words)] TJ`.
     The second is one line broken into pieces so the letters can be nudged apart,
     and reading each piece as its own line is how "Rear bumper @ 12000" arrives as
     two lines with the price orphaned. So a TJ array is one line, joined up. */
  const undo = (body) => body
    .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "" }[c] ?? c))
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
  const pieces = (blob) => (blob.match(/\((?:\\.|[^\\()])*\)/g) || [])
    .map((p) => undo(p.slice(1, -1)));

  const re = /\[((?:\\.|[^\]\\])*)\]\s*TJ|\(((?:\\.|[^\\()])*)\)\s*Tj/g;
  let m;
  while ((m = re.exec(chunk))) {
    const line = m[1] !== undefined ? pieces(m[1]).join("") : undo(m[2]);
    if (line.trim()) out.push(line);
  }
  return out;
}

export async function pdfToText(buffer) {
  const b = bytes(buffer);
  const raw = new TextDecoder("latin1").decode(b);
  const pieces = [];

  /* Every stream in the file. Compressed ones are inflated; the rest are read as
     they are. A stream that will not inflate is skipped — an image or a font. */
  const re = /stream\r?\n?/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const slice = b.subarray(start, end);
    let text = "";
    if (slice[0] === 0x78) {          // a zlib header: compressed
      try {
        const s = new Blob([slice]).stream().pipeThrough(new DecompressionStream("deflate"));
        text = new TextDecoder("latin1").decode(await new Response(s).arrayBuffer());
      } catch { text = ""; }
    } else {
      text = new TextDecoder("latin1").decode(slice);
    }
    if (text.includes("Tj") || text.includes("TJ")) pieces.push(...pdfStrings(text));
    re.lastIndex = end;
  }

  const joined = pieces.join(" ").replace(/[  ]+/g, " ").trim();
  if (!joined) {
    throw new Error("There is no readable text in that PDF — it is a scan or a photograph of a page. The shop cannot read writing out of a picture. Type the list, or ask for it as Excel or CSV.");
  }
  /* Is it words? A private font encoding gives back the right number of
     characters and none of them letters. Better to say so than to hand somebody
     four hundred lines of rubbish to check. */
  const letters = (joined.match(/[a-zA-Z]/g) || []).length;
  if (letters / joined.length < 0.4) {
    throw new Error("That PDF's text could not be read properly — the fonts in it hide the letters. Ask for the list as Excel, CSV or Word, or copy the text out of the PDF and paste it in the box.");
  }
  /* PDFs draw a line at a time, so the pieces are already lines; runs that end
     without punctuation are joined back up where they clearly wrapped. */
  return pieces
    .map((p) => p.replace(/[  ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/* ---------- WHAT KIND OF FILE IS THIS ----------
   The first bytes, then the name. A file called .xlsx that is really a CSV is an
   everyday thing — somebody renamed it — and reading the bytes gets that right
   where trusting the name does not. */
export function sniffKind(name = "", buffer) {
  const b = bytes(buffer || new Uint8Array());
  const ext = String(name).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
  const starts = (...sig) => sig.every((v, i) => b[i] === v);

  if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06)) {
    /* A zip. Which sort is settled by the name — both are zips inside. */
    if (ext === "docx") return "docx";
    if (ext === "xlsx" || ext === "xlsm") return "xlsx";
    return ext === "" ? "xlsx" : "zip";
  }
  if (starts(0x25, 0x50, 0x44, 0x46)) return "pdf";
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) return ext === "doc" ? "doc" : "xls";
  if (starts(0xff, 0xd8, 0xff) || starts(0x89, 0x50, 0x4e, 0x47) ||
      starts(0x47, 0x49, 0x46, 0x38) || starts(0x42, 0x4d) ||
      (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57)) return "image";
  if (["jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif", "tif", "tiff", "avif"].includes(ext)) return "image";
  if (ext === "json") return "json";
  if (ext === "html" || ext === "htm" || ext === "xml") return "html";
  if (ext === "doc") return "doc";
  if (ext === "xls") return "xls";
  if (ext === "pdf") return "pdf";

  const head = decodeText(b.subarray(0, 2048)).trimStart().toLowerCase();
  if (head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<table")) return "html";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  return "text";
}

const HUMAN = {
  xlsx: "Excel file", docx: "Word file", pdf: "PDF", csv: "list",
  text: "text file", html: "web page", json: "data file",
};

/* ---------- THE ONE FUNCTION THE SCREEN CALLS ----------

   Give it a name and the bytes; get back the text to put in the box and one
   plain sentence saying what happened. It never returns half an answer: either
   there is text, or it throws with something a person can act on.

   Takes bytes rather than a browser File so it can be run and checked outside a
   browser — see the note at the top about not adding a package for this. */
export async function readDocument({ name = "", buffer } = {}) {
  const b = bytes(buffer || new Uint8Array());
  if (!b.length) throw new Error("That file is empty.");
  if (b.length > MAX_BYTES) {
    throw new Error(`That file is ${Math.round(b.length / 1024 / 1024)} MB, which is far more than a stock list. Send the sheet on its own, or save just the list as CSV.`);
  }

  const kind = sniffKind(name, b);

  if (kind === "image") {
    throw new Error("That is a photograph, and there is no text in a picture for the shop to read. If it is a photo of a written list, type the lines into the box — or ask for the list as Excel, CSV or Word.");
  }
  if (kind === "xls") {
    throw new Error("That is an old Excel file (.xls). Open it in Excel and use Save As → “Excel Workbook (.xlsx)” or “CSV”, then try again.");
  }
  if (kind === "doc") {
    throw new Error("That is an old Word file (.doc). Open it in Word and use Save As → “Word Document (.docx)”, then try again.");
  }
  if (kind === "zip") {
    throw new Error("That is a zip folder. Open it and pick the spreadsheet or document inside.");
  }

  let text = "", columns = [], ignored = [], headed = false, how = "";

  if (kind === "xlsx") {
    const out = tableToText(await xlsxToTable(b));
    text = out.text; columns = out.columns; ignored = out.ignored; headed = out.headed;
    how = "Excel file";
  } else if (kind === "docx") {
    const flat = await docxToText(b);
    /* A Word table came out tab-separated; a Word list came out as lines. */
    if (flat.includes("\t")) {
      const out = tableToText(parseDelimited(flat, "\t"));
      text = out.text; columns = out.columns; ignored = out.ignored; headed = out.headed;
      how = "Word table";
    } else {
      text = flat;
      how = "Word file";
    }
  } else if (kind === "pdf") {
    text = await pdfToText(b);
    how = "PDF";
  } else if (kind === "json") {
    const out = tableToText(jsonToTable(decodeText(b)));
    text = out.text; columns = out.columns; ignored = out.ignored; headed = out.headed;
    how = "data file";
  } else if (kind === "html") {
    const flat = htmlToText(decodeText(b));
    if (flat.includes("\t")) {
      const out = tableToText(parseDelimited(flat, "\t"));
      text = out.text; columns = out.columns; ignored = out.ignored; headed = out.headed;
      how = "web page table";
    } else {
      text = flat;
      how = "web page";
    }
  } else {
    /* Plain text. It may still be a table — a CSV, a tab-separated export, or a
       list pasted out of a spreadsheet. */
    const flat = decodeText(b);
    const delimiter = sniffDelimiter(flat);
    if (delimiter) {
      const out = tableToText(parseDelimited(flat, delimiter));
      text = out.text; columns = out.columns; ignored = out.ignored; headed = out.headed;
      how = delimiter === "\t" ? "tab-separated list" : delimiter === "," ? "CSV" : "list";
    } else {
      text = flat.split(/\r\n|\n|\r/).map((l) => squeeze(l)).filter(Boolean).join("\n");
      how = "text file";
    }
  }

  let lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) {
    throw new Error(`Nothing that looks like a list of parts was found in that ${HUMAN[kind] || "file"}.`);
  }

  /* Too many to check in one sitting. Cut it, and SAY what was cut — a silent
     truncation reads as "it read the whole thing" when it did not. */
  const dropped = Math.max(0, lines.length - MAX_LINES);
  if (dropped) lines = lines.slice(0, MAX_LINES);
  text = lines.join("\n");

  const note = [
    `Read ${lines.length} ${lines.length === 1 ? "line" : "lines"} out of that ${how}.`,
    headed && columns.length ? `Columns used: ${columns.join(", ")}.` : "",
    headed && ignored.length ? `Left alone: ${ignored.join(", ")}.` : "",
    !headed && how !== "text file" && how !== "Word file" && how !== "PDF" && how !== "web page"
      ? "The column headings were not recognised, so each row was read as one line of writing."
      : "",
    dropped
      ? `${dropped} more ${dropped === 1 ? "line was" : "lines were"} left out — that is as many as can be checked at once. Save these, then upload the same file again for the rest.`
      : "",
    "Check every line below before saving. Nothing has been written yet.",
  ].filter(Boolean).join(" ");

  return { text, kind, how, lines: lines.length, columns, ignored, headed, dropped, note };
}
