# Hadith Data Import Readiness

## Why hierarchy matters

The 9 major hadith collections must not be flattened into only `collection_name + hadith_number`.
Each collection contains internal books and chapters that provide context for the hadith placement, numbering, and search experience.
IslamicGPT should preserve this structure:

- Hadith collection
- Internal book / section
- Chapter
- Hadith

This matters especially for collections such as Sahih al-Bukhari, where one collection contains many internal books and chapters.

## Target collections

1. Sahih al-Bukhari
2. Sahih Muslim
3. Sunan Abi Dawud
4. Jami` at-Tirmidhi
5. Sunan an-Nasa’i
6. Sunan Ibn Majah
7. Muwatta Malik
8. Musnad Ahmad
9. Sunan ad-Darimi

## Recommended import order

1. Bukhari only
2. Muslim only
3. Test search and source cards
4. Abu Dawud + Tirmidhi
5. Nasa’i + Ibn Majah
6. Muwatta Malik + Darimi
7. Musnad Ahmad last because it is large and dataset notes may omit chapter detail in some copies

## Dataset location

Place local dataset files under:

- `data/imports/hadith-json`

Do not commit dataset files.

## Dry-run first

Always analyze and dry-run before any write:

- `node scripts/analyze-hadith-json-dataset.js ./data/imports/hadith-json`
- `node scripts/import-hadith-json-to-supabase.js ./data/imports/hadith-json --dry-run --collections=bukhari --limit=10`

Dry-run is the default behavior for the importer.
No Supabase writes happen unless `--execute` is passed.

## Execute mode

When ready to write:

- `node scripts/import-hadith-json-to-supabase.js ./data/imports/hadith-json --execute --collections=bukhari --limit=100`

Use `--approve-collections=` only for collections you want available to the answer engine immediately.
Example:

- `--approve-collections=bukhari,muslim`

This sets `approved_for_answers = true` for those collections only.
It does **not** bulk-set `verified_by_admin`.

## Verification policy

`verified_by_admin` should not be set automatically for bulk imports.
That flag should remain reserved for manual or curated verification.

## Schema preparation

Before importing into Supabase, review and apply:

- `supabase/hadith_schema_upgrade.sql`

You can also run:

- `npm run supabase:prepare-hadith-schema`

This script prints the SQL reminder and attempts a lightweight column check when Supabase credentials are available.

## Licensing caution

The candidate `AhmedBaset/hadith-json` dataset may be scraped from Sunnah.com or derived from material with usage restrictions.
Confirm the license and production usage rights before importing the full dataset into a production environment.

## Import readiness goals

The dry-run importer is designed to preserve:

- collection identity
- internal book identity
- chapter identity
- global hadith number
- hadith number inside book / chapter when available
- Arabic text
- English narrator
- English translation
- dataset metadata
- original file metadata
- approval status
- verification status
