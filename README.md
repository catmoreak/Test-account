# CreditAssist AI

CreditAssist AI is a full-stack, AI-powered member support and resolution assistant for credit unions.

## What This Build Includes

- Member interface (chat-based UI) for issue intake and responses.
- AI resolution engine with:
  - intent classification with probability distribution,
  - sentiment probability scoring,
  - RAG retrieval over a mock credit union knowledge base,
  - optional Mistral/OpenRouter grounded response generation,
  - structured escalation packets for unresolved cases.
- Staff dashboard to:
  - view all incoming cases,
  - filter auto-resolved vs needs-attention,
  - inspect full conversation + intent/sentiment context,
  - update case status.
- Mock knowledge base with 12 policy/product/procedure entries.

## Required Scenarios Supported

- Balance inquiry
- Transaction dispute
- Loan status inquiry
- Card block / unblock guidance
- Account profile update guidance
- Policy question (fixed deposit early closure penalty)
- Unresolved complaint escalation

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- RAG: in-memory retrieval with TF-IDF + cosine similarity over mock KB docs
- Data store: PostgreSQL (Neon via `DATABASE_URL`), with in-memory fallback if unset

## Project Structure

- `frontend/`: Member UI + Staff dashboard
- `backend/`: API, RAG retrieval, intelligence engine, case routing
- `backend/src/data/knowledgeBase.json`: mock KB (12 entries)

## Optional Mistral / OpenRouter Setup

Create a local `.env` file from `.env.example` and set `MISTRAL_API_KEY`.

The app never needs the key in source code. If the key starts with `sk-or`, the backend uses OpenRouter's chat completions endpoint and a Mistral model. With a direct Mistral key, set:

```powershell
LLM_PROVIDER=mistral
MISTRAL_API_BASE=https://api.mistral.ai/v1/chat/completions
MISTRAL_MODEL=mistral-small-latest
```

If no key is configured, CreditAssist falls back to the deterministic RAG answer generator.

## Sarvam Voice Setup (STT + TTS)

To enable voice input (speech-to-text) and spoken responses (text-to-speech), add Sarvam env vars in `.env`:

```powershell
# Shared key (already used for translation/STT)
SARVAM_API_KEY=<your_sarvam_key>

# Optional dedicated key for TTS (preferred)
SARVAM_TTS_API_KEY=<your_tts_key>

# Alias supported for compatibility with existing naming
SARM_TTS_API=<your_tts_key>

# Optional TTS tuning
SARVAM_TTS_MODEL=bulbul:v1
SARVAM_TTS_SPEAKER=anushka
SARVAM_TTS_SAMPLE_RATE=22050
SARVAM_TTS_URL=https://api.sarvam.ai/text-to-speech
```

Use `SARVAM_TTS_MODEL=bulbul:v3` (or `bulbul:v3-beta`).

If `SARVAM_TTS_API_KEY` is not set, the backend falls back to `SARM_TTS_API`, then `SARVAM_API_KEY`.

## PostgreSQL (Neon) Setup For Hosting

Set `DATABASE_URL` in the backend environment (Render service env vars or root `.env` for local runs).

Example format:

```powershell
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require&channel_binding=require
```

The backend auto-creates the `support_cases` table at startup and stores all member/staff case data there.

## Local Run

1. Install dependencies:

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
```

2. Start both apps:

```powershell
npm run dev
```

3. Open:

- UI: http://localhost:5173
- API: http://localhost:8787/api/health

## API Endpoints

- `POST /api/member/message`
- `POST /api/member/voice-to-text`
- `POST /api/member/text-to-speech`
- `GET /api/staff/cases?status=all|auto-resolved|needs-attention`
- `GET /api/staff/cases/:id`
- `PATCH /api/staff/cases/:id/status`

## Live Hosting (Public Demo)

Use Render with the included `render.yaml`.

1. Push this repo to GitHub.
2. In Render, create new Blueprint from your repo.
3. Render provisions:
   - `creditassist-api` (backend service)
   - `creditassist-ui` (static frontend)
4. After deploy, update API rewrite target in `render.yaml` if your backend URL differs.

You will get a public URL judges can use interactively.

## Notes

- This project is intentionally designed for 24-hour build constraints.
- For production hardening, add auth, persistent storage, audit logs, encryption, and model monitoring.
