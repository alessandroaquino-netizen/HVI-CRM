// Usage: node scripts/test-invoice-parser.mjs <folder-or-file> [--json]
import fs from 'fs'; import path from 'path'; import * as XLSX from 'xlsx';
import { parseInvoiceSheets } from '../src/invoices/parse.js';
const target = process.argv[2]; const asJson = process.argv.includes('--json');
const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter(f => /\.(xls|xlsx|csv)$/i.test(f)).map(f => path.join(target, f)) : [target];
const out = [];
for (const f of files) {
  const wb = XLSX.read(fs.readFileSync(f), { type: 'buffer', cellDates: true });
  const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
  const r = parseInvoiceSheets(sheets, { fileName: path.basename(f) });
  out.push({ file: path.basename(f), ...r });
}
if (asJson) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
for (const r of out) {
  console.log(`\n=== ${r.file}\n${r.docType} | #${r.invoiceNumber} | ${r.invoiceDate} | ${r.vendor} -> ${r.manufacturerGuess} | refs ${r.refs.join(',')}`);
  for (const l of r.lines) console.log(`  [${l.lineType.padEnd(11)}] ${l.description.slice(0,58).padEnd(58)} q=${l.quantity ?? '-'} u=${l.unitPrice ?? '-'} a=${l.amount}${l.packedQuantity != null ? ' pack=' + l.packedQuantity : ''}`);
  console.log(`  totals: ${JSON.stringify(r.totals)}`);
  for (const w of r.warnings) console.log(`  ${w.level.toUpperCase()}: ${w.msg}`);
}
