import * as XLSX from 'xlsx';
import { parseInvoiceSheets } from './parse.js';
import { readPdfSheet } from './pdfText.js';

const SHEET_EXT = /\.(xls|xlsx|xlsm|csv|tsv)$/i;
export const ACCEPTED_TYPES = '.xls,.xlsx,.xlsm,.csv,.tsv,.pdf,.png,.jpg,.jpeg';

export async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Returns { parsed, hash, method } or throws an Error with a message fit to show to the user.
export async function readInvoiceFile(file, { aiExtract } = {}) {
  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  if (SHEET_EXT.test(file.name)) {
    let wb;
    try { wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true }); }
    catch { throw new Error('This spreadsheet could not be opened. Re-save it as .xlsx and try again.'); }
    const sheets = wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
    const parsed = parseInvoiceSheets(sheets, { fileName: file.name });
    if (!parsed.ok || !parsed.lines.length) {
      if (aiExtract) return { parsed: await aiExtract(file), hash, method: 'ai' };
      throw new Error('No line items were found in this document. If its layout is unusual, enable AI extraction (see docs/invoice-ai-extraction.md) or enter it manually.');
    }
    return { parsed, hash, method: 'rules' };
  }
  // PDF with a text layer: read by rules in the browser, no AI needed. Photos and scanned PDFs fall through to AI.
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    let sheet = null;
    try { sheet = await readPdfSheet(file); } catch { /* unreadable PDF: handled below */ }
    if (sheet) {
      const parsed = parseInvoiceSheets([sheet], { fileName: file.name });
      if (parsed.ok && parsed.lines.some(l => l.lineType === 'product')) {
        parsed.warnings.unshift({ level: 'warn', msg: 'Read from a PDF: check every quantity, price and total against the original before saving.' });
        return { parsed, hash, method: 'pdf' };
      }
    }
    if (aiExtract) return { parsed: await aiExtract(file), hash, method: 'ai' };
    throw new Error(sheet ? 'This PDF was read but no product lines were found (unusual layout). Send it to Alessandro so the reader can be tuned, or enter the invoice manually.'
      : 'This PDF has no readable text (a scan or a photo). Upload the supplier\'s spreadsheet, or ask Alessandro to turn on AI reading (docs/invoice-ai-extraction.md).');
  }
  if (aiExtract) return { parsed: await aiExtract(file), hash, method: 'ai' };
  throw new Error('Photos of invoices need AI reading, which is not enabled yet. Upload the supplier\'s PDF or spreadsheet, or see docs/invoice-ai-extraction.md.');
}

// Optional AI path: a Supabase Edge Function (supabase/functions/extract-invoice) that returns the same shape as parseInvoiceSheets().
export function makeAiExtractor(supabase) {
  if (!import.meta.env.VITE_INVOICE_AI_ENABLED) return null;
  return async file => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const { data, error } = await supabase.functions.invoke('extract-invoice', { body: { fileName: file.name, mimeType: file.type || 'application/octet-stream', base64: btoa(bin) } });
    if (error) throw new Error('AI extraction failed: ' + error.message);
    return data;
  };
}
