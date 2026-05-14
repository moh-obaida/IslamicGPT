# IslamicGPT

Reliable Islamic answers from Quran, Sunnah, and approved sources.

## Local setup

1. Install Ollama:
   - `curl -fsSL https://ollama.com/install.sh | sh`
2. Pull models:
   - `ollama pull qwen2.5:7b`
   - `ollama pull llama3.1:8b`
   - `ollama pull qwen2.5:14b`
3. Configure env:
   - `cp .env.example .env`
4. Build approved source index:
   - `node scripts/ingest-islamic-sources.js`
5. Start backend:
   - `node backend/server.js`
6. Open UI:
   - `frontend/index.html` (or `frontend/index.html?debug=1`)

## API test

```bash
curl -s http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"metadata example collection","mode":"hadith_mode","modelMode":"fast"}'
```

No-source test:

```bash
curl -s http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"random unmatched Islamic claim","mode":"islamic_search_mode","modelMode":"fast"}'
```

Ollama unavailable test:
- Stop Ollama and run the API test again.
- Expected: `IslamicGPT could not reach the local AI model. Please check that Ollama is running.`
