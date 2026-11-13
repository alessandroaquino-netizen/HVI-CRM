# HVI CRM: implementation roadmap (updated Nov 10, 2026)

## Delivered in TEST
- Shipping phase with carrier, tracking, ETA; carrier status via EasyPost (needs the function and key, see docs/shipment-tracking.md)
- Inventory by product and size, gaps, history, cost per unit on sellable units; standard size runs (tee S to 3XL, shirts and polos S to 4XL, hats one size) with free additions
- Calendar: 3 and 12 months, timeline with drag to move, editable promotion and event dates with colours, star for "dropped, not yet in the warehouse", T-minus planner
- Marketing Ops: drop plans, board, tracks (concurrent phases), my tasks, blockers, launch week, email-campaign column, asset checklist with one Drive folder, filter by person, team taken from user management
- Import dates and quantities from an email thread (built-in reader, AI reader when configured)
- Drop-ship products (no inventory or cost tracking), production time quoted vs actual

## Next
| Item | Depends on |
|---|---|
| Push notifications for follow-ups, payments and task changes | Roadmap. Needs a service worker, Web Push keys and a scheduled sender. Works on iPhone once the app is installed on the Home Screen (iOS 16.4 or newer). |
| Automatic carrier status in production | EasyPost account and the `track-shipment` function |
| B2B project tracking (production, shipping, warehouse and inventory) | HVI documents the phases and inventory structure |
| Weekly agenda and KPI tracker | HVI shares the KPIs; test with Q4, official from Q1 |
| Shopify collaborator access and site review | HVI sends the documentation and the list of front-end issues; Alessandro registers as a Shopify collaborator |
| Production deployment | HVI finishes the review and the 3 to 4 week test period |
