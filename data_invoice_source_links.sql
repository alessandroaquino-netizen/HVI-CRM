-- HVI CRM — links from each saved invoice to the original document in the shared Drive folder (matched by file name). Idempotent.
-- Run AFTER migration_invoice_costing.sql.
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1j3kxzpZmXdFnHi2QcmgJyznggEJuspnp/view' WHERE file_name = 'HVI2618 - Neutral Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1AXfpOxJ5NoWYUAK327HwcJMkmOgcQz1u/view' WHERE file_name = 'HVI2625 - White Bucket Truck Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1DEeljmA1htXVtuGP3qDb0yDjpSXUc4Kw/view' WHERE file_name = 'Final Invoice HVI2621.23.25.26.27 - Olive Flannel, Red Flannel, Blue Arc Button Up, Pink Arc Button Up, White Bucket Truck Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1i_I7QfcthxvsKYfJUpbrI3By6ty-8Lrj/view' WHERE file_name = 'Final Invoice HVI2614.19 - Black Groundbreaker Flannel, Longsleeve Black Foreman.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1f5T3eSxi8Gr4DPAtvzxThxA7liYIwlfR/view' WHERE file_name = 'HVI2614 - Black Groundbreaker Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1vd9sOmDSi_wVQqjp3qxOYXehsukOYzum/view' WHERE file_name = 'HVI2626 - Blue Arc Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1-wvS1pi6y-izvP9qKoDN7fZ6MdS-I3Na/view' WHERE file_name = 'HVI2621 - Olive Flannel, Red Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1BEqjWgbk9vqXL5bvGJz02bqO0XDE--A4/view' WHERE file_name = 'HVI2627-1 Pink Arc Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1udJ887VngK2xdJqq9gzC6byxasybGG8A/view' WHERE file_name = 'HVI2628 - Navy Grey Flannel.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1Z1s0Pw5nQWn5Kw0HtE_n4-WeQfvswDsM/view' WHERE file_name = 'HVI2629 - Blackout Islander Button Up, Neon Islander Button Up.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1CTuuetOQFD8Sujja3EIY-aF2sAvdj7wb/view' WHERE file_name = 'HVI2624 - Black Performance Hoodie 2.0.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1PhSTKYYF6r4yyD8ZVCgd3R_TkBSXl-6U/view' WHERE file_name = 'Final Invoice HVI2620 - Black Overtime Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1YefTLqyg6hRmasl39nkJ4iaDVSjHL0-A/view' WHERE file_name = 'HVI2620 - Black Overtime Polo.xls' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1wM-iFcqqkppZkNx7dUe0LmFbWCEHqP6H/view' WHERE file_name = 'Final Invoice HVI2616.17.18 - Olive Button Up, Navy Button Up, Neutral Button Up, Olive Long Sleeve Samples.xlsx' AND source_url IS NULL;
UPDATE dtc_invoices SET source_url = 'https://drive.google.com/file/d/1IFvJri0TpkPoqHa3NCilMte-uK777sDn/view' WHERE file_name = 'HVI2630 - Sample Fee for Camo Polos.xls' AND source_url IS NULL;
