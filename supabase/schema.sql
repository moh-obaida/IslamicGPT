-- IslamicGPT approved-source schema
-- Frontend clients must never use the service role key.
-- This table is intended for backend-only writes via the VM backend.
-- RLS can be enabled later with explicit backend/service policies.

create table if not exists public.islamic_sources (
  id text primary key,
  source_type text not null,
  title text,
  collection_name text,
  book_name text,
  chapter_name text,
  hadith_number text,
  surah integer,
  ayah integer,
  arabic_text text,
  translation_text text,
  scholar_name text,
  fatwa_reference text,
  topic_tags text[] default '{}'::text[],
  approved_for_answers boolean not null default true,
  verified_by_admin boolean not null default false,
  admin_managed boolean not null default false,
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists islamic_sources_source_type_idx on public.islamic_sources (source_type);
create index if not exists islamic_sources_approved_idx on public.islamic_sources (approved_for_answers);
create index if not exists islamic_sources_verified_idx on public.islamic_sources (verified_by_admin);
create index if not exists islamic_sources_admin_managed_idx on public.islamic_sources (admin_managed);
create index if not exists islamic_sources_updated_at_idx on public.islamic_sources (updated_at desc);
create index if not exists islamic_sources_topic_tags_gin_idx on public.islamic_sources using gin (topic_tags);
create index if not exists islamic_sources_metadata_gin_idx on public.islamic_sources using gin (metadata);

create or replace function public.set_islamic_sources_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists islamic_sources_set_updated_at on public.islamic_sources;
create trigger islamic_sources_set_updated_at
before update on public.islamic_sources
for each row
execute function public.set_islamic_sources_updated_at();
