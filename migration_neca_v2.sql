-- HVI CRM — Migration: NECA Potential Leads v2
--   • per-factor score breakdown (Tony's 10-factor rubric) with verified / estimated / unverified status
--   • top executive + size band + research sources
--   • `source` column (future associations: IBEW, etc.)
--   • two-way link between neca_leads and leads, plus automatic matching
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Requires migration_neca_leads.sql. Safe to run multiple times.

-- ─── 1. Columns ────────────────────────────────────────────────────────────
ALTER TABLE neca_leads
  ADD COLUMN IF NOT EXISTS source              text    NOT NULL DEFAULT 'NECA',
  ADD COLUMN IF NOT EXISTS score_breakdown     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS factors_evaluated   integer,
  ADD COLUMN IF NOT EXISTS employee_band       text CHECK (employee_band IN ('1-50','51-100','101-500','501-1000','1000+')),
  ADD COLUMN IF NOT EXISTS top_executive_name  text,
  ADD COLUMN IF NOT EXISTS top_executive_title text,
  ADD COLUMN IF NOT EXISTS research_sources    text,
  ADD COLUMN IF NOT EXISTS linked_lead_id      uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_lead_id   uuid REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_reason    text;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS neca_lead_id uuid REFERENCES neca_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS neca_leads_linked_idx ON neca_leads (linked_lead_id);
CREATE INDEX IF NOT EXISTS neca_leads_source_idx ON neca_leads (source);
CREATE INDEX IF NOT EXISTS leads_neca_idx        ON leads (neca_lead_id);

-- ─── 2. Preliminary breakdown from directory data only ─────────────────────
-- Tony's rubric (100 pts): fit 20, 100+ employees 15, multiple locations 10, culture 10,
-- events 10, branded apparel 15, recruiting 5, marketing dept 5, HVI connection 5, Quanta/ecosystem 5.
CREATE OR REPLACE FUNCTION neca_prelim_breakdown(p_company text, p_chapters text, p_memberships integer)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  line_ch boolean := coalesce(p_chapters, '') ~* 'line (constructors|builders)';
  strong  boolean := coalesce(p_company, '')  ~* '(high[- ]?voltage|transmission|substation|power[- ]?lines?|line (construction|contractors?|builders?|services?)|linemen|lineman|utility (construction|contractors?|services?)|utilities)';
  n int := coalesce(p_memberships, 1);
  fit_e int; fit_s text; fit_n text;
  emp_e int := 0; emp_s text := 'unverified'; emp_n text := 'Employee count not yet researched.';
  loc_e int; loc_n text;
  pending text := 'Not yet researched.';
BEGIN
  IF line_ch THEN
    fit_e := 20; fit_s := 'verified';  fit_n := 'Member of a NECA Line Constructors / Line Builders chapter (transmission & distribution work).';
  ELSIF strong THEN
    fit_e := 20; fit_s := 'estimated'; fit_n := 'Company name points to utility / high-voltage line work.';
  ELSE
    fit_e := 10; fit_s := 'estimated'; fit_n := 'NECA electrical contractor with no specific high-voltage signal in the directory (half credit).';
  END IF;

  IF n >= 10 THEN emp_e := 15; emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a large, multi-region company (100+ employees likely).';
  ELSIF n >= 5 THEN emp_e := 10; emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a sizable company (100+ employees possible).';
  ELSIF n >= 3 THEN emp_e := 5;  emp_s := 'estimated'; emp_n := n || ' NECA listings suggest a mid-size company.';
  END IF;

  loc_e := CASE WHEN n >= 5 THEN 10 WHEN n >= 3 THEN 7 WHEN n = 2 THEN 4 ELSE 0 END;
  loc_n := n || ' NECA chapter/division listing' || CASE WHEN n = 1 THEN '' ELSE 's' END || '.';

  RETURN jsonb_build_array(
    jsonb_build_object('key','fit',            'label','Strong electrical / high-voltage fit',  'max',20,'earned',fit_e,'status',fit_s,        'note',fit_n),
    jsonb_build_object('key','employees',      'label','100+ employees',                        'max',15,'earned',emp_e,'status',emp_s,        'note',emp_n),
    jsonb_build_object('key','locations',      'label','Multiple crews / locations',            'max',10,'earned',loc_e,'status','verified',   'note',loc_n),
    jsonb_build_object('key','culture',        'label','Visible company culture / employee pride','max',10,'earned',0,'status','unverified',    'note',pending),
    jsonb_build_object('key','events',         'label','Attends conferences / events',          'max',10,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','apparel',        'label','Already uses branded apparel',          'max',15,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','recruiting',     'label','Recruiting / employer-branding activity','max',5,'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','marketing',      'label','Has a marketing department',            'max',5, 'earned',0,    'status','unverified', 'note',pending),
    jsonb_build_object('key','hvi_connection', 'label','Known HVI connection / mutual relationship','max',5,'earned',0, 'status','unverified', 'note','No HVI relationship recorded.'),
    jsonb_build_object('key','quanta',         'label','Quanta / strategic ecosystem connection','max',5,'earned',0,   'status','unverified', 'note',pending)
  );
END $$;

-- ─── 3. Recompute score / tier / rationale from the breakdown ──────────────
-- Tier uses only factors that have been evaluated (verified or estimated):
--   score = earned / max of evaluated factors × 100;  A ≥ 75, B 50–74, C < 50.
--   A additionally requires the "100+ employees" factor to be evaluated (size evidence).
-- The "HVI connection" factor is driven by the link to the pipeline.
CREATE OR REPLACE FUNCTION neca_recompute(p_id uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  r record; bd jsonb; newbd jsonb; earned numeric; maxp numeric; evald int; n int := 0;
  sc int; tr text; txt text;
BEGIN
  FOR r IN SELECT * FROM neca_leads WHERE (p_id IS NULL OR id = p_id) LOOP
    bd := CASE WHEN jsonb_array_length(r.score_breakdown) = 0
               THEN neca_prelim_breakdown(r.company, coalesce(r.chapters, '') || ' ' || coalesce(r.chapter, ''), r.memberships_count)
               ELSE r.score_breakdown END;

    SELECT coalesce(jsonb_agg(
             CASE WHEN e.elem ->> 'key' = 'hvi_connection' THEN
               CASE WHEN r.linked_lead_id IS NOT NULL
                    THEN e.elem || jsonb_build_object('earned', (e.elem ->> 'max')::int, 'status', 'verified', 'note', 'Already a lead in the HVI pipeline.')
                    ELSE e.elem || jsonb_build_object('earned', 0, 'status', 'unverified', 'note', 'No HVI relationship recorded.')
               END
             ELSE e.elem END
             ORDER BY e.ord), '[]'::jsonb)
      INTO newbd
      FROM jsonb_array_elements(bd) WITH ORDINALITY AS e(elem, ord);

    SELECT coalesce(sum((x ->> 'earned')::numeric), 0), coalesce(sum((x ->> 'max')::numeric), 0), count(*)
      INTO earned, maxp, evald
      FROM jsonb_array_elements(newbd) x WHERE x ->> 'status' <> 'unverified';

    IF maxp > 0 THEN
      sc := round(100 * earned / maxp);
      tr := CASE WHEN sc >= 75 THEN 'A' WHEN sc >= 50 THEN 'B' ELSE 'C' END;
      -- A-tier needs size evidence: without an evaluated "100+ employees" factor the best tier is B.
      IF tr = 'A' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(newbd) x WHERE x ->> 'key' = 'employees' AND x ->> 'status' <> 'unverified') THEN
        tr := 'B';
      END IF;
    ELSE sc := NULL; tr := NULL; END IF;

    IF r.qualification_status = 'preliminary' THEN
      SELECT 'Preliminary ' || coalesce(sc::text, '—') || '/100, based on ' || evald || ' of 10 rubric factors (directory data only). '
             || coalesce(string_agg((x ->> 'label') || ' ' || (x ->> 'earned') || '/' || (x ->> 'max'), '; '), '')
             || '. ' || (10 - evald) || ' factors still need research (employees, culture, events, apparel, recruiting, marketing, ecosystem).'
        INTO txt
        FROM jsonb_array_elements(newbd) x WHERE x ->> 'status' <> 'unverified';
    ELSE txt := r.score_rationale; END IF;

    UPDATE neca_leads
       SET score_breakdown = newbd, score = sc, tier = tr, factors_evaluated = evald, score_rationale = txt
     WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ─── 4. Name normalisation + automatic matching against the pipeline ──────
CREATE OR REPLACE FUNCTION neca_norm_name(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(split_part(regexp_replace(lower(coalesce(t, '')), '\(.*?\)', ' ', 'g'), ' - ', 1), '\mdba\M.*$', '', 'g'),
               '[^a-z0-9& ]+', ' ', 'g'),
             '\m(inc|llc|co|corp|corporation|company|ltd|lp|llp|the|incorporated|pllc|pc)\M', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

-- Links a NECA company to a pipeline lead ONLY on a unique, exact match (same normalised name,
-- ignoring spaces — "Arch Key" = "ArchKey" — or same website/email domain with the same first
-- letters). Anything fuzzier becomes a *suggestion* for a person to confirm. Nothing is copied.
CREATE OR REPLACE FUNCTION neca_crosslink() RETURNS TABLE (auto_linked integer, suggestions integer)
LANGUAGE plpgsql AS $$
DECLARE linked_n int := 0; sugg_n int := 0;
BEGIN
  DROP TABLE IF EXISTS _m, _u;
  UPDATE neca_leads SET suggested_lead_id = NULL, suggested_reason = NULL WHERE linked_lead_id IS NULL;

  CREATE TEMP TABLE _m ON COMMIT DROP AS
  WITH n AS (
    SELECT id, replace(neca_norm_name(company), ' ', '') AS k,
           split_part(regexp_replace(lower(coalesce(website, '')), '^(https?://)?(www\.)?', ''), '/', 1) AS dom
    FROM neca_leads WHERE linked_lead_id IS NULL
  ), l AS (
    SELECT id, replace(neca_norm_name(company), ' ', '') AS k, lower(split_part(coalesce(email, ''), '@', 2)) AS dom
    FROM leads WHERE neca_lead_id IS NULL
  )
  SELECT DISTINCT n.id AS nid, l.id AS lid
  FROM n JOIN l ON (n.k = l.k AND length(n.k) >= 3)
                OR (n.dom <> '' AND n.dom = l.dom AND left(n.k, 4) = left(l.k, 4));

  CREATE TEMP TABLE _u ON COMMIT DROP AS
  SELECT nid, lid FROM _m
  WHERE nid IN (SELECT nid FROM _m GROUP BY nid HAVING count(*) = 1)
    AND lid IN (SELECT lid FROM _m GROUP BY lid HAVING count(*) = 1);

  UPDATE neca_leads nl SET linked_lead_id = u.lid FROM _u u WHERE nl.id = u.nid;
  GET DIAGNOSTICS linked_n = ROW_COUNT;
  UPDATE leads ld SET neca_lead_id = u.nid FROM _u u WHERE ld.id = u.lid;

  WITH n AS (SELECT id, replace(neca_norm_name(company), ' ', '') AS k FROM neca_leads WHERE linked_lead_id IS NULL),
       l AS (SELECT id, company, replace(neca_norm_name(company), ' ', '') AS k FROM leads WHERE neca_lead_id IS NULL),
       c AS (
         SELECT DISTINCT ON (n.id) n.id AS nid, l.id AS lid, l.company AS lname
         FROM n JOIN l ON least(length(n.k), length(l.k)) >= 5 AND (n.k LIKE l.k || '%' OR l.k LIKE n.k || '%')
         ORDER BY n.id, abs(length(n.k) - length(l.k))
       )
  UPDATE neca_leads nl SET suggested_lead_id = c.lid, suggested_reason = 'Similar name to pipeline lead "' || c.lname || '"'
  FROM c WHERE nl.id = c.nid;
  GET DIAGNOSTICS sugg_n = ROW_COUNT;

  PERFORM neca_recompute(id) FROM neca_leads WHERE linked_lead_id IS NOT NULL;
  RETURN QUERY SELECT linked_n, sugg_n;
END $$;

GRANT EXECUTE ON FUNCTION neca_recompute(uuid), neca_crosslink(), neca_prelim_breakdown(text, text, integer), neca_norm_name(text) TO authenticated;

-- ─── 5. Apply to existing rows ─────────────────────────────────────────────
-- (Rows already researched keep their own text; their breakdown is set by the research script.)
SELECT neca_recompute(NULL) AS rows_rescored;
SELECT * FROM neca_crosslink();

SELECT tier, count(*) FROM neca_leads GROUP BY tier ORDER BY tier;
SELECT company, tier, score, factors_evaluated, linked_lead_id IS NOT NULL AS linked, suggested_reason
FROM neca_leads WHERE linked_lead_id IS NOT NULL OR suggested_lead_id IS NOT NULL ORDER BY company LIMIT 50;
