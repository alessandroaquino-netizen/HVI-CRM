# Landed cost per unit: the method HVI uses (set Nov 2026)

Agreed after Adriana's reconciliation of invoices HVI2621 / 2625 / 2626 / 2627 (Blue Arc button-up, Pink Arc, Olive and Red Flannel, White Bucket Truck Polo).

## The rule
**Cost per unit = (goods + photography + fees + share of freight) ÷ units on the final invoice**

| Part | Where it comes from |
|---|---|
| Goods | Quantity × unit price of the product line on the **final** invoice. The final invoice replaces the pro-forma (names can differ: the final calls the Blue Arc "New Lightning"). |
| Photography | The $45 the supplier charges per shirt, assigned to the products that had it on the pro-forma. The White Bucket Truck Polo has none. |
| Fees and samples | Charged to the product they name. |
| Freight (courier, duties, taxes: one combined line) | Split by each product's **gross weight** on the packing list. If a packing list has no gross weights, by volume (CBM); if it has neither, by the pro-forma charge; as a last resort by goods value. The method used is saved on every line. |
| Units | Pieces on the final invoice / packing list. Once Inventory has a count, the cost per unit uses the sellable count instead (rejects raise the cost). |

The deposit (50% of the pro-forma) is a payment toward the order, **not** extra cost. It is never added again.

## Worked example, Blue Arc (HVI2626, 310 units)
Goods $3,100.00 + photography $45.00 + freight $5,755.90 × 88 kg ÷ 616 kg = $822.27 → **$3,967.27 ÷ 310 = $12.80 per unit** ($12.65 without photography).

| Product | Units | Goods / unit | Freight share | Cost / unit |
|---|---|---|---|---|
| Olive Flannel | 315 | $11.45 | $1,644.54 (176 kg) | $16.81 |
| Red Flannel | 315 | $11.45 | $1,644.54 (176 kg) | $16.81 |
| Blue Arc Button Up | 310 | $10.00 | $822.27 (88 kg) | $12.80 |
| Pink Arc Button Up | 325 | $10.00 | $822.27 (88 kg) | $12.67 |
| White Bucket Truck Polo | 323 | $7.80 | $822.28 (88 kg) | $10.35 |

These five numbers are asserted in `scripts/test-invoice-costing.mjs` against the real final invoice.

## What changed in the system
- Before, the final invoice's freight was split by what each pro-forma had charged for freight (Blue Arc $1,251 → $14.18 per unit; flannels lower). Now it is split by weight for **every** product and every future invoice.
- `migration_invoice_costing.sql` stores gross weight, volume and the split basis on each invoice line; `data_invoice_costing_fix.sql` re-splits the three existing final invoices that cover several products (HVI2614.19, HVI2616.17.18, HVI2621.25.26.27). Single-product invoices keep their full freight.
- Invoices → **Verification** compares every final invoice with its pro-forma and with the same product type, and flags price, quantity and freight changes and outliers.
- Every cost in Financials and Products links to the original invoice (Drive link on the invoice).

## Open points for Adriana and the bookkeeper
1. **The manufacturer may have billed freight per order.** The pro-forma freight charges (Olive $1,130.50, Red $1,130.50, Blue $1,251, Pink $1,251, Polo $992.90) add up to exactly the final freight ($5,755.90). If those were the real per-order charges, the pro-forma split would be the more literal one. Weight is used because it is what the reconciliation agreed on; ask the supplier for the freight breakdown by carton and we can switch the basis in one place.
2. Dimensional (volume) weight instead of gross weight would put Blue Arc at about $12.47 instead of $12.65 before photography.
3. Photography ($45 per shirt) is included in the unit cost at the bookkeeper's request; whether it is capitalized into inventory is for the bookkeeper to confirm.
4. The $10 overpayment credit on HVI2623 is not assigned to a product, so the products' remaining balances add up to $12,213.50 against the invoice balance of $12,203.50.
