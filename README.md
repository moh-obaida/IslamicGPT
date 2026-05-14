# IslamicGPT

Reliable Islamic answers from Quran, Sunnah, and approved sources.

## Model setup
- Pull models:
  - `ollama pull llama3.1:8b`
  - `ollama pull qwen2.5:14b`
- If using a different Llama 7B model, set:
  - `OLLAMA_FAST_MODEL=your-llama-7b-model-name`

## Run
1. `cp .env.example .env`
2. `node scripts/ingest-islamic-sources.js`
3. `node backend/server.js`
4. Open `frontend/index.html` (debug: `?debug=1`)

## Curl tests
```bash
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"metadata example collection","mode":"hadith_mode","modelMode":"fast"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"metadata example collection","mode":"hadith_mode","modelMode":"strong"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"simple hadith lookup","mode":"hadith_mode","modelMode":"auto"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"compare scholar opinions","mode":"compare_opinions_mode","modelMode":"auto"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"compare scholar opinions","mode":"compare_opinions_mode","modelMode":"deep"}'
curl -s http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"zzzxxyy unmatched token","mode":"islamic_search_mode","modelMode":"fast"}'
```
