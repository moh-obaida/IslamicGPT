-- Safe upgrade for Quran ayah import support.
-- Run this in the Supabase SQL Editor.

alter table public.islamic_sources add column if not exists surah_number integer;
alter table public.islamic_sources add column if not exists ayah_number integer;
alter table public.islamic_sources add column if not exists ayah_global_number integer;
alter table public.islamic_sources add column if not exists surah_name_ar text;
alter table public.islamic_sources add column if not exists surah_name_en text;

alter table public.islamic_sources add column if not exists juz integer;
alter table public.islamic_sources add column if not exists hizb text;
alter table public.islamic_sources add column if not exists page_number integer;
alter table public.islamic_sources add column if not exists revelation_place text;

alter table public.islamic_sources add column if not exists translator text;
alter table public.islamic_sources add column if not exists translation_name text;
alter table public.islamic_sources add column if not exists translation_language text;
alter table public.islamic_sources add column if not exists translation_source text;
alter table public.islamic_sources add column if not exists translation_source_url text;

alter table public.islamic_sources add column if not exists quran_text_style text;
alter table public.islamic_sources add column if not exists quran_arabic_source text;
alter table public.islamic_sources add column if not exists quran_edition text;

alter table public.islamic_sources add column if not exists license_status text;
alter table public.islamic_sources add column if not exists attribution_text text;
alter table public.islamic_sources add column if not exists attribution_url text;
alter table public.islamic_sources add column if not exists requires_attribution boolean default false;
alter table public.islamic_sources add column if not exists requires_sharealike_review boolean default false;

alter table public.islamic_sources add column if not exists dataset_url text;

create index if not exists islamic_sources_source_type_idx on public.islamic_sources (source_type);
create index if not exists islamic_sources_surah_idx on public.islamic_sources (surah);
create index if not exists islamic_sources_ayah_idx on public.islamic_sources (ayah);
create index if not exists islamic_sources_surah_number_idx on public.islamic_sources (surah_number);
create index if not exists islamic_sources_ayah_number_idx on public.islamic_sources (ayah_number);
create index if not exists islamic_sources_ayah_global_number_idx on public.islamic_sources (ayah_global_number);
create index if not exists islamic_sources_surah_name_en_idx on public.islamic_sources (surah_name_en);
create index if not exists islamic_sources_surah_name_ar_idx on public.islamic_sources (surah_name_ar);
create index if not exists islamic_sources_translator_idx on public.islamic_sources (translator);
create index if not exists islamic_sources_translation_name_idx on public.islamic_sources (translation_name);
create index if not exists islamic_sources_translation_language_idx on public.islamic_sources (translation_language);
create index if not exists islamic_sources_license_status_idx on public.islamic_sources (license_status);
create index if not exists islamic_sources_approved_idx on public.islamic_sources (approved_for_answers);
create index if not exists islamic_sources_verified_idx on public.islamic_sources (verified_by_admin);
create index if not exists islamic_sources_dataset_name_idx on public.islamic_sources (dataset_name);
create index if not exists islamic_sources_quran_search_tsv_idx on public.islamic_sources using gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(surah_name_en, '') || ' ' ||
    coalesce(surah_name_ar, '') || ' ' ||
    coalesce(arabic_text, '') || ' ' ||
    coalesce(translation_text, '') || ' ' ||
    coalesce(translator, '') || ' ' ||
    coalesce(translation_name, '')
  )
);
