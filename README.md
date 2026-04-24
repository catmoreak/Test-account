# CreditAssist AI

CreditAssist AI is a full-stack, AI-powered member support and resolution assistant for credit unions.

## What This Build Includes

- Member interface (chat-based UI) for issue intake and responses.
- AI resolution engine with:
  - intent classification with probability distribution,
  - sentiment probability scoring,
  - RAG retrieval over a mock credit union knowledge base,
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
- Data store: in-memory case store (for hackathon demo speed)

## Project Structure

- `frontend/`: Member UI + Staff dashboard
- `backend/`: API, RAG retrieval, intelligence engine, case routing
- `backend/src/data/knowledgeBase.json`: mock KB (12 entries)

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
