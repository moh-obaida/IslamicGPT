-- IslamicGPT approved-source schema
-- Frontend clients must never use the service role key.
-- This table is intended for backend-only writes via the VM backend.
-- RLS can be enabled later with explicit backend/service policies.

create table if not exists public.islamic_sources (
  id text primary key,
  source_type text not null,
  title text,
  collection_slug text,
  collection_name text,
  collection_name_ar text,
  collection_name_en text,
  collection_author_ar text,
  collection_author_en text,
  book_id integer,
  book_number text,
  book_name text,
  book_name_ar text,
  book_name_en text,
  chapter_id integer,
  chapter_number text,
  chapter_name text,
  chapter_name_ar text,
  chapter_name_en text,
  chapter_intro_ar text,
  chapter_intro_en text,
  hadith_number text,
  hadith_number_global text,
  hadith_number_in_book text,
  hadith_number_in_chapter text,
  surah integer,
  ayah integer,
  arabic_text text,
  translation_text text,
  english_narrator text,
  scholar_name text,
  fatwa_reference text,
  grade text,
  translator text,
  dataset_name text,
  dataset_version text,
  original_source text,
  import_batch_id text,
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
create index if not exists islamic_sources_collection_slug_idx on public.islamic_sources (collection_slug);
create index if not exists islamic_sources_collection_name_idx on public.islamic_sources (collection_name);
create index if not exists islamic_sources_book_id_idx on public.islamic_sources (book_id);
create index if not exists islamic_sources_chapter_id_idx on public.islamic_sources (chapter_id);
create index if not exists islamic_sources_hadith_number_idx on public.islamic_sources (hadith_number);
create index if not exists islamic_sources_hadith_number_global_idx on public.islamic_sources (hadith_number_global);
create index if not exists islamic_sources_hadith_number_in_book_idx on public.islamic_sources (hadith_number_in_book);
create index if not exists islamic_sources_approved_idx on public.islamic_sources (approved_for_answers);
create index if not exists islamic_sources_verified_idx on public.islamic_sources (verified_by_admin);
create index if not exists islamic_sources_admin_managed_idx on public.islamic_sources (admin_managed);
create index if not exists islamic_sources_dataset_name_idx on public.islamic_sources (dataset_name);
create index if not exists islamic_sources_import_batch_idx on public.islamic_sources (import_batch_id);
create index if not exists islamic_sources_updated_at_idx on public.islamic_sources (updated_at desc);
create index if not exists islamic_sources_topic_tags_gin_idx on public.islamic_sources using gin (topic_tags);
create index if not exists islamic_sources_metadata_gin_idx on public.islamic_sources using gin (metadata);
create index if not exists islamic_sources_search_tsv_idx on public.islamic_sources using gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(collection_name, '') || ' ' ||
    coalesce(collection_name_ar, '') || ' ' ||
    coalesce(collection_name_en, '') || ' ' ||
    coalesce(book_name, '') || ' ' ||
    coalesce(book_name_ar, '') || ' ' ||
    coalesce(book_name_en, '') || ' ' ||
    coalesce(chapter_name, '') || ' ' ||
    coalesce(chapter_name_ar, '') || ' ' ||
    coalesce(chapter_name_en, '') || ' ' ||
    coalesce(arabic_text, '') || ' ' ||
    coalesce(translation_text, '') || ' ' ||
    coalesce(english_narrator, '')
  )
);

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
