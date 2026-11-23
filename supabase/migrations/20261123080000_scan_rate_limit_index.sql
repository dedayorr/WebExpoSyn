-- WebExpoSyn: index for the shared "this site was scanned recently" limit.
-- Optional but recommended; safe to re-run.
create index if not exists scans_hostname_completed_idx on public.scans (hostname, completed_at desc);
