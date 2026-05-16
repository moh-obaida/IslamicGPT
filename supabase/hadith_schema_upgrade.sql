-- Safe upgrade for hadith collection hierarchy support.
-- Run this in the Supabase SQL Editor.

alter table public.islamic_sources add column if not exists collection_slug text;
alter table public.islamic_sources add column if not exists collection_name_ar text;
alter table public.islamic_sources add column if not exists collection_name_en text;
alter table public.islamic_sources add column if not exists collection_author_ar text;
alter table public.islamic_sources add column if not exists collection_author_en text;

alter table public.islamic_sources add column if not exists book_id integer;
alter table public.islamic_sources add column if not exists book_number text;
alter table public.islamic_sources add column if not exists book_name_ar text;
alter table public.islamic_sources add column if not exists book_name_en text;

alter table public.islamic_sources add column if not exists chapter_id integer;
alter table public.islamic_sources add column if not exists chapter_number text;
alter table public.islamic_sources add column if not exists chapter_name_ar text;
alter table public.islamic_sources add column if not exists chapter_name_en text;
alter table public.islamic_sources add column if not exists chapter_intro_ar text;
alter table public.islamic_sources add column if not exists chapter_intro_en text;

alter table public.islamic_sources add column if not exists hadith_number_global text;
alter table public.islamic_sources add column if not exists hadith_number_in_book text;
alter table public.islamic_sources add column if not exists hadith_number_in_chapter text;

alter table public.islamic_sources add column if not exists english_narrator text;
alter table public.islamic_sources add column if not exists grade text;
alter table public.islamic_sources add column if not exists translator text;

alter table public.islamic_sources add column if not exists dataset_name text;
alter table public.islamic_sources add column if not exists dataset_version text;
alter table public.islamic_sources add column if not exists original_source text;
alter table public.islamic_sources add column if not exists import_batch_id text;

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
create index if not exists islamic_sources_dataset_name_idx on public.islamic_sources (dataset_name);
create index if not exists islamic_sources_import_batch_idx on public.islamic_sources (import_batch_id);
create index if not exists islamic_sources_topic_tags_gin_idx on public.islamic_sources using gin (topic_tags);
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
