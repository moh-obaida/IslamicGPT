-- Safe upgrade for generic Scholar / Fatwa / Book source support.
-- Run this in the Supabase SQL Editor.

alter table public.islamic_sources add column if not exists source_kind text;
alter table public.islamic_sources add column if not exists work_type text;

alter table public.islamic_sources add column if not exists scholar_slug text;
alter table public.islamic_sources add column if not exists scholar_name_ar text;
alter table public.islamic_sources add column if not exists scholar_name_en text;
alter table public.islamic_sources add column if not exists scholar_full_name text;
alter table public.islamic_sources add column if not exists scholar_death_year integer;
alter table public.islamic_sources add column if not exists madhhab text;
alter table public.islamic_sources add column if not exists creed_school text;

alter table public.islamic_sources add column if not exists work_slug text;
alter table public.islamic_sources add column if not exists work_title text;
alter table public.islamic_sources add column if not exists work_title_ar text;
alter table public.islamic_sources add column if not exists work_title_en text;
alter table public.islamic_sources add column if not exists work_author text;
alter table public.islamic_sources add column if not exists work_language text;
alter table public.islamic_sources add column if not exists collection_title text;
alter table public.islamic_sources add column if not exists website_name text;

alter table public.islamic_sources add column if not exists volume text;
alter table public.islamic_sources add column if not exists page_range text;
alter table public.islamic_sources add column if not exists chapter_title text;
alter table public.islamic_sources add column if not exists section_title text;
alter table public.islamic_sources add column if not exists fatwa_number text;
alter table public.islamic_sources add column if not exists question_number text;
alter table public.islamic_sources add column if not exists lecture_title text;
alter table public.islamic_sources add column if not exists lecture_date text;
alter table public.islamic_sources add column if not exists timestamp_start text;
alter table public.islamic_sources add column if not exists timestamp_end text;

alter table public.islamic_sources add column if not exists question_text text;
alter table public.islamic_sources add column if not exists answer_text text;
alter table public.islamic_sources add column if not exists summary_text text;
alter table public.islamic_sources add column if not exists quote_text text;

alter table public.islamic_sources add column if not exists language text;
alter table public.islamic_sources add column if not exists translation_source text;

alter table public.islamic_sources add column if not exists publisher text;
alter table public.islamic_sources add column if not exists edition text;
alter table public.islamic_sources add column if not exists source_usage_notes text;
alter table public.islamic_sources add column if not exists admin_review_status text;
alter table public.islamic_sources add column if not exists review_notes text;
alter table public.islamic_sources add column if not exists reviewed_by text;
alter table public.islamic_sources add column if not exists reviewed_at timestamptz;

create index if not exists islamic_sources_source_type_idx on public.islamic_sources (source_type);
create index if not exists islamic_sources_source_kind_idx on public.islamic_sources (source_kind);
create index if not exists islamic_sources_work_type_idx on public.islamic_sources (work_type);
create index if not exists islamic_sources_scholar_slug_idx on public.islamic_sources (scholar_slug);
create index if not exists islamic_sources_scholar_name_en_idx on public.islamic_sources (scholar_name_en);
create index if not exists islamic_sources_scholar_name_ar_idx on public.islamic_sources (scholar_name_ar);
create index if not exists islamic_sources_work_slug_idx on public.islamic_sources (work_slug);
create index if not exists islamic_sources_work_title_idx on public.islamic_sources (work_title);
create index if not exists islamic_sources_fatwa_number_idx on public.islamic_sources (fatwa_number);
create index if not exists islamic_sources_question_number_idx on public.islamic_sources (question_number);
create index if not exists islamic_sources_language_idx on public.islamic_sources (language);
create index if not exists islamic_sources_madhhab_idx on public.islamic_sources (madhhab);
create index if not exists islamic_sources_creed_school_idx on public.islamic_sources (creed_school);
create index if not exists islamic_sources_approved_idx on public.islamic_sources (approved_for_answers);
create index if not exists islamic_sources_verified_idx on public.islamic_sources (verified_by_admin);
create index if not exists islamic_sources_admin_review_status_idx on public.islamic_sources (admin_review_status);
create index if not exists islamic_sources_dataset_name_idx on public.islamic_sources (dataset_name);
create index if not exists islamic_sources_license_status_idx on public.islamic_sources (license_status);

create index if not exists islamic_sources_scholar_search_tsv_idx on public.islamic_sources using gin (
  to_tsvector(
    'simple',
    coalesce(title, '') || ' ' ||
    coalesce(scholar_name_en, '') || ' ' ||
    coalesce(scholar_name_ar, '') || ' ' ||
    coalesce(scholar_full_name, '') || ' ' ||
    coalesce(work_title, '') || ' ' ||
    coalesce(work_title_ar, '') || ' ' ||
    coalesce(work_title_en, '') || ' ' ||
    coalesce(chapter_title, '') || ' ' ||
    coalesce(section_title, '') || ' ' ||
    coalesce(question_text, '') || ' ' ||
    coalesce(answer_text, '') || ' ' ||
    coalesce(arabic_text, '') || ' ' ||
    coalesce(translation_text, '') || ' ' ||
    coalesce(summary_text, '') || ' ' ||
    coalesce(quote_text, '')
  )
);
