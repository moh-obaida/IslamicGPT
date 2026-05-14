# IslamicGPT Manual Acceptance Checklist

1. `node scripts/ingest-islamic-sources.js`
2. `node backend/server.js`
3. Fast model test: `modelMode=fast` should return `resolvedModelMode=fast` and use `OLLAMA_FAST_MODEL`.
4. Strong model test: `modelMode=strong` should return `resolvedModelMode=strong` and use `OLLAMA_STRONG_MODEL`.
5. Auto simple test: hadith lookup in `hadith_mode` should resolve to fast.
6. Auto complex test: `compare_opinions_mode` should resolve to strong.
7. Legacy deep test: `modelMode=deep` should resolve to strong.
8. No-source test: unmatched query returns refusal with `llmCalled:false` and `modelUsed:null`.
9. Ensure open web remains disabled and local index only is used.
10. Ensure unapproved uploads are excluded.
