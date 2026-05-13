# IslamicGPT

Reliable Islamic answers from Quran, Sunnah, and approved sources.

## Strict Islamic Answer Policy

IslamicGPT follows a strict RAG-first policy for Islamic/religious questions:

1. Classify if a question is Islamic.
2. If Islamic, search **only approved Islamic source storage**.
3. Open web search is disabled for Islamic answers.
4. Build model context from retrieved approved sources only.
5. Instruct the model to answer only from provided source context.
6. If no source is found, return:
   - `I could not find enough reliable evidence in the approved sources.`
7. Validate citations after generation.
8. Block Quran claims without surah/ayah citation metadata.
9. Block hadith claims without collection + hadith number (or explicit unavailable notice).
10. Block scholar claims without approved exact reference metadata.

## Knowledge Source Modes

- `verified_local_sources_only` (default)
- `verified_local_sources_plus_approved_online_apis`
- `admin_review_mode`

## Source Storage Layout

- `data/islamic-sources/quran`
- `data/islamic-sources/hadith`
- `data/islamic-sources/tafsir`
- `data/islamic-sources/scholars`
- `data/islamic-sources/fatwas`
- `data/islamic-sources/books`
- `data/islamic-sources/uploads`
- `data/islamic-sources/indexes`

Uploaded files are pending review by default and are not trusted until approved.

## Run locally

1. `cp .env.example .env`
2. Wire `backend/src/islamicPipeline.ts` into your API route.
3. Ensure your local model call uses `buildIslamicAnswerContext(...)` output as the only Islamic authority context.
