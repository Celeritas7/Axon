-- Axon Phase 4 (optional): share node flags via the database
-- instead of per-browser localStorage. Run once in the Supabase
-- SQL editor. phase4.js works without it (localStorage fallback).
alter table logi_nodes add column if not exists flagged boolean default false;
