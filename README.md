# IslamicGPT MVP

IslamicGPT is a local-first Islamic knowledge assistant runtime with strict source controls.

## Current runtime capabilities
- `POST /api/chat` backend runtime endpoint.
- Local LLM generation through Ollama `POST /api/generate`.
- Model routing: `auto | fast | strong`.
- Metadata-based source cards (Quran/Hadith/Scholar/Document).
- Source ingestion script for local approved JSON records.
- Frontend runtime UI (`frontend/index.html`).
- Test-source protection (`ALLOW_TEST_SOURCES=false` by default).

## Model setup
- `ollama pull llama3.1:8b`
- `ollama pull qwen2.5:14b`
- Optional alternate Llama fast model:
  - `OLLAMA_FAST_MODEL=your-llama-7b-model-name`

## Run
1. `cp .env.example .env`
2. `node scripts/ingest-islamic-sources.js`
3. `node backend/server.js`
4. Open `frontend/index.html` (or `frontend/index.html?debug=1`)

## Dev test-source mode (metadata-only records)
```bash
ALLOW_TEST_SOURCES=true node scripts/ingest-islamic-sources.js
ALLOW_TEST_SOURCES=true node backend/server.js
```

## Curl checks
```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"metadata example collection","mode":"hadith_mode","modelMode":"fast"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"compare scholar opinions","mode":"compare_opinions_mode","modelMode":"auto"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"zzzxxyy unmatched token","mode":"islamic_search_mode","modelMode":"fast"}'
```
