# Invoice history load: what was decided and what still needs a person

Source: 15 Bing Bing documents (pro-forma and final), the Gmail threads for each order, and the meeting notes of Oct 21.
Loader: `scripts/build-invoice-history.mjs` (same extraction and matching code the upload screen uses). Output: `data/invoices/data_dtc_invoice_history_test.sql`.

## Checks that passed (all 15 documents)
- Every document's line amounts add up to its printed TOTAL to the cent, and the load keeps that equality after splitting shared charges.
- Pro-forma deposits are exactly 50% of the pro-forma total (HVI2621, 2625, 2626, 2627), which is the rule used when a deposit is not printed.
- On the combined final (HVI2621.25.26.27) the balance reconciles: 22,018.80 − deposits 9,805.30 − overpaid 10.00 = 12,203.50.
- Courier and photography on that final were split using each product's pro-forma charge; Olive and Red flannel (no courier on their pro-forma) share the 2,261.00 that is left.
- Packing-list quantities match the invoices except where noted below. Re-running the SQL changes nothing (15 invoices, 73 lines).

## Things the documents get wrong (flagged by the system)
| Document | Problem | Resolution used |
|---|---|---|
| HVI2628 "Navy Grey Flannel" | Line says "Olive Green flannel shirt" (copy-paste from HVI2621) | Product = Flannel - Blue/Grey (file name, and the thread "New Blue Grey Flannel Shirt (HVI2628)") |
| HVI2618 file "Neutral Button Up" | Line says "Subtle Hawaiian Button up" | Same product: Subtle Hawaiian Button Up (the final invoice calls it "Hawaii subtle") |
| Final HVI2621.25.26.27 | "New Lightning" / "Pink New Lightning" | Arc Button Up - Blue / Pink, by unit price and quantity of pro-formas HVI2626 / HVI2627 |
| Final HVI2620 and HVI2614.19 | Line says only "MEN'S POLO SHIRTS", "Flannel", "Solid Black" | Product taken from the pro-forma of the same order or from the file name |
| HVI2624 | Photography amount blank | Calculated 1 × 45 = 45; the document total confirms it |
| HVI2630 | Mixes B2B (MSLCAT / Quanta) with the DTC camo polo sample fee | Only the $180 sample fee is DTC; $1,516 is stored as "Not DTC". Tony's email confirms two separate payments |
| Final HVI2621.25.26.27 | White Bucket Truck shipped 323 pcs vs 310 on the pro-forma; olive/red 315 vs 313 | Recorded as quantity change; the final quantity is used for cost per unit |
| Final HVI2621.25.26.27 | A deposit line for HVI2623 (10.00) and "Overpaid HVI2623 10.00" | Treated as an overpayment, not a product |

## Decisions that need a person to confirm
1. **HVI2614 "Black Groundbreaker Flannel" = Flannel - Black/Yellow OG.** The tracker never uses the word Groundbreaker.
2. **HVI2616/17 Solid Olive and Solid Navy = Foreman - Olive / Navy Blue Button Up.** Only the final invoice is available; no pro-forma for these two.
3. **Solid Olive Long Sleeve samples ($60)** is attached to Foreman - Olive Button Up; the tracker has no olive long sleeve product.
4. **HVI2619 "Solid Black" (160 pcs, $10.60) = Foreman Black Long Sleeve.**
5. **HVI2629 Islander designs:** Pink/Green = Neon Islander, Black/White = Blackout Islander (by colour; the file name lists them in the other order). The $810 sample fee (54 samples: 41 button-ups and 13 polos per the email) is split between the two shirts, although 13 of the samples are polos.
6. **HVI2630 courier $195** is classed as not DTC because it is listed with the MSLCAT group; confirm with the two payment screenshots.
7. **Payment dates.** The invoices show that deposits were paid but not when. Where an email gave the date it was used (Aug 28, Sep 8, Oct 8, Oct 21, Sep 13); otherwise the pro-forma date is used as a stand-in and the record's note says so. Final (balance) payments are left empty unless an email proved them. Balances on delivered orders are almost certainly paid; Adriana should enter the dates.

## Not loaded
- Pro-formas for HVI2616, HVI2617 and HVI2619, and any document for HVI2623, were not in the folder. HVI2623 appears only as the overpayment line above.
- Print Theory SKU sheet: analysed, not loaded (see the reply for the questions).
