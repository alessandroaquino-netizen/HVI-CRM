import fs from 'fs'; import * as XLSX from 'xlsx';
import { parseSkuSheet, summarizeSkus } from '../src/skus/parseSkuSheet.js';
const wb = XLSX.read(fs.readFileSync(process.argv[2]), { type: 'buffer', cellDates: true });
const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
const p = parseSkuSheet(sheets);
console.log(p.ok, p.sheetName, 'rows', p.rows?.length, 'order cols', p.orderColumns?.length, p.orderColumns?.slice(0, 3), '...', p.orderColumns?.slice(-3));
const s = summarizeSkus(p, '2026-01-01').filter(x => x.units > 0);
console.log('products with 2026 orders:', s.length, 'skus', s.reduce((a, x) => a + x.skus.filter(k => k.windowQty).length, 0), 'units', s.reduce((a, x) => a + x.units, 0));
console.log('warnings:', p.warnings.length); p.warnings.slice(0, 12).forEach(w => console.log(' ', w.level, w.msg));
