# Selected Quran import (reviewed only)

Never full-import Quran until each ayah is reviewed, attribution is verified, and templates/source cards are stable.

## Safety rules

- Always run `--dry-run` first.
- Never execute if the row count is unexpectedly large.
- Do not approve or verify unreviewed content.
- Keep `approved_for_answers=true` and `verified_by_admin=true` only after human review.

## Dry-run

```bash
node scripts/import-quran-json-to-supabase.js \
  data/imports/quran-json \
  --dry-run \
  --only "1:1,1:2,1:3,1:4,1:5,1:6,1:7,2:152,2:255,112:1,112:2,112:3,112:4,113:1,113:2,113:3,113:4,113:5,114:1,114:2,114:3,114:4,114:5,114:6" \
  --approved-for-answers \
  --verified-by-admin
```

## Execute (after dry-run review)

```bash
node scripts/import-quran-json-to-supabase.js \
  data/imports/quran-json \
  --execute \
  --only "1:1,1:2,1:3,1:4,1:5,1:6,1:7,2:152,2:255,112:1,112:2,112:3,112:4,113:1,113:2,113:3,113:4,113:5,114:1,114:2,114:3,114:4,114:5,114:6" \
  --approved-for-answers \
  --verified-by-admin
```

## Future: full Quran import

Full Quran import is **future only**. Prerequisites:

- Deterministic Quran templates polished (Arabic/English labels, attribution)
- Source cards complete
- Importer `--only` / `--surah` filtering reliable in tests
- Selected import stable in production

## Future: full-surah answers

For queries like `سورة الإخلاص`, eventually aggregate all approved Quran rows for that surah in order with Arabic text, translation, attribution, `llmCalled=false`, and no invented ayahs.
