# Invoice upload: how extraction works and when AI is needed

**Spreadsheets (.xls, .xlsx, .csv)** are read in the browser by rules (`src/invoices/parse.js`). The parser does not depend on cell positions or column
titles. It reads each row by content, finds the three numbers where quantity × unit price = amount, and recognises fee rows, section headings, TOTAL,
deposit/balance blocks and a packing-list sheet. This is tested against the 15 real Bing Bing documents (all reconcile to the cent).

**PDFs and images** cannot be read by rules. They need the optional AI function in `supabase/functions/extract-invoice`:

1. Deploy it: `supabase functions deploy extract-invoice`
2. Add the key: `supabase secrets set ANTHROPIC_API_KEY=<key>` (the project owner's key; each document costs a few cents)
3. In Netlify, set `VITE_INVOICE_AI_ENABLED=true` for the site and redeploy.

The function returns the same structure as the rules parser, so the review screen, matching, duplicate checks and the arithmetic checks are identical.
Anything read by AI is labelled "Read by AI" and must be checked against the original before saving.
