-- Axon Phase 5 — revision snapshots (design handoff §7)
-- Run once in the Supabase SQL editor.

create table if not exists logi_revisions (
  id uuid primary key default gen_random_uuid(),
  assembly_id uuid references logi_assemblies(id) on delete cascade,
  label text,
  note text,
  created_at timestamptz default now(),
  created_by text,
  snapshot jsonb   -- frozen { v, taken_at, nodes:[...], links:[...] }
);

create index if not exists logi_revisions_assembly_idx
  on logi_revisions (assembly_id, created_at desc);

-- Match the access model of the other logi_* tables. If they use RLS,
-- mirror those policies here; the anon-key setup below matches an open dev DB:
alter table logi_revisions enable row level security;
create policy "logi_revisions_read"  on logi_revisions for select using (true);
create policy "logi_revisions_write" on logi_revisions for insert with check (true);
create policy "logi_revisions_delete" on logi_revisions for delete using (true);
