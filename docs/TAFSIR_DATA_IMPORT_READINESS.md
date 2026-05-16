# Tafsir Data Import Readiness

## Separate pipeline

The Tafsir importer is separate from Quran and Hadith importers.
Tafsir records explain exact Quran references:

- Tafsir edition / book
- Surah
- Ayah or ayah range
- Explanation text

Do not treat Tafsir like Hadith.

## Dataset candidate

The first local dataset candidate is `spa5k/tafsir_api`.
Place local dataset files under:

- `data/imports/tafsir-api`

Do not commit dataset files.
Do not scrape websites.

## Licensing and source metadata

The repository license is MIT.
Some Tafsir content is sourced from Quran.com and Altafsir.com, so each row stores `original_source`, `source_url`, `repo_license`, `dataset_url`, attribution fields, and license review metadata.

Default import metadata:

- `dataset_name = spa5k/tafsir_api`
- `dataset_url = https://github.com/spa5k/tafsir_api`
- `repo_license = MIT`
- `license_status = MIT-repo-content-source-needs-review`
- `requires_attribution = true`
- `approved_for_answers = false`
- `verified_by_admin = false`

## Recommended first editions

Do not mass import all 27 editions immediately.
Start with reviewed dry-runs for:

1. `en-tafisr-ibn-kathir`
2. `en-al-jalalayn`
3. `ar-tafsir-ibn-kathir`
4. `ar-tafsir-muyassar`
5. `ar-tafseer-al-saddi`

Preserve edition slugs exactly as the dataset uses them.

## Schema preparation

Before importing, review and apply:

- `supabase/tafsir_schema_upgrade.sql`

You can also run:

- `npm run supabase:prepare-tafsir-schema`

The script prints manual SQL instructions and attempts a lightweight column check when Supabase credentials are available.

## Analyze first

Run analysis before any import:

- `node scripts/analyze-tafsir-api-dataset.js ./data/imports/tafsir-api`
- `npm run tafsir:analyze -- ./data/imports/tafsir-api`

The analyzer does not require Supabase credentials and does not modify files.

## Dry-run first

Dry-run is the default importer behavior:

- `node scripts/import-tafsir-api-to-supabase.js ./data/imports/tafsir-api --dry-run --editions=en-tafisr-ibn-kathir --limit=10`
- `npm run tafsir:import -- ./data/imports/tafsir-api --dry-run --editions=en-tafisr-ibn-kathir --limit=10`

No Supabase writes happen unless `--execute` is passed.

## Execute mode

When ready to write reviewed rows:

- `node scripts/import-tafsir-api-to-supabase.js ./data/imports/tafsir-api --execute --approve-editions=en-tafisr-ibn-kathir --limit=100`

Use `--approve-editions` only after content/source review.
Use `--verify-editions` only after manual/admin review.
Default imported rows are not approved for answers and are not verified by admin.
