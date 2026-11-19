# Production package, phase C (Nov 2026)

Run `01_run_in_production.sql` (same as `migration_round5.sql`) once in the **production** Supabase SQL Editor **before** merging the pull request. It is idempotent and additive:
- `neca_leads.company_email` (generic company email on Potential Leads)
- allows `pdf` as an invoice extraction method (PDF invoices read in the browser)

What ships: PDF invoice reading, company email + website editable at the top of Potential Leads, the **HVI Hub** name (CRM now names only the Sales section), and the `[TEST]` tab title/icon on the test site (production tab stays "HVI Hub").
Rollback: revert the Netlify deploy; the column and the constraint stay harmless.
