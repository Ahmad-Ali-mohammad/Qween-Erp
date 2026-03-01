# Deploy Runbook

1. Prepare `.env` for production LAN.
2. Build image: `docker compose build app`.
3. Run: `docker compose up -d`.
4. Verify: `GET /api/health`.
