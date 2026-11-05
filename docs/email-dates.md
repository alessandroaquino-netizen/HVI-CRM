# Import dates from an email thread

In a product's detail window press **✉ Import dates**, upload the thread (PDF printed from Gmail, .txt or .eml) or paste the text.
The app lists every dated milestone it finds (order placed, samples approved, production start and end, shipped, expected delivery,
tracking number) with the sentence it came from. **You tick what is right, fix any date, and press Apply.** Nothing is written before that.

Applied dates go to the phase timeline (Design, Sampling, Production, Shipping), the order date, and the shipping fields. You can also
tick "move the product to <phase>".

## Two readers

- **Built-in reader** (always on): keyword and date rules. Works for PDFs with selectable text (Gmail prints) and pasted text. It can
  miss unusual wording and it cannot read scanned PDFs.
- **AI reader** (better with free-form emails and scans): the `extract-email-dates` Edge Function. Same setup as invoice AI:
  ```bash
  supabase link --project-ref ymzeklhdzpmaakvlxrkx
  supabase functions deploy extract-email-dates
  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # skip if already set for extract-invoice
  ```
  When the function is available it is used first; otherwise the app says so and uses the built-in reader.
