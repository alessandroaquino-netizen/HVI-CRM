-- HVI CRM — Migration: NECA Potential Leads (separate from the main leads table)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project first)
-- Safe to run multiple times.
-- Requires migration_user_management.sql / is_hvi_user() to already be applied.

CREATE TABLE IF NOT EXISTS neca_leads (
  id                    uuid primary key default gen_random_uuid(),
  neca_key              text unique,                 -- normalised company key — used to de-duplicate imports
  neca_member_ids       text[] not null default '{}', -- every NECA directory id (nid) merged into this company
  memberships_count     integer not null default 1,  -- number of chapter/division listings in the directory
  locations             text,                        -- summary of listed locations, e.g. "San Jose, CA; Phoenix, AZ"
  company               text not null,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  website               text,
  chapter               text,                        -- primary chapter
  division              text,                        -- primary division
  chapters              text,                        -- all chapters listed (summary)

  -- Qualification (Tony's framework: A 75–100, B 50–74, C < 50)
  qualification_status  text not null default 'unqualified'
                        check (qualification_status in ('unqualified','preliminary','researched')),
  tier                  text check (tier in ('A','B','C')),
  score                 integer check (score between 0 and 100),
  score_rationale       text,                        -- plain-English "why pursue / why not"
  buying_signals        text,                        -- events, recruiting, anniversaries, apparel, etc.
  suggested_angle       text,                        -- recommended opening line
  instagram             text,
  employee_estimate     text,

  -- Up to 3 contacts: [{ "role": "buyer|champion|executive", "name", "title", "email", "phone", "linkedin", "reason" }]
  contacts              jsonb not null default '[]'::jsonb,

  -- Outreach tracking
  outreach_status       text not null default 'not_contacted'
                        check (outreach_status in ('not_contacted','contacted','replied','meeting','not_interested')),
  last_contacted_at     date,
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS neca_leads_tier_idx   ON neca_leads (tier);
CREATE INDEX IF NOT EXISTS neca_leads_state_idx  ON neca_leads (state);

CREATE OR REPLACE FUNCTION neca_leads_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS neca_leads_touch ON neca_leads;
CREATE TRIGGER neca_leads_touch BEFORE UPDATE ON neca_leads
  FOR EACH ROW EXECUTE FUNCTION neca_leads_touch_updated_at();

ALTER TABLE neca_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neca_leads read"   ON neca_leads;
DROP POLICY IF EXISTS "neca_leads insert" ON neca_leads;
DROP POLICY IF EXISTS "neca_leads update" ON neca_leads;
DROP POLICY IF EXISTS "neca_leads delete" ON neca_leads;

CREATE POLICY "neca_leads read"   ON neca_leads FOR SELECT TO authenticated USING (is_hvi_user());
CREATE POLICY "neca_leads insert" ON neca_leads FOR INSERT TO authenticated WITH CHECK (is_hvi_user());
CREATE POLICY "neca_leads update" ON neca_leads FOR UPDATE TO authenticated USING (is_hvi_user());
CREATE POLICY "neca_leads delete" ON neca_leads FOR DELETE TO authenticated USING (is_hvi_user());

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE neca_leads;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT count(*) AS neca_leads_rows FROM neca_leads;
