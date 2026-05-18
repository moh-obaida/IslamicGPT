# Selected Tafsir import (reviewed only)

Never full-import Tafsir until each ayah edition is reviewed and attribution is verified.

## Safety rules

- Always run `--dry-run` first.
- Never execute if the row count is unexpectedly large.
- Use `--editions` to limit to reviewed editions only.
- Do not approve or verify unreviewed content.

## Dry-run (Tafsir Muyassar selected set)

```bash
node scripts/import-tafsir-api-to-supabase.js \
  data/imports/tafsir-api \
  --dry-run \
  --editions=ar-tafsir-muyassar \
  --only "1:1,1:2,1:3,1:4,1:5,1:6,1:7,2:255" \
  --approved-for-answers \
  --verified-by-admin
```

## Execute (after dry-run review)

```bash
node scripts/import-tafsir-api-to-supabase.js \
  data/imports/tafsir-api \
  --execute \
  --editions=ar-tafsir-muyassar \
  --only "1:1,1:2,1:3,1:4,1:5,1:6,1:7,2:255" \
  --approved-for-answers \
  --verified-by-admin
```

## Future: larger Tafsir import

Larger Tafsir import is **future only**. Prerequisites:

- Selected Tafsir direct lookups work with deterministic templates
- Tafsir source cards distinct from Quran
- Importer performance acceptable on target hardware

## Future: full-surah Tafsir answers

For queries like `تفسير سورة الفاتحة`, eventually aggregate all approved Tafsir rows for that surah in ayah order with edition attribution and `llmCalled=false`.
