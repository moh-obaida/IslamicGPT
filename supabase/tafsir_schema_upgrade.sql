-- Safe upgrade for Tafsir import support.
-- Run this in the Supabase SQL Editor.

alter table public.islamic_sources add column if not exists tafsir_edition_slug text;
alter table public.islamic_sources add column if not exists tafsir_book_name text;
alter table public.islamic_sources add column if not exists tafsir_book_name_ar text;
alter table public.islamic_sources add column if not exists tafsir_book_name_en text;
alter table public.islamic_sources add column if not exists tafsir_author text;
alter table public.islamic_sources add column if not exists tafsir_author_ar text;
alter table public.islamic_sources add column if not exists tafsir_author_en text;
alter table public.islamic_sources add column if not exists tafsir_language text;

alter table public.islamic_sources add column if not exists ayah_start integer;
alter table public.islamic_sources add column if not exists ayah_end integer;
alter table public.islamic_sources add column if not exists ayah_range text;

alter table public.islamic_sources add column if not exists explanation_text text;

alter table public.islamic_sources add column if not exists repo_license text;
alter table public.islamic_sources add column if not exists dataset_url text;
alter table public.islamic_sources add column if not exists attribution_text text;
alter table public.islamic_sources add column if not exists attribution_url text;
alter table public.islamic_sources add column if not exists requires_attribution boolean default false;

create index if not exists islamic_sources_source_type_idx on public.islamic_sources (source_type);
create index if not exists islamic_sources_tafsir_edition_slug_idx on public.islamic_sources (tafsir_edition_slug);
create index if not exists islamic_sources_tafsir_book_name_idx on public.islamic_sources (tafsir_book_name);
create index if not exists islamic_sources_tafsir_author_idx on public.islamic_sources (tafsir_author);
create index if not exists islamic_sources_tafsir_language_idx on public.islamic_sources (tafsir_language);
create index if not exists islamic_sources_surah_idx on public.islamic_sources (surah);
create index if not exists islamic_sources_ayah_idx on public.islamic_sources (ayah);
create index if not exists islamic_sources_surah_number_idx on public.islamic_sources (surah_number);
create index if not exists islamic_sources_ayah_number_idx on public.islamic_sources (ayah_number);
create index if not exists islamic_sources_ayah_start_idx on public.islamic_sources (ayah_start);
create index if not exists islamic_sources_ayah_end_idx on public.islamic_sources (ayah_end);
create index if not exists islamic_sources_approved_idx on public.islamic_sources (approved_for_answers);
create index if not exists islamic_sources_verified_idx on public.islamic_sources (verified_by_admin);
create index if not exists islamic_sources_dataset_name_idx on public.islamic_sources (dataset_name);
create index if not exists islamic_sources_license_status_idx on public.islamic_sources (license_status);

create index if not exists islamic_sources_tafsir_search_tsv_idx on public.islamic_sources using gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(tafsir_book_name, '') || ' ' ||
    coalesce(tafsir_author, '') || ' ' ||
    coalesce(arabic_text, '') || ' ' ||
    coalesce(translation_text, '') || ' ' ||
    coalesce(explanation_text, '') || ' ' ||
    coalesce(surah_name_en, '') || ' ' ||
    coalesce(surah_name_ar, '')
  )
);
