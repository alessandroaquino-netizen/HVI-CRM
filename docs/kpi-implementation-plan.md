# KPI Scorecard, Rocks & Meeting Agenda — Implementation Plan

Status: PHASE 1 BUILT IN TEST (Nov 10, 2026) — Scorecard + Rocks, admin-only editing, seeded with all Q4 numbers. Phases 2+ pending.
Decisions made: all KPIs kept; only admins edit values; status thresholds 100% / 90%; Canva agenda and the site-development email are out of scope for now.
Original status: DRAFT for review with Adriana, Tony, Aira. Source: Notion exports
"Q4 2026 KPIs" and "Q4 2026 Rocks" (shared by Adriana). The Canva team agenda
has not been read yet (needs export), so Phase 2 is provisional.

## 1. What the team tracks today

### KPIs (Notion, weekly grid, columns = Monday dates Oct 5 → Dec 28)
| Owner | KPI (target) | Source system (inferred) |
|---|---|---|
| HVI (company) | Weekly DTC revenue ($20,000) | Shopify |
| HVI | Ad spend as % of DTC revenue (25%, lower is better) | Meta/Google + Shopify |
| HVI | Klaviyo revenue as % of DTC revenue (35%) | Klaviyo + Shopify |
| HVI | LTV:CAC (2:1) | Shopify/Klaviyo + ad spend |
| Aira | 90-day LTV ($62) | Shopify/Klaviyo |
| Aira | Repeat purchase rate: Q2 cohort 42%, Q3 cohort 40% | Shopify/Klaviyo |
| Aira | Fanatic development: % of 12-mo customers with 3+ purchases (15%) | Shopify |
| Aira | Loyalty: active members 3,500; % members purchasing in 90d 32% | Klaviyo list |
| Kuerstine | Sitewide conversion rate (4.5%) | Shopify / GA4 |
| Kuerstine | Organic social sessions (8,000/quarter, ~615/week) | GA4 / Shopify |
| Kuerstine | Customer service: 100% same-day response; closed/open inquiries, reachouts, open/closed orders by vendor (HVI items, SW, Benchmark, Coewear, Camel City, Strictly Wild) | Support inbox + order tracking |
| Ryanne | Blended ROAS: Meta 2.5x, Google 8.5x (7- and 14-day windows) | Meta Ads, Google Ads |
| Ryanne | AI-attributed sessions (200/quarter) and revenue ($2,000) | Shopify ShopifyQL report |
| Ryanne | Creative output: 8 creatives/week, CTR 1.5%, click-to-purchase 5.5% | Motion, Meta |

### Rocks (quarterly priorities, 3 per owner, Aira / Kuerstine / Ryanne)
Free-text objectives with tactics/notes, status (Not started → ...), owner, quarter.
Examples: BFCM strategy (Aira), organic social + CS system + CRO to 4.5% (Kuerstine),
Meta creative strategy + AI-search visibility + BFCM paid support (Ryanne).

### Problems visible in the export
- Targets live inside the KPI name text ("$20,000", "25%"); no numeric target, unit or direction field.
- Status is set by hand and looks inconsistent with the numbers (e.g. weekly revenue
  below $20K in some weeks while marked On Track; LTV:CAC above 2:1 marked Off Track).
- Parent/QTD/sub-item hierarchy is flattened; QTD rows repeat as "Not started".
- Cell formats are mixed ("QTD: 2.15", "16 QTD: 55", "3.78" without %, Klaviyo links
  where a number should be, typo "Oct.19").
- Every number is typed by a person from another tool each week.

## 2. Proposed modules (inside the existing CRM, new "Team" section)

1. **Scorecard** — weekly grid like Notion, but with structured KPIs, automatic
   On/At risk/Off track status, QTD and trend, owner filter, quarter selector.
2. **Rocks** — per-owner quarterly board with status, tactics, and links to
   Marketing Ops drops/tasks and KPIs they move.
3. **Meeting mode** — agenda for the weekly team meeting: KPI snapshot (auto),
   Rocks status, discussion items, action items with owner/due date, history.
4. **Data connectors** — scheduled pulls to remove manual entry.

## 3. Data model (TEST Supabase first, idempotent SQL)

- `kpis`: id, quarter, name, owner_user, parent_id, unit (usd/pct/ratio/count),
  target_value, direction (higher_better/lower_better), cadence (weekly/qtd/quarter),
  aggregation (sum/avg/latest/computed), formula (for derived ones, e.g. ad spend / revenue),
  source (manual/shopify/klaviyo/meta/google/ga4/crm), sort_order, active.
- `kpi_values`: kpi_id, period_start (Monday), value, source, note, entered_by, updated_at;
  unique (kpi_id, period_start).
- `rocks`: id, quarter, owner_user, position, title, tactics, status, progress_note.
- `rock_kpis` (rock ↔ KPI), `rock_links` (rock ↔ drop/task).
- `meetings`, `meeting_items` (agenda), `action_items` (owner, due, status).
- RLS: `is_hvi_user()` read; write limited to the KPI owner and admins; audit trigger like inventory.
- Status rule (configurable): On track ≥ 100% of target (respecting direction),
  At risk 90–99%, Off track < 90%; QTD uses pro-rated target.

## 4. Phases

**Phase 0 — Confirm (before building)**
- Read the Canva agenda; read Adriana's separate "site development" email.
- Confirm with the team: which KPIs stay for Q1, who types data today, Q1 vs. now.

**Phase 1 — Scorecard + Rocks, manual entry (≈ 1 round)**
- Migration + seed from the two Notion CSVs (one-time importer, reusable each quarter).
- Weekly grid, QTD, auto status, owner filter, mobile layout, Monday reminder (in-app).
- Rocks board and rock ↔ KPI links.
- Mock data for QA; unit tests for status/QTD/derived formulas.

**Phase 2 — Meeting mode (≈ 1 round)**
- Agenda template from the Canva deck, KPI snapshot auto-inserted, action items,
  carry-over of open actions, meeting history.

**Phase 3 — Connectors (priority by KPIs covered)**
1. Shopify (Admin API / ShopifyQL via collaborator access already agreed):
   revenue, conversion, sessions, AI-referred sessions/revenue, repeat rate, 3+ purchase share.
2. Klaviyo API: email/SMS revenue %, loyalty list counts, 90-day purchasers.
3. Meta + Google Ads: spend, ROAS, CTR, click-to-purchase.
4. GA4 (organic social sessions) and Motion only if an API exists; otherwise stay manual.
   Edge Functions with secrets stored in Supabase, daily/weekly cron, "last synced" badge,
   manual override always allowed.

**Phase 4 — Link to CRM data**
- Creatives produced/week from Marketing Ops creative tasks; drops per week from DTC calendar;
  open/closed orders by vendor from DTC inventory/shipping where data exists.

**Phase 5 — Production**
- Run SQL in production, PR from TEST → production after team approval and the 3–4 week test.

## 5. Dependencies / risks
- API credentials and permissions from HVI (Shopify, Klaviyo, Meta, Google) — owner of each key must be named.
- Metric definitions (LTV, CAC, repeat rate cohorts) must be fixed in writing; connectors cannot guess them.
- Some KPIs (customer service, Motion data) may have no API; keep manual with validation.
- Meeting notes mark KPI/agenda integration for Q1; confirm whether to pull it forward.

## 6. Decisions needed
1. Keep all 14 KPI groups or reduce to a core set for the weekly meeting?
2. Who may edit values: owner only, or anyone on the team?
3. Status thresholds (90%/100%) acceptable?
4. Is the Canva agenda a fixed template every week?
5. Connectors: who provides credentials, and which system is the source of truth for each metric?
