# Automatic shipment tracking (EasyPost)

The DTC Products board shows each shipment's carrier status and ETA, refreshed when you open a product that is in **Shipping**
(if the last check is older than 6 hours) and with **↻ Update tracking** on the board. The status comes from EasyPost, which looks the
tracking number up with FedEx, UPS, DHL and USPS. Without the setup below the app still works: you keep the tracking number, the
**Track shipment** link and the manual ETA.

## What you do (about 15 minutes)

1. **Create an EasyPost account** at easypost.com (use the HVI email). In the dashboard open **API Keys**: there is a *Test* key and a
   *Production* key.
2. **Add a payment method** to the account. Production tracking is billed per tracker (standalone trackers are around 2 to 3 cents each,
   check the current price on easypost.com/pricing). Test keys are free.
3. **Install the Supabase CLI** (once): `brew install supabase/tap/supabase`, then `supabase login`.
4. In the repository folder, link the **TEST** project and deploy the function:
   ```bash
   supabase link --project-ref ymzeklhdzpmaakvlxrkx
   supabase functions deploy track-shipment
   ```
5. Store the key as a secret (start with the **Test** key, switch to Production when you are happy):
   ```bash
   supabase secrets set EASYPOST_API_KEY=EZTK...your test key...
   ```
   (Dashboard alternative: Project Settings → Edge Functions → Secrets.)
6. Run `migration_dtc_tracking.sql` in the SQL editor of the same project.

## Trying it

With the **Test** key EasyPost only knows its own sample numbers, for example `EZ1000000001` (pre-transit), `EZ2000000002` (in transit),
`EZ3000000003` (out for delivery), `EZ4000000004` (delivered). Put one on a product in Shipping and press **↻ Refresh status**.
Real numbers need the Production key.

## Notes

- Choosing a carrier in the product helps EasyPost; "Other / freight" lets it detect the carrier from the number. Ocean freight and
  some China-origin carriers are not covered by EasyPost: use the **Track shipment** link (17TRACK) for those.
- A delivered shipment is never moved automatically. The product shows "delivered per the carrier" and you press **Received at warehouse**.
- The carrier's ETA is shown as "(carrier)" and takes precedence over the ETA typed by hand.
