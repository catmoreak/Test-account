# CreditAssist AI

CreditAssist AI is a full-stack, AI-powered member support and resolution assistant built for credit unions. This README focuses on quick local setup, key configuration, and deployment notes so reviewers can run and evaluate the PR quickly.

## TL;DR

- Install dependencies at the repo root and for `backend` and `frontend`.
- Configure required environment variables (listed below) in `.env`.
- Run `npm run dev` to start the frontend and backend in development.

## What this project contains

- Member-facing chat UI with optional voice input/output.
- Staff dashboard for reviewing, filtering, and updating cases.
- RAG-powered answer engine (local TF‑IDF retrieval + generator fallback).
- Case store with auto-resolution logic and escalation packets for unresolved issues.

## Quickstart (local)

1. Install Node.js (LTS) and npm.
2. From the repository root install dependencies:

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
```

3. Create a `.env` file in the `backend/` folder (copy from `.env.example` if present) and set the required keys below.

4. Start the app for development:

```powershell
npm run dev
```

5. Open the apps:

- Member UI: http://localhost:5173
- API health: http://localhost:8787/api/health

## Project layout

- frontend/ — React + Vite UI (member + staff dashboards)
- backend/ — Express API, RAG retrieval, intelligence engine, case store
- backend/src/data/knowledgeBase.json — mock knowledge base used for retrieval

Key source files:

- Backend server: [backend/src/server.js](backend/src/server.js)
- RAG engine and connectors: [backend/src/services/ragEngine.js](backend/src/services/ragEngine.js)
- LLM client(s): [backend/src/services/llmClient.js](backend/src/services/llmClient.js)
- Text-to-speech / Speech-to-text: [backend/src/services/textToSpeechClient.js](backend/src/services/textToSpeechClient.js)

## Environment variables

Set these in `backend/.env` or in your deployment environment. Values shown are examples or fallbacks used by the code.

- `MISTRAL_API_KEY` — optional; API key for Mistral or OpenRouter. If unset, the app falls back to RAG-only responses.
- `LLM_PROVIDER` — optional override for the LLM provider (e.g. `mistral`).
- `MISTRAL_MODEL` — model name (default in code if unset).
- `MISTRAL_API_BASE` — base URL for Mistral/OpenRouter endpoints.
- `MISTRAL_TIMEOUT_MS` — request timeout for LLM calls (ms).
- `PINECONE_API_KEY` — optional: used by `embed_data.js` for vector indexing if you choose to persist embeddings.
- `SARVAM_API_KEY` — shared Sarvam API key used by STT and other Sarvam endpoints.
- `SARVAM_TTS_API_KEY` — optional dedicated key for TTS (preferred).
- `SARM_TTS_API` — compatibility alias checked by the backend if `SARVAM_TTS_API_KEY` is not set.
- `SARVAM_TTS_URL` — TTS endpoint (defaults to https://api.sarvam.ai/text-to-speech).
- `SARVAM_TTS_MODEL` — TTS model (e.g. `bulbul:v3`).
- `SARVAM_TTS_SPEAKER` — optional speaker name.
- `SARVAM_TTS_SAMPLE_RATE` — numeric sample rate for generated audio (e.g. 22050).
- `APP_PUBLIC_URL` — frontend public URL used by some headers and callbacks (defaults to http://localhost:5173).
- `DATABASE_URL` — optional PostgreSQL (Neon) connection string; if unset, the backend may use an in-memory fallback for demo.

Example `.env` snippet (backend):

```ini
MISTRAL_API_KEY=sk-...
LLM_PROVIDER=mistral
MISTRAL_MODEL=mistral-small
SARVAM_API_KEY=sk-...
SARVAM_TTS_API_KEY=sk-...
DATABASE_URL=postgresql://user:pass@host/dbname
```

## Running the data embed script

If you want to regenerate embeddings or push them to an index (Pinecone), use:

```powershell
node backend/embed_data.js
```

This script uses `PINECONE_API_KEY` and `MISTRAL_API_KEY` when present.

## API (quick reference)

- `POST /api/member/message` — send a chat message from a member
- `POST /api/member/voice-to-text` — upload audio for speech-to-text
- `POST /api/member/text-to-speech` — request generated audio for a text reply
- `GET /api/staff/cases` — list cases (supports `?status=` filter)
- `GET /api/staff/cases/:id` — get case details
- `PATCH /api/staff/cases/:id/status` — update case status

See route implementations in [backend/src/routes](backend/src/routes) for full request/response shapes.

## Deploying (Render)

This repo includes `render.yaml` for a two-service deployment: API and UI. Basic steps:

1. Push the repo to GitHub.
2. Create services on Render using `render.yaml` or import the repo.
3. Add required environment variables to the Render service settings.

Adjust `render.yaml` API rewrite targets if Render assigns different hostnames.

## Notes for reviewers / maintainers

- The codebase is intentionally compact for rapid review; production hardening (auth, logging, monitoring, rate limits, secrets rotation) is not included in the PR.
- The mock KB in `backend/src/data/knowledgeBase.json` is small by design; replace with a real KB for more realistic retrieval results.

## Next steps / suggestions

- Add a `.env.example` in `backend/` listing the variables above (if missing).
- Add a short Postman collection or OpenAPI spec for the API surface.
- Add automated dev start scripts (concurrently) if you want a single `npm run dev` to reliably start both services.

---

If you'd like, I can also:

- add a `backend/.env.example` file with the variables above,
- generate a short Postman/OpenAPI spec for the main endpoints,
- or create a single `dev` script that reliably starts both apps.

