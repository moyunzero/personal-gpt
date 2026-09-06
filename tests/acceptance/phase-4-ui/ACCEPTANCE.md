# Phase 4 UI — Chat shell acceptance

**Runner:** `node tests/acceptance/phase-4-ui/run-chat-ui-uat.mjs`  
**Screenshots:** `tests/acceptance/phase-4-ui/screenshots/`  
**JSON:** `tests/acceptance/phase-4-ui/UAT-RESULT.json`

## Prerequisites

- Docker stack up (`docker compose up -d`)
- Web rebuilt after UI changes: `docker compose up -d --build web`
- Logged-in session cookie (optional but required for session-restore case):

```bash
# DevTools → Application → Cookies → copy authjs.session-token value
export PGPT_SESSION_COOKIE='authjs.session-token=PASTE_VALUE'
export PGPT_BASE_URL=http://localhost:3000
node tests/acceptance/phase-4-ui/run-chat-ui-uat.mjs
```

## Cases

| ID                  | Check                                       |
| ------------------- | ------------------------------------------- |
| infra               | `GET /api/health`                           |
| ui-sidebar-margin   | Owner pill 距浏览器底 ≥12px                 |
| ui-session-restore  | 会话 A → 新会话 B → 点回 A，历史仍在        |
| api-session-persist | `/api/chat/sessions` 至少一条含 ≥2 messages |

## Known infra

- Chat 需 LLM 可达；代理在 Docker 内应走 `host.docker.internal:7897`（见 `docker-compose.yml`）。
