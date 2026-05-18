# Reviewed scholar / fatwa import workflow

No auto-import of scholar content. Every record must be curated and reviewed by an operator.

## Required fields per record

- Exact title
- Scholar name (Arabic and/or English)
- Question text and/or answer excerpt (from official source only)
- Reference / fatwa number when available
- Official `source_url` when available (do not invent URLs)
- `approved_for_answers=true` only after review
- `verified_by_admin=true` only after review
- English and Arabic topic tags where useful

## Workflow

1. Paste official source text from the institution website.
2. Structure JSON under `data/curated/scholar-reviewed/` (see existing Bin Baz samples).
3. Include exact title, scholar name, question, answer excerpt, reference, and URL.
4. Dry-run import:

```bash
node scripts/import-scholar-json-to-supabase.js \
  data/curated/scholar-reviewed \
  --dry-run \
  --approved-for-answers \
  --verified-by-admin
```

5. Execute only after row count and content review:

```bash
node scripts/import-scholar-json-to-supabase.js \
  data/curated/scholar-reviewed \
  --execute \
  --approved-for-answers \
  --verified-by-admin
```

6. Test Arabic and English direct lookup queries in `/api/chat`.
7. Commit curated reviewed data to version control.

## Future sources policy

New scholars or institutions require operator approval before any import. No open-web Islamic answers. No unreviewed bulk imports.

## Future: admin UI

Admin should eventually view/search Quran/Tafsir/Fatwa rows, approve/unapprove, verify, inspect warnings, and run search tests. Not required for this polish pass.
