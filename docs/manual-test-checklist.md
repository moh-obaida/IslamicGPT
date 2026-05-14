# IslamicGPT Manual Acceptance Checklist

## Setup
1. Run ingestion: `node scripts/ingest-islamic-sources.js`
2. Start backend: `node backend/server.js`
3. Open `frontend/index.html` (append `?debug=1` for source debug panel).

## UI checks
1. Verify Islamic modes dropdown appears.
2. Verify small print disclaimer is visible.
3. Send a question and verify loading stages:
   - Searching approved Islamic sources
   - Checking Quran and hadith references
   - Validating citations
   - Preparing answer
4. Verify source cards show copy citation buttons.

## Retrieval and validation checks
1. Quran mode with no source match:
   - Ask unrelated text in Quran mode.
   - Expect refusal + `errorState: no_sources_found`.
2. Hadith mode with no hadith number:
   - Use source with missing hadith number and no `hadith_number_unavailable` flag.
   - Expect ingestion warning + record rejected or citation warning.
3. Hadith mode with `hadith_number_unavailable=true`:
   - Ask query matching hadith metadata record.
   - Expect hadith card with "Hadith number not available in this source.".
4. Scholar query without approved scholar source:
   - Ask Ibn Baz question without approved scholar source.
   - Expect refusal.
5. Uploaded unapproved file rejected:
   - Ensure `pending-review.json` remains unapproved.
   - Verify unapproved upload not returned in sources.
6. Approved document allowed:
   - Query that matches `approved-testing-document.json` metadata.
   - Expect Approved Document source card.
7. Arabic query normalization:
   - Query variants like "القران" vs "القرآن" and compare behavior.
8. English case-insensitive query:
   - Query mixed-case keyword and verify match.
9. Open web disabled:
   - Confirm results are only from local indexed files and no external URL fetch behavior exists.

## API checks (curl)
```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"unmatched query for quran mode","mode":"quran_mode"}'
```

```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"metadata example collection","mode":"hadith_mode"}'
```

```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"approved testing upload","mode":"islamic_search_mode"}'
```

```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"ابن باز","mode":"compare_opinions_mode"}'
```
