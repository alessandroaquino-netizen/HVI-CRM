-- HVI CRM — Migration: Product drop & pre-marketing workflow (Marketing Ops)
-- Run in: Supabase dashboard → SQL Editor → New query → Run   (TEST project)
-- Requires migration_dtc.sql and is_hvi_user(). Safe to run multiple times: the task templates are seeded once and
-- never overwritten afterwards, so changes made in the app by Adriana (due dates, owners) are kept.
--
-- Model: a DROP belongs to one DTC product and has a public launch date (normally a Friday). TASKS are generated from
-- TEMPLATES with a due date relative to the launch (offset_days: -2 = Wednesday Vault, 0 = Friday). Each task has an owner
-- role (Tony, Adriana, Kuerstine, Ryanne, Aira, Paul, Warehouse), a status (not_started / in_progress / complete / na)
-- and optional dependencies. Dependencies are soft: they show "waiting on" but never block work.

-- ─── 1. Team roles (who is who; email is filled in the app once people are invited) ───────────────────────
CREATE TABLE IF NOT EXISTS team_roles (
  role          text primary key,
  display_name  text not null,
  email         text,
  is_external   boolean not null default false,
  sort          integer not null default 0
);
INSERT INTO team_roles (role, display_name, is_external, sort) VALUES
  ('tony',      'Tony',                  false, 1),
  ('adriana',   'Adriana',               false, 2),
  ('kuerstine', 'Kuerstine',             false, 3),
  ('ryanne',    'Ryanne',                false, 4),
  ('aira',      'Aira',                  false, 5),
  ('paul',      'Paul (photographer)',   true,  6),
  ('warehouse', 'Warehouse',             false, 7)
ON CONFLICT (role) DO NOTHING;

-- ─── 2. Task templates (editable in the app: owner, due-date offset, dependencies, N/A defaults) ───────────
CREATE TABLE IF NOT EXISTS drop_task_templates (
  key            text primary key,
  phase          text not null check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  title          text not null,
  description    text,
  owner_role     text not null references team_roles(role),
  offset_days    integer not null default 0,                 -- days from the public launch date (negative = before)
  depends_on     text[] not null default '{}',
  na_for         text[] not null default '{}',               -- drop types where the task starts as N/A (new_product | colorway | restock)
  only_if        text check (only_if in ('preorder','instock')),
  blocker_group  text,                                       -- photography | copy | walkthrough | listing | inventory | creative | launch
  sop_url        text,
  active         boolean not null default true,
  sort           integer not null default 0,
  updated_by     text,
  updated_at     timestamptz not null default now()
);

INSERT INTO drop_task_templates (key, phase, title, owner_role, offset_days, depends_on, na_for, only_if, blocker_group, sort, description) VALUES
 ('walkthrough',       'brief',    'Record the internal product walkthrough (materials, fit, feel, sizing, special details, design rationale)', 'tony',      -28, '{}',                              '{restock}',            NULL, 'walkthrough', 10, 'Done during sampling. Tony and Paul each receive their own sample.'),
 ('walkthrough_link',  'brief',    'Link the walkthrough to the product record',                                  'tony',      -27, '{walkthrough}',                   '{restock}',            NULL, 'walkthrough', 20, NULL),
 ('tech_details',      'brief',    'Send technical details and features to Adriana',                              'tony',      -26, '{walkthrough}',                   '{restock}',            NULL, 'walkthrough', 30, NULL),
 ('copy_core',         'brief',    'Product name, hooks and description',                                         'adriana',   -21, '{walkthrough}',                   '{restock}',            NULL, 'copy',        40, 'Starts the work for email, social, site and listing. Restocks reuse the existing copy.'),
 ('pricing',           'brief',    'Approve the retail price',                                                    'adriana',   -21, '{}',                              '{}',                   NULL, 'copy',        50, NULL),
 ('info_sheet',        'brief',    'Add the product information to the product information sheet or linked record', 'adriana', -20, '{copy_core,pricing}',             '{}',                   NULL, 'copy',        60, NULL),
 ('sku_cost',          'brief',    'Confirm SKUs and unit cost from the product development records',             'kuerstine', -18, '{}',                              '{}',                   NULL, 'listing',     70, NULL),
 ('hands_video',       'brief',    'Record the hands-only customer-facing walkthrough video (reusable marketing asset)', 'tony', -10, '{}',                            '{}',                   NULL, 'walkthrough', 80, 'Tracked for every drop, including restocks, and reused where possible.'),

 ('shot_list',         'assets',   'Build the product shot list from the walkthrough and brief Paul',             'ryanne',    -18, '{walkthrough}',                   '{restock}',            NULL, 'photography', 100, NULL),
 ('model_photos',      'assets',   'Model photos, detail shots and fit/movement video',                           'paul',      -10, '{shot_list}',                     '{restock}',            NULL, 'photography', 110, 'Paul emails the support inbox; Kuerstine downloads and organizes the files.'),
 ('flat_lays',         'assets',   'Manufacturer flat lays received (WeTransfer link forwarded to support) and saved to Drive', 'kuerstine', -12, '{}',                '{}',                   NULL, 'photography', 120, NULL),
 ('photo_intake',      'assets',   'Download and organize the photos in Drive; link the folder to the product',   'kuerstine', -7,  '{model_photos}',                  '{restock}',            NULL, 'photography', 130, NULL),
 ('shot_check',        'assets',   'Compare delivered assets with the shot list and flag missing shots to Ryanne', 'kuerstine', -6, '{photo_intake}',                  '{restock}',            NULL, 'photography', 140, 'A completeness check, not a formal approval.'),
 ('missing_shots',     'assets',   'Follow up on any missing shots with Paul',                                    'ryanne',    -5,  '{shot_check}',                    '{restock}',            NULL, 'photography', 150, NULL),
 ('social_assets',     'assets',   'Asset list and weekly description ready for social captions',                  'kuerstine', -6,  '{copy_core}',                     '{}',                   NULL, 'copy',        160, NULL),

 ('shopify_official',  'listing',  'Create the official Shopify listing: name, SKUs, variants and sizes',         'kuerstine', -14, '{sku_cost}',                      '{restock}',            NULL, 'listing',     200, 'Keep access restricted until it is intentionally authorized.'),
 ('shopify_price',     'listing',  'Enter the approved retail price and unit cost (COGS)',                         'kuerstine', -12, '{pricing,sku_cost}',              '{}',                   NULL, 'listing',     210, NULL),
 ('shopify_placeholder','listing', 'Create the zero-inventory placeholder listing (Notify Me signups only)',       'kuerstine', -8,  '{shopify_official}',              '{restock}',            NULL, 'listing',     220, 'Retired on Friday; Notify Me signups move to the official listing.'),
 ('shopify_content',   'listing',  'Add description, product information and photography to the official listing', 'kuerstine', -5, '{copy_core,photo_intake}',        '{}',                   NULL, 'listing',     230, 'If photography is late, use approved temporary AI photos and keep the replacement task open.'),
 ('links_recorded',    'listing',  'Record missing fields and link both listings in the database',                 'kuerstine', -5,  '{shopify_official}',              '{}',                   NULL, 'listing',     240, NULL),
 ('inventory_counts',  'listing',  'Final sellable counts entered in Inventory',                                   'warehouse', -3,  '{}',                              '{dropship}',           'instock', 'inventory', 250, 'Never split sellable inventory across duplicate listings.'),
 ('preorder_setup',    'listing',  'Pre-order setup: update Shopify and the expected shipping timing',             'kuerstine', -2,  '{}',                              '{}',                   'preorder', 'listing', 260, NULL),

 ('email_plan','email', 'Plan the email sequence and brief the designer',                               'aira',      -9,  '{copy_core}',                     '{}',                   NULL, 'creative',    300, NULL),
 ('size_graphics',     'creative', 'Size/fit graphics and PDP enhancements',                                       'ryanne',    -6,  '{photo_intake}',                  '{restock}',            NULL, 'creative',    310, NULL),
 ('social_plan',       'creative', 'Organic social plan (larger buildup for new products, lighter for colorways and restocks)', 'kuerstine', -8, '{copy_core}',         '{}',                   NULL, 'creative',    320, NULL),
 ('social_weekend',    'creative', 'Teaser post the weekend before the drop',                                       'kuerstine', -6,  '{social_plan}',                   '{}',                   NULL, 'creative',    330, NULL),
 ('banners',           'creative', 'Homepage and collection banners prepared and uploaded (linked to the placeholder listing)', 'ryanne', -4, '{shopify_placeholder}',     '{}',                   NULL, 'creative',    340, 'Monday. Uses approved AI photos if the real ones are not in yet.'),
 ('email_teaser','email', 'Build and send the Monday teaser email',                                        'aira',      -4,  '{copy_core,shopify_placeholder}', '{}',                   NULL, 'creative',    350, 'Needs photos, description and the product link.'),
 ('ads_creative',      'creative', 'Start the drop ad creative (with Socialite)',                                   'ryanne',    -4,  '{copy_core}',                     '{}',                   NULL, 'creative',    360, 'Most drops get ads; mark N/A when this one does not.'),
 ('pdp_assets',        'creative', 'Upload PDP graphics to the listing',                                            'ryanne',    -3,  '{size_graphics,shopify_official}','{restock}',            NULL, 'creative',    370, 'Owner to confirm: Ryanne or Kuerstine.'),
 ('founder_draft','email', 'Write the optional From the Founder email copy',                                'adriana',   -5,  '{copy_core}',                     '{restock,colorway}',   NULL, 'copy',        380, NULL),
 ('founder_send','email', 'Build and send the From the Founder email (Tuesday)',                           'aira',      -3,  '{founder_draft}',                 '{restock,colorway}',   NULL, 'creative',    390, NULL),
 ('ads_approval',      'creative', 'Approve new ad creative',                                                       'adriana',   -3,  '{ads_creative}',                  '{restock,colorway}',   NULL, 'creative',    400, 'Routine restock edits can skip approval.'),
 ('social_sneak',      'creative', 'Tuesday sneak peek or extra details post',                                      'kuerstine', -3,  '{social_plan}',                   '{restock}',            NULL, 'creative',    410, NULL),
 ('social_reveal',     'creative', 'Wednesday full reveal post (when appropriate)',                                 'kuerstine', -2,  '{social_plan}',                   '{restock}',            NULL, 'creative',    420, NULL),
 ('preorder_email','email', 'Pre-order messaging in the remaining emails',                                   'aira',      -1,  '{}',                              '{}',                   'preorder', 'creative', 430, NULL),
 ('preorder_site',     'creative', 'Pre-order messaging on banners and paid ads',                                   'ryanne',    -1,  '{}',                              '{}',                   'preorder', 'creative', 440, NULL),
 ('preorder_social',   'creative', 'Pre-order messaging in organic social',                                         'kuerstine', -1,  '{}',                              '{}',                   'preorder', 'creative', 450, NULL),

 ('v_listing',         'vault',    'Official listing, variants, copy, sizing and photography are complete',        'kuerstine', -2,  '{shopify_content}',               '{}',                   NULL, 'launch',      500, 'Wednesday Vault is the first real customer purchase window.'),
 ('v_pdp',             'vault',    'PDP graphics and website banners are in place',                                'ryanne',    -2,  '{banners}',                       '{}',                   NULL, 'launch',      510, NULL),
 ('v_price_inv',       'vault',    'Retail price, COGS and final sellable inventory (or pre-order status) verified', 'kuerstine', -2, '{shopify_price}',              '{}',                   NULL, 'launch',      520, NULL),
 ('v_access',          'vault',    'VIP access and purchase links tested',                                         'kuerstine', -2,  '{}',                              '{}',                   NULL, 'launch',      530, NULL),
 ('v_email',           'vault',    'Confirm the 5 PM PT Vault email is ready',                                     'aira',      -2,  '{email_teaser}',                  '{}',                   NULL, 'launch',      540, NULL),
 ('v_confirm',         'vault',    'VIP launch confirmed',                                                         'kuerstine', -2,  '{v_listing,v_pdp,v_price_inv,v_access,v_email}', '{}',        NULL, 'launch',      550, NULL),
 ('email_thursday','email',    'Send the "dropping tomorrow" email',                                           'aira',      -1,  '{}',                              '{}',                   NULL, 'launch',      560, NULL),

 ('l_publish',         'launch',   'Publish the official listing for public purchase',                             'kuerstine', 0,   '{v_confirm}',                     '{}',                   NULL, 'launch',      600, NULL),
 ('l_notify',          'launch',   'Transfer Notify Me signups and trigger the notifications',                     'kuerstine', 0,   '{l_publish}',                     '{restock}',            NULL, 'launch',      610, NULL),
 ('l_placeholder',     'launch',   'Retire the placeholder; verify redirects and links',                           'kuerstine', 0,   '{l_notify}',                      '{restock}',            NULL, 'launch',      620, NULL),
 ('l_merch',           'launch',   'Update website merchandising and badges per the Shopify SOP',                  'kuerstine', 0,   '{l_publish}',                     '{}',                   NULL, 'launch',      630, NULL),
 ('l_email',           'launch',   'Confirm and send the "just dropped" email',                                    'aira',      0,   '{l_publish}',                     '{}',                   NULL, 'launch',      640, NULL),
 ('l_ads',             'launch',   'Confirm ads are running (when applicable)',                                    'ryanne',    0,   '{ads_creative}',                  '{}',                   NULL, 'launch',      650, NULL),
 ('l_social',          'launch',   'Publish the planned organic social and confirm the website launch',           'kuerstine', 0,   '{l_publish}',                     '{}',                   NULL, 'launch',      660, NULL),

 ('post_followup',     'post',     'Post-launch update: fulfillment footage, customer reactions and UGC; tease the next drop', 'kuerstine', 2, '{l_publish}',           '{}',                   NULL, 'launch',      700, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── 3. Drops (one per DTC product) ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drops (
  id                       uuid primary key default gen_random_uuid(),
  dtc_product_id           uuid not null unique references dtc_products(id) on delete cascade,
  drop_type                text not null default 'new_product' check (drop_type in ('new_product','colorway','restock','dropship')),
  launch_date              date not null,                         -- public launch (Friday)
  vault_date               date,                                  -- Wednesday Vault early access (defaults to launch - 2)
  inventory_eta            date,                                  -- when sellable stock is expected (pre-orders)
  stock_mode               text not null default 'in_stock' check (stock_mode in ('in_stock','preorder')),
  phase                    text not null default 'brief' check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  ai_photo_in_use          boolean not null default false,
  link_product_info        text,
  link_walkthrough         text,
  link_shot_list           text,
  link_photos              text,
  link_shopify_official    text,
  link_shopify_placeholder text,
  link_sop                 text,
  link_campaign            text,
  notes                    text,
  created_by               text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── 4. Tasks of a drop ──────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drop_tasks (
  id             uuid primary key default gen_random_uuid(),
  drop_id        uuid not null references drops(id) on delete cascade,
  template_key   text,
  phase          text not null check (phase in ('brief','assets','listing','creative','email','vault','launch','post')),
  title          text not null,
  owner_role     text not null references team_roles(role),
  due_date       date,
  due_locked     boolean not null default false,        -- set by hand: moving the launch date does not touch it
  prev_due_date  date,
  due_changed_at timestamptz,
  status         text not null default 'not_started' check (status in ('not_started','in_progress','complete','na')),
  depends_on     text[] not null default '{}',
  blocker_group  text,
  workaround     text,                                   -- set when the task moved on with a fallback (e.g. temporary AI photos)
  is_replacement boolean not null default false,
  note           text,
  link           text,
  sort           integer not null default 0,
  completed_at   timestamptz,
  completed_by   text,
  created_at     timestamptz not null default now()
);
CREATE UNIQUE INDEX IF NOT EXISTS drop_tasks_drop_template_uq ON drop_tasks (drop_id, template_key) WHERE template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS drop_tasks_drop_idx ON drop_tasks (drop_id);

-- ─── 5. Activity (date changes, workarounds, pre-order conversions) shown to the affected owners ─────────
CREATE TABLE IF NOT EXISTS drop_events (
  id          uuid primary key default gen_random_uuid(),
  drop_id     uuid references drops(id) on delete cascade,
  task_id     uuid,
  kind        text not null,                -- created | date_changed | status | workaround | preorder | phase | note
  message     text not null,
  roles       text[] not null default '{}', -- owner roles affected (empty = everyone)
  created_by  text,
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS drop_events_created_idx ON drop_events (created_at DESC);

-- ─── 6. Row level security + realtime ────────────────────────────────────────────────────────────────────
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['team_roles','drop_task_templates','drops','drop_tasks','drop_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s read" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s insert" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s update" ON %1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s delete" ON %1$I', t);
    EXECUTE format('CREATE POLICY "%1$s read"   ON %1$I FOR SELECT TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s insert" ON %1$I FOR INSERT TO authenticated WITH CHECK (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s update" ON %1$I FOR UPDATE TO authenticated USING (is_hvi_user())', t);
    EXECUTE format('CREATE POLICY "%1$s delete" ON %1$I FOR DELETE TO authenticated USING (is_hvi_user())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['drops','drop_tasks','drop_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;

SELECT (SELECT count(*) FROM team_roles) AS roles, (SELECT count(*) FROM drop_task_templates) AS templates;
