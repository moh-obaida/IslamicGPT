# Quran Data Import Readiness

## Separate pipeline

The Quran importer is separate from the hadith importer.
Quran records preserve the Quran structure:

- Quran
- Surah
- Ayah
- Arabic text
- English translation

Hadith records continue to use collection, internal book / section, chapter, and hadith hierarchy.

## Dataset candidate

The first local dataset candidate is `risan/quran-json`.
Place local dataset files under:

- `data/imports/quran-json`

Do not commit dataset files.
Do not scrape websites.

## Required content

Each imported ayah should include Arabic Quran text and English translation when available.
The initial metadata defaults are:

- English translation: Saheeh International / Umm Muhammad
- Translation source: Tanzil
- Arabic Quran text source: The Noble Qur'an Encyclopedia
- Quran edition / text style: Uthmani
- License: CC-BY-SA 4.0

Attribution is required.
ShareAlike implications need review before production use.

## Schema preparation

Before importing, review and apply:

- `supabase/quran_schema_upgrade.sql`

You can also run:

- `npm run supabase:prepare-quran-schema`

The script prints manual SQL instructions and attempts a lightweight column check when Supabase credentials are available.

## Analyze first

Run analysis before any import:

- `node scripts/analyze-quran-json-dataset.js ./data/imports/quran-json`
- `npm run quran:analyze -- ./data/imports/quran-json`

The analyzer does not require Supabase credentials and does not modify files.

## Dry-run first

Dry-run is the default importer behavior:

- `node scripts/import-quran-json-to-supabase.js ./data/imports/quran-json --dry-run --limit=10`
- `npm run quran:import -- ./data/imports/quran-json --dry-run --limit=10`

No Supabase writes happen unless `--execute` is passed.

## Execute mode

When ready to write reviewed rows:

- `node scripts/import-quran-json-to-supabase.js ./data/imports/quran-json --execute --limit=100`

Use `--approve` only after review.
Use `--verify` only after manual/admin review.

Default imported rows are not approved for answers and are not verified by admin.
