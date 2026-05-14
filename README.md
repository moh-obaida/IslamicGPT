# IslamicGPT MVP

IslamicGPT is a local-first Islamic knowledge assistant runtime with strict source controls.

## Current runtime capabilities
- `POST /api/chat` backend runtime endpoint.
- Local LLM generation through Ollama `POST /api/generate`.
- Model routing: `auto | fast | strong`.
- Metadata-based source cards (Quran/Hadith/Scholar/Document).
- Source ingestion script for local approved JSON records.
- Frontend runtime UI (`frontend/index.html`).
- Vercel static frontend deployment using `vercel.json` with `outputDirectory: "frontend"`.
- Test-source protection (`ALLOW_TEST_SOURCES=false` by default).

## Recommended deployment: Option A

Use Vercel for the frontend and a VM for the backend.

- Vercel serves the static frontend from `frontend/index.html`.
- The VM runs `backend/server.js`, Ollama, local models, and the Islamic source database.
- Do not expect Vercel to run Ollama or the persistent Node backend.
- In the deployed frontend, open **Backend API URL** and set it to your VM backend URL.

The frontend stores this API URL in browser `localStorage` under `ISLAMICGPT_API_URL`.

## Model setup on the VM
```bash
ollama pull llama3.1:8b
ollama pull qwen2.5:14b
```

Optional alternate Llama fast model:
```bash
OLLAMA_FAST_MODEL=your-llama-7b-model-name
```

## Run locally or on the VM
1. `cp .env.example .env`
2. `node scripts/ingest-islamic-sources.js`
3. `node backend/server.js`
4. Open `frontend/index.html` locally, or deploy the frontend to Vercel.

Debug UI:
```text
frontend/index.html?debug=1
```

## Vercel frontend deploy notes

The root `vercel.json` tells Vercel to serve the `frontend/` folder. This avoids the Vercel `NOT_FOUND` issue where Vercel cannot find a root `index.html` or configured output directory.

## Dev test-source mode
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

## Important safety rules
- No approved source = no Islamic answer.
- No source = no Ollama call.
- Ollama is only the writer, not the Islamic authority.
- Open web remains disabled for Islamic answers.
- Unapproved uploads remain rejected.
- Testing-only sources are inactive by default.
