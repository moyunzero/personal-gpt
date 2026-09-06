# KB Upload Acceptance

**结论：3/3 PASS（2026-09-06）**

| #   | 检查                                                     | 结果 |
| --- | -------------------------------------------------------- | ---- |
| 1   | `GET /api/health`                                        | PASS |
| 2   | `POST /api/kb/documents` multipart（含 ISO `createdAt`） | PASS |
| 3   | `DELETE` pending 文档                                    | PASS |

## 根因修复

1. `insert` 后回读 `findOneByOrFail`，避免 `createdAt` 为空导致 `toISOString` 崩溃
2. pending + `chunkCount=0` 删除时，次级存储清理失败不阻断取消上传

## 命令

```bash
# 单元
cd apps/web && yarn vitest run lib/kb/documents.service.test.ts

# 生产验收（需有效 session cookie；本机若无法直连 *.vercel.app，可用 Playwright）
PGPT_BASE_URL=https://personal-emotion-gpt.vercel.app \
PGPT_SESSION_COOKIE='__Secure-authjs.session-token=...' \
node tests/acceptance/kb-upload/run-upload-acceptance.mjs
```

证据：`tests/acceptance/kb-upload/RESULT.json`
