-- HVI CRM — Phase A (production), step 7: score the imported companies and link them to pipeline leads.
-- Run AFTER steps 01–06. Safe to re-run.
SELECT neca_recompute(NULL) AS rows_rescored;
SELECT * FROM neca_crosslink();
SELECT tier, count(*) FROM neca_leads GROUP BY tier ORDER BY tier;
