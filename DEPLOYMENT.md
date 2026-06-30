# DEPLOYMENT.md — ResilioChain

> Finalized in **Phase 8**. Outline below.

## Local
- Backend: `uvicorn app.main:app --reload` (port 8000).
- Frontend: `npm run dev` (port 3000). Set `NEXT_PUBLIC_API_BASE=http://localhost:8000`.

## Environment
All config via `.env` (see `.env.example`). Required: `MONGODB_URI`, AWS Bedrock creds,
`BEDROCK_MODEL_ID`. Optional: per-agent model overrides, `VOYAGE_API_KEY` (explicit embed mode).

## Production options
- **Backend:** containerize FastAPI (Dockerfile, gunicorn+uvicorn workers) → AWS ECS/Fargate,
  Fly.io, or Render. IAM role for Bedrock instead of static keys.
- **Frontend:** Vercel (Next.js native) → set `NEXT_PUBLIC_API_BASE` to the deployed API URL.
- **MongoDB:** Atlas (already managed); ensure Vector Search indexes are built; restrict network
  access list; use a least-privilege DB user.

## Pre-deploy checklist
- [ ] Rotate any credentials shared during development.
- [ ] Vector Search indexes `supplier_vector_index` + `policy_vector_index` ACTIVE.
- [ ] Seed data loaded (or production data migrated).
- [ ] `pytest` green; `/health` returns ok.
- [ ] CORS allows the frontend origin.
