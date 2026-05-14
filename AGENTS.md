# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

IslamicGPT is a local-first Islamic knowledge assistant with zero npm dependencies. The runtime is plain Node.js (v18+ for native `fetch`); there is no build step, no bundler, and no TypeScript compilation.

### Available npm scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm run dev` | `node backend/server.js` | Start backend API on port 3001 |
| `npm start` | `node backend/server.js` | Same as dev |
| `npm run ingest` | `node scripts/ingest-islamic-sources.js` | Compile source index |

**There are no `check`, `test`, or `lint` scripts.** The repo has no eslint, jest, or any testing framework configured.

### Starting the backend

```bash
cp .env.example .env                                        # one-time
ALLOW_TEST_SOURCES=true node scripts/ingest-islamic-sources.js  # compile test sources
ALLOW_TEST_SOURCES=true node backend/server.js                  # start on :3001
```

Without `ALLOW_TEST_SOURCES=true`, the compiled index is empty (0 records) and every query returns a refusal. Always use this flag for development.

### Serving the frontend

The frontend is a single static HTML file at `frontend/index.html`. Serve it with any static server:

```bash
python3 -m http.server 8080 --directory frontend
```

The frontend talks to the backend at `http://localhost:3001` by default (configurable in Settings > Backend API URL).

### Ollama dependency

Full AI-generated answers require Ollama running at `localhost:11434` with at least one model pulled (`ollama pull llama3.1:8b`). Without Ollama, the backend still starts and responds correctly: source-matched queries return `ollama_unavailable`, and no-match queries return the standard refusal. This is expected behavior for development without a GPU.

### Key files for frontend/admin work

- `frontend/index.html` — entire frontend SPA (HTML + CSS + JS in one file)
- `backend/server.js` — API server entry point
- `backend/src/retrieval.js` — source search/matching logic
- `backend/src/sourceCards.js` — source card formatting for the UI
- `backend/src/modelRouter.js` — model selection logic (fast/strong/auto)
- `scripts/ingest-islamic-sources.js` — source compilation script
- `data/islamic-sources/` — JSON source files organized by type

### Curl test commands

See README.md "Curl checks" section for test commands. Key verification: a matched-source query should reach `built_source_context` in `loadingStagesCompleted`; a no-match query should return `no_sources_found` with `llmCalled: false`.
