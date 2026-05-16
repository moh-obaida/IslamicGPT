# Scholar Source Readiness

Scholar / fatwa / book sources are separate from the Hadith, Quran, and Tafsir import pipelines.

## Review policy

- Scholar sources require stronger review than Quran, Hadith, or Tafsir rows.
- No source reference means do not verify the row.
- No book/page/fatwa URL means do not mark the row verified.
- Default imports are `approved_for_answers=false` and `verified_by_admin=false`.
- Sensitive fiqh answers should later require verified scholar/fatwa sources before answer use.

## Import order

1. Curated JSON records come first.
2. Official Bin Baz adapters can be added later.
3. Official Ibn Uthaymeen adapters can be added later.
4. Classical book importers can be added later.

The schema supports official fatwas, books, articles, lectures, letters, curated excerpts, classical fiqh books, and modern fatwa collections.

## Dataset location

Place local dataset files under:

- `data/imports/scholars`

Dataset files must not be committed.

## Example JSON

```json
[
  {
    "id": "fatwa-bin-baz-prayer-001",
    "source_type": "fatwa",
    "source_kind": "official_website_fatwa",
    "work_type": "fatwa",
    "scholar_slug": "bin-baz",
    "scholar_name_ar": "عبد العزيز بن باز",
    "scholar_name_en": "Abd al-Aziz ibn Baz",
    "title": "Example title",
    "question_text": "Question text...",
    "answer_text": "Answer text...",
    "language": "ar",
    "source_url": "https://example.com/source",
    "original_source": "official website",
    "dataset_name": "curated-binbaz",
    "license_status": "source-usage-needs-review",
    "approved_for_answers": false,
    "verified_by_admin": false
  }
]
```

## Book-style records

Book records should preserve `work_title_ar`, `work_title_en`, `work_type=book`, `chapter_title`, `section_title`, `volume`, `page_number`, `page_range`, `publisher`, `edition`, `arabic_text`, `translation_text`, `source_url`, and `original_source`.

## Fatwa-style records

Fatwa records should preserve `fatwa_number`, `question_text`, and `answer_text`.

## Commands

- `npm run supabase:prepare-scholar-schema`
- `npm run scholar:analyze -- ./data/imports/scholars`
- `npm run scholar:import -- ./data/imports/scholars --dry-run --limit=10`
- `npm run scholar:import -- ./data/imports/scholars --execute --limit=20`
