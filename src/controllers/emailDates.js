import { supabase } from '../supabase.js';
import { parseEmailText } from '../emailDates/parse.js';

// Text of an uploaded email thread: .txt / .eml as is, PDFs read in the browser (pdf.js, loaded only when needed).
export async function readThreadFile(file) {
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      let line = ''; const lines = [];
      for (const it of tc.items) { line += it.str; if (it.hasEOL) { lines.push(line); line = ''; } else if (it.str && !/\s$/.test(it.str)) line += ' '; }
      if (line) lines.push(line); pages.push(lines.join('\n'));
    }
    return { text: pages.join('\n'), pages: doc.numPages, file };
  }
  return { text: await file.text(), pages: 1, file };
}

async function aiAnalyze({ text, file }) {
  const body = text && text.trim().length > 40 ? { text } : null;
  let payload = body;
  if (!payload && file) {
    const bytes = new Uint8Array(await file.arrayBuffer()); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    payload = { base64: btoa(bin), mimeType: file.type || 'application/pdf', fileName: file.name };
  }
  const { data, error } = await supabase.functions.invoke('extract-email-dates', { body: payload });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

// AI first (better with free-form emails); the rules reader is the fallback and works with no setup.
export async function analyzeThread({ text, file }, { useAi = true } = {}) {
  let note = '';
  if (useAi) {
    try { const r = await aiAnalyze({ text, file }); return { ...r, note: '' }; }
    catch (e) { note = /not found|404|Failed to send|ANTHROPIC|Model API/i.test(String(e.message)) ? 'AI reading is not set up yet, so the built-in reader was used.' : `AI reading failed (${e.message}); the built-in reader was used.`; }
  }
  if (!text || text.trim().length < 20) throw new Error('No readable text found. For a scanned PDF, AI reading must be set up (see docs/email-dates.md).');
  return { ...parseEmailText(text), note };
}
