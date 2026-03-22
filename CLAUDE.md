# CLAUDE.md — Artmood ERP
## Stack
- Next.js 16 + React 19 + TypeScript
- Supabase (PostgreSQL) for database
- AWS EC2 + PM2 + Nginx → erp.artmood.ma
- Dev port: 3000
## Local Dev Server
- Start with: npm run dev
- Always start dev server automatically when asked
- If port 3000 is busy, kill it first then restart
## Deploy to Production
- Command: bash scripts/deploy.sh
- Always run npm run build before deploy
- After deploy verify with: npm run verify:prod
## Database Rules
- Never delete data, always soft delete
- Respect all RBAC rules in lib/auth/permissions.ts
- Financial changes must go through lib/security/financial-guard.ts
## Code Rules
- Never break existing 69 API routes
- Run npm run lint before any commit
