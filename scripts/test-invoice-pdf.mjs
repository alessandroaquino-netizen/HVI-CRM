// PDF text → rows → invoice parser (no pdf.js needed: pdf.js text items are simulated with their x, y and width).
import assert from 'node:assert/strict';
import { itemsToRows } from '../src/invoices/pdfText.js';
import { parseInvoiceSheets } from '../src/invoices/parse.js';

const cw = 6; // character width
let y = 700;
const item = (str, x, yy) => ({ str, transform: [1, 0, 0, 1, x, yy], width: str.length * cw });
const line = (...cells) => { y -= 14; return cells.flatMap(([text, x]) => text.split(' ').reduce((acc, w, i) => { const prev = acc.at(-1); const xx = prev ? prev.transform[4] + prev.str.length * cw + cw : x; acc.push(item(w, i === 0 ? x : xx, y)); return acc; }, [])); };
const items = [
  ...line(['CWP Apparel Co.', 40], ['INVOICE', 420]),
  ...line(['Invoice No: 11610', 40], ['Date: 10/21/2026', 300]),
  ...line(['Description', 40], ['Qty', 250], ['Unit Price', 310], ['Amount', 420]),
  ...line(['Paradise Tee', 40], ['250', 250], ['9.50', 310], ['2,375.00', 420]),
  ...line(['Paradise Tee - 3XL', 40], ['20', 250], ['10.50', 310], ['210.00', 420]),
  ...line(['Shipping', 40], ['180.00', 420]),
  ...line(['Total', 40], ['2,765.00', 420]),
];
const rows = itemsToRows(items);
assert.deepEqual(rows[3], ['Paradise Tee', 250, 9.5, 2375]);          // words stay together, columns split, numbers are numbers
assert.deepEqual(rows[1], ['Invoice No', 11610, 'Date', '2026-10-21']);
const p = parseInvoiceSheets([{ name: 'invoice', rows }], { fileName: 'CWP 11610 Paradise Tee.pdf' });
assert.equal(p.invoiceNumber, '11610');
assert.equal(p.invoiceDate, '2026-10-21');
const prod = p.lines.filter(l => l.lineType === 'product');
assert.equal(prod.length, 2); assert.equal(prod[0].quantity, 250); assert.equal(prod[0].unitPrice, 9.5); assert.equal(prod[0].amount, 2375);
assert.equal(p.lines.find(l => l.lineType === 'shipping').amount, 180);
assert.equal(p.totals.amount, 2765);
// a scanned PDF has no text items at all
assert.deepEqual(itemsToRows([]), []);
console.log('invoice PDF reading: all checks passed');
