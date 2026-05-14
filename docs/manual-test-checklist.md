# IslamicGPT Manual Acceptance Checklist

1. `node scripts/ingest-islamic-sources.js`
2. `node backend/server.js`
3. By default test sources are blocked (`ALLOW_TEST_SOURCES=false`).
4. Set `ALLOW_TEST_SOURCES=true` only for metadata-only development testing.
5. No-source query must return refusal with `llmCalled:false`.
6. Auto mode simple query should resolve to fast.
7. Compare opinions mode should resolve to strong.
8. Legacy `deep` request should map to strong.
9. Confirm open web remains disabled.
10. Confirm unapproved uploads remain rejected.
