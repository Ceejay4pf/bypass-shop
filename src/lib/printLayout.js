/* ---------------------------------------------------------
   HOW A PRINTED STOCK LIST IS LAID OUT — and stamped.

   Two jobs, both kept out of the screen so they can be checked with plain node
   rather than by printing six hundred parts and counting the paper.

   1. HOW MANY PARTS FIT ON A PAGE. The whole shop is 600-odd parts. At the size
      the list used to print, that is twenty-something sheets, and nobody carries
      twenty-something sheets around a yard. So the row height is a setting, the
      number of pages it will take is worked out before anything is printed, and
      somebody can either pick a look or say "fit it into eight pages" and have
      the look chosen for them.

      A SMALL LIST IS NOT SQUEEZED. Eleven bumpers printed at eight-point type
      to save paper that was never going to be used is just a list nobody can
      read. `autoDensity` therefore starts from the roomiest and only tightens
      as far as it must — see the page cap below.

   2. THE STAMP. A stock list gets handed to customers and taken to other
      branches, so it wants the shop's mark on it: five faint stamps on every
      page, and one solid one at the foot of the document. Five per page because
      that is what was asked for, and because one is easy to crop out of a photo
      of the page while five is not.

   The page counts here are ESTIMATES. The browser does the real breaking, and
   how it breaks depends on the printer's paper and margins. Everything that
   says a number of pages says "about".
--------------------------------------------------------- */

/* An A4 page at 96dpi is 1123px tall. Take off the printer's own margins (about
   12mm top and bottom, which most drivers will not go below) and the running
   footer, and this is what is left for rows. */
export const PAGE_PX = 945;

/* What the first page also has to carry: the shop's name, the title block and
   the rule under them. Later pages start straight into rows. */
export const FIRST_PAGE_HEAD_PX = 120;

/* Five stamps on every page. Not a setting, because it is what was asked for and
   because a number nobody chose is a number nobody has to maintain. */
export const WATERMARKS_PER_PAGE = 5;

/* Where they sit, in per cent of the page. A scatter rather than a grid: five in
   a neat line reads as a printing fault, five scattered reads as a stamp used
   five times. */
export const WATERMARK_SPOTS = [
  { x: 24, y: 15 },
  { x: 74, y: 31 },
  { x: 49, y: 51 },
  { x: 24, y: 70 },
  { x: 75, y: 86 },
];

/* The looks, loosest first. `font` and `pad` are the real CSS numbers used below,
   so the estimate and the page cannot drift apart: change one and the other
   follows.

   `cols` is how many columns of rows go across the page. Two columns doubles what
   fits, at the cost of the table becoming a list — every field is still printed,
   but stacked inside one cell instead of lined up under headings. It is the last
   resort and it is labelled as one. */
export const DENSITIES = [
  {
    key: "roomy",
    label: "Roomy",
    font: 12.5,
    pad: 6,
    cols: 1,
    note: "Easy to read across a counter. Best for a short list.",
  },
  {
    key: "normal",
    label: "Normal",
    font: 11,
    pad: 4,
    cols: 1,
    note: "The size this list has always printed at.",
  },
  {
    key: "tight",
    label: "Tight",
    font: 9.5,
    pad: 2,
    cols: 1,
    note: "Smaller type, same columns. Still comfortable in good light.",
  },
  {
    key: "packed",
    label: "Packed",
    font: 8.5,
    pad: 1,
    cols: 1,
    note: "About as small as print stays readable. Fits the whole shop in a few sheets.",
  },
  {
    key: "twocol",
    label: "Two columns",
    font: 8.5,
    pad: 1,
    cols: 2,
    note: "Two lists side by side. Every field is still there, stacked rather than in columns.",
  },
];

export const DEFAULT_DENSITY = "auto";

/* The most pages `autoDensity` will let a job come to before it tightens. Nine
   because that is a stapleable stack, and because the whole shop at the packed
   size lands just inside it. */
export const AUTO_PAGE_CAP = 9;

export function densityByKey(key) {
  return DENSITIES.find((d) => d.key === key) || DENSITIES[1];
}

/* One row's height. Type, the padding above and below it, and the hairline rule
   under it. Line height 1.15 matches the CSS below. */
export function rowPx(d) {
  return d.font * 1.15 + d.pad * 2 + 0.6;
}

/* What a section costs before its first row: the blue heading bar and the column
   headings, plus the gap above it. Sections are why a nine-page estimate is not
   simply rows divided by rows-per-page — the shop prints fifteen or so of them. */
export function blockPx(d) {
  return d.font * 1.15 + 14 + rowPx(d) + 12;
}

export function rowsPerPage(d) {
  return Math.max(1, Math.floor((PAGE_PX / rowPx(d)) * d.cols));
}

/* About how many sheets this job comes to. `blocks` is the number of section
   headings, which on the full list is more than the number of categories because
   doors and bumpers print an end-of-car block each. */
export function estimatePages(rows, blocks, d) {
  const n = Math.max(0, Number(rows) || 0);
  if (!n) return 1;
  const b = Math.max(0, Number(blocks) || 0);
  /* Two columns halves the height everything takes, headings included: each
     column of the page is its own run of sections. */
  const ink = (n * rowPx(d) + b * blockPx(d)) / (d.cols || 1);
  return Math.max(1, Math.ceil((ink + FIRST_PAGE_HEAD_PX) / PAGE_PX));
}

/* The loosest look that still comes in at or under `target` pages. Returns null
   when even the tightest cannot — the screen says so rather than printing
   something that quietly runs to twice what was asked for. */
export function fitDensity(rows, blocks, target) {
  const want = Math.max(1, Math.floor(Number(target) || 0));
  for (const d of DENSITIES) {
    if (estimatePages(rows, blocks, d) <= want) return d;
  }
  return null;
}

/* Left to itself: roomy for a list that is short enough to afford it, tightening
   only as far as the page cap forces. A list of twenty parts prints big; the
   whole shop prints packed. Nobody has to think about it. */
export function autoDensity(rows, blocks, cap = AUTO_PAGE_CAP) {
  return fitDensity(rows, blocks, cap) || DENSITIES[DENSITIES.length - 1];
}

/* What the screen shows next to each choice: "Packed — about 9 pages". */
export function densityChoices(rows, blocks) {
  return DENSITIES.map((d) => ({ ...d, pages: estimatePages(rows, blocks, d) }));
}

/* ---------------------------------------------------------
   THE STAMP
--------------------------------------------------------- */

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* HOW BIG THE NAME ON THE STAMP CAN BE.

   The name is set on a semicircle, and text set on a path that runs off the end of
   the path is not drawn short — it is simply not drawn. So a long name loses its
   last few letters silently: "SURE FIT AUTO SPARES LTD" printed as "SURE FIT AUTO
   SPARES L", and "JASPARE AUTO BYPASS SHOP" the same. A stamp that clips the name
   is a document that does not say which shop it came from, which is the one thing a
   stamp is for.

   So the type shrinks to fit instead. The letter-spacing goes first, because a
   rubber stamp reads as a stamp because of the spacing, and only then the size.

   The arithmetic: the top arc has radius 76, so half of it is PI * 76 ≈ 239 units
   long. A capital in a system sans is about 0.62 of the font size wide. Leaving a
   little air at both ends gives the usable width below — measured against the real
   thing rather than guessed, since the ends of the arc are where the clipping shows.

   Pure and exported so the fit can be checked with node instead of by printing. */
const ARC_WIDTH = Math.PI * 76 * 0.93;   // usable length of the top arc
const CAP_RATIO = 0.62;                  // width of a capital, as a share of the size

export function stampTextFit(text, { max = 15, min = 8.5, spacing = 1.2 } = {}) {
  const n = String(text || "").length;
  if (!n) return { size: max, spacing };
  const fits = (size, gap) => n * (CAP_RATIO * size + gap) <= ARC_WIDTH;
  if (fits(max, spacing)) return { size: max, spacing };
  /* Spacing first, down to a quarter-unit — tighter than that and the letters
     touch, which looks like a smudge rather than a stamp. */
  for (const gap of [0.9, 0.6, 0.25]) {
    if (fits(max, gap)) return { size: max, spacing: gap };
  }
  /* Then the size, at the tightest spacing, and never below `min`: a name too small
     to read is no better than a name cut in half. */
  const size = Math.max(min, Math.floor(((ARC_WIDTH / n) - 0.25) / CAP_RATIO * 10) / 10);
  return { size, spacing: 0.25 };
}

/* A round rubber stamp, drawn rather than photographed so it is sharp at any
   size and costs the page nothing to download.

   `id` is threaded through because the same stamp is put on the page six times —
   five faint and one solid — and two SVGs sharing one path id is how the curved
   text ends up on top of itself. */
export function stampSvg({ shop = "", line = "", date = "", id = "s", tone = "#2563EB" } = {}) {
  const fit = stampTextFit(shop);
  const top = `arc-${id}`;
  const bottom = `arcb-${id}`;
  return `<svg viewBox="0 0 200 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <path id="${top}" d="M 100,100 m -76,0 a 76,76 0 1,1 152,0" fill="none"/>
    <path id="${bottom}" d="M 100,100 m -64,0 a 64,64 0 1,0 128,0" fill="none"/>
  </defs>
  <g fill="none" stroke="${tone}">
    <circle cx="100" cy="100" r="94" stroke-width="4"/>
    <circle cx="100" cy="100" r="82" stroke-width="1.5"/>
  </g>
  <text font-family="system-ui, sans-serif" font-size="${fit.size}" font-weight="700" fill="${tone}" letter-spacing="${fit.spacing}">
    <textPath href="#${top}" startOffset="50%" text-anchor="middle">${esc(shop)}</textPath>
  </text>
  <text font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="${tone}" letter-spacing="1.6">
    <textPath href="#${bottom}" startOffset="50%" text-anchor="middle">${esc(date)}</textPath>
  </text>
  <g text-anchor="middle" font-family="system-ui, sans-serif" fill="${tone}">
    <text x="100" y="88" font-size="19" font-weight="800" letter-spacing="1">STOCK</text>
    <text x="100" y="110" font-size="19" font-weight="800" letter-spacing="1">LIST</text>
    <text x="100" y="128" font-size="9" font-weight="700" letter-spacing="2">${esc(line)}</text>
  </g>
  <g stroke="${tone}" stroke-width="2">
    <line x1="46" y1="100" x2="62" y2="100"/>
    <line x1="138" y1="100" x2="154" y2="100"/>
  </g>
</svg>`;
}

/* The five faint ones. A FIXED-position layer, which is the whole trick: a fixed
   element is painted onto every sheet the browser produces, so five stamps here
   are five stamps on page one and five on page nine without knowing how many
   pages there will be.

   It sits behind the rows and takes no clicks, and `print-color-adjust: exact`
   is what stops a printer helpfully dropping a pale grey it thinks is
   background. */
export function watermarkHtml(stamp, count = WATERMARKS_PER_PAGE) {
  const n = Math.max(0, Math.min(Number(count) || 0, WATERMARK_SPOTS.length));
  if (!n) return "";
  const marks = WATERMARK_SPOTS.slice(0, n)
    .map((p, i) => {
      const svg = stamp({ id: `wm${i}` });
      const turn = i % 2 ? 17 : -19;
      return `<div class="wm-one" style="left:${p.x}%; top:${p.y}%; transform:translate(-50%,-50%) rotate(${turn}deg);">${svg}</div>`;
    })
    .join("");
  return `<div class="wm" aria-hidden="true">${marks}</div>`;
}

export function watermarkCss() {
  return `
  .wm { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
  .wm-one { position: absolute; width: 190px; height: 190px; opacity: 0.085; }
  /* The rows sit above the stamps, so the stamps read as ink under the words
     rather than over them. */
  .wrap { position: relative; z-index: 1; }
  @media print {
    .wm-one { opacity: 0.1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }`;
}

/* The table's own sizes, generated from the chosen look so the estimate above and
   the page below can never disagree about how tall a row is. */
export function densityCss(d) {
  const twoCol = (d.cols || 1) > 1;
  return `
  table { width:100%; border-collapse:collapse; margin-top:6px; font-size:${d.font}px; line-height:1.15; }
  th { background:#EEF2F6; text-align:left; padding:${Math.max(1, d.pad)}px 6px; font-size:${Math.max(7, d.font - 1.5)}px;
       text-transform:uppercase; letter-spacing:.4px; color:#5A6472; border-bottom:1px solid #DEE3E9; }
  td { padding:${d.pad}px 6px; border-bottom:1px solid #EEF2F6; }
  .sech { font-size:${Math.max(9, d.font + 1)}px; padding:${Math.max(3, d.pad)}px 8px; }
  .sechn { font-size:${Math.max(7, d.font - 1)}px; }
  ${twoCol ? `.body { column-count:2; column-gap:14px; }
  .sec { break-inside:auto; }
  /* In two columns a row cannot be a table row — a table will not flow across a
     column break — so each part becomes one small block instead. */
  .stack { font-size:${d.font}px; line-height:1.2; }
  .stack .r { padding:${d.pad}px 0; border-bottom:1px solid #EEF2F6; break-inside:avoid; }
  .stack .c1 { font-family: ui-monospace, monospace; color:#2563EB; font-weight:600; }
  .stack .c2 { color:#1B2430; }
  .stack .c3 { color:#5A6472; font-size:${Math.max(6.5, d.font - 1)}px; }` : ""}`;
}

/* Does this look print the table, or the stacked two-column list? Asked here so
   the screen and the page agree on one answer. */
export const isStacked = (d) => (d?.cols || 1) > 1;
