// PDF invoices that have a text layer (most supplier invoices exported from accounting software) are read in the browser:
// text items are grouped into rows by their vertical position and split into cells by horizontal gaps, which gives the same
// grid shape as a spreadsheet, so the existing layout-independent parser (src/invoices/parse.js) can read it.
// Scanned PDFs and photos have no text layer: those still need the optional AI function.

/** items: pdf.js text items [{ str, transform:[a,b,c,d,x,y], width, height }] of ONE page → array of rows (array of cell strings). */
export function itemsToRows(items, { rowTolerance = 3, gapChars = 2 } = {}) {
  const its = items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || i.str.length * 4, cw: (i.width || i.str.length * 4) / Math.max(1, i.str.length) }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of its) {
    const l = lines.find(r => Math.abs(r.y - it.y) <= rowTolerance);
    if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => {
    l.items.sort((a, b) => a.x - b.x);
    const cells = []; let cur = null;
    for (const it of l.items) {
      // a gap wider than about two characters is a column break; a narrower one is just a space between words
      if (cur && it.x - cur.end <= Math.max(5, gapChars * Math.max(cur.cw, it.cw))) { cur.text += (it.x - cur.end > 0.5 || /\s$/.test(cur.text) === false && !/^\s/.test(it.s) && it.x - cur.end > 0 ? ' ' : '') + it.s; cur.end = it.x + it.w; cur.cw = it.cw; }
      else { cur = { text: it.s, end: it.x + it.w, cw: it.cw }; cells.push(cur); }
    }
    return normalizeCells(cells.map(c => c.text.trim()).filter(Boolean));
  }).filter(r => r.length);
}

// Spreadsheet-like cells: "Invoice No: 11610" becomes label + value, numbers become numbers, US dates become ISO dates.
function normalizeCells(cells) {
  const out = [];
  for (const c of cells) {
    const m = /^([A-Za-z][A-Za-z #./]{1,24}):\s*(\S.*)$/.exec(c);
    if (m) { out.push(m[1].trim()); out.push(cellValue(m[2].trim())); }
    else out.push(cellValue(c.replace(/:$/, '')));
  }
  return out;
}
function cellValue(t) {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (d) return `${d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`;
  const n = t.replace(/^\$\s*/, '').replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(n) && !/^0\d/.test(n) ? Number(n) : t;
}

/** Reads every page of a PDF file into one sheet: { name, rows }. Returns null when the PDF has no text layer. */
export async function readPdfSheet(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    rows.push(...itemsToRows(tc.items));
  }
  return rows.length ? { name: 'invoice', rows } : null;
}
