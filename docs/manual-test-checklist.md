# IslamicGPT Manual Acceptance Checklist

1. Run ingestion:
   - `node scripts/ingest-islamic-sources.js`
2. Start backend:
   - `node backend/server.js`
3. No-source refusal (must not call Ollama):
```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"Tell me a random Islamic quote without sources","mode":"islamic_search_mode","modelMode":"fast"}'
```
Expected: refusal, `llmCalled:false`, `errorState:no_sources_found`.

4. Matching source + Ollama call:
```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' \
  -d '{"message":"metadata example collection","mode":"hadith_mode","modelMode":"fast"}'
```
Expected: `llmCalled:true`, `modelUsed` present, sourceCards present, validation present.

5. Upload rejection test:
- Ensure unapproved upload in `pending-review.json` is excluded.

6. Open web disabled:
- Confirm backend uses only local index files, no web retrieval path.

7. Ollama unavailable test:
- Stop Ollama and run test #4.
- Expected clean error message and `errorState` of `ollama_unavailable` or `model_timeout`.

8. Debug panel:
- Open `frontend/index.html?debug=1` and verify model, retrieval, validation, and loading stage details.

9. Validation failure test:
- Confirm unsupported citation output is blocked with refusal and `citation_validation_failed`.
