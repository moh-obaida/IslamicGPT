# IslamicGPT Manual Acceptance Checklist

## Normal mode (default)
1. `ALLOW_TEST_SOURCES=false node scripts/ingest-islamic-sources.js`
2. `ALLOW_TEST_SOURCES=false node backend/server.js`
3. No-source query must return refusal with `llmCalled:false`.
4. Auto mode simple query should resolve to fast.
5. Compare opinions mode should resolve to strong.
6. Legacy `deep` request should map to strong.
7. Confirm open web remains disabled.
8. Confirm unapproved uploads remain rejected.

## Metadata-only development mode
1. `ALLOW_TEST_SOURCES=true node scripts/ingest-islamic-sources.js`
2. `ALLOW_TEST_SOURCES=true node backend/server.js`
3. Confirm test records can be retrieved only in this mode.
