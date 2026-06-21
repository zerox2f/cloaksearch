# PLAN.md – CloakSearch Remote HTTP/SSE Conversion

**Source:** `mrkrsl/cloaksearch` @ main (v0.3.1)
**Fork:** `zerox2f/cloaksearch`
**Target:** Remote MCP server qua HTTP/SSE, deployable Docker
**Security:** API key gate trên mỗi request
**Last updated:** 2026-06-20

---

## Tiến độ tổng quan

- [x] **1. Fork + baseline** — Sao chép dự án về workspace
- [x] **2. Kế hoạch chi tiết** — Đọc PLAN.md này
- [x] **3. Audit source** — Liệt kê files, entry point, dependencies
- [x] **4. Thiết kế kiến trúc** — Xác định HTTP entrypoint, API key gate, Docker
- [x] **5. Setup dependencies** — express, cors, SSEServerTransport, auth + tooling
- [x] **6. Implement HTTP transport** — `src/http-server.ts`, `src/http-server-entry.ts`
- [x] **7. Implement API key gate** — `src/auth.ts`, `authMiddleware`
- [x] **8. Tách business logic** — Giữ nguyên `src/index.ts`, đóng gói lại `WebSearchMCPServer`
- [x] **9. Dockerize** — `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- [x] **10. README + docs** — Hướng dẫn chạy, config client, security trong `docs/DOCUMENTATION.md`
- [x] **11. Git commit + push** — Branch feature, PR, merge
- [x] **12. Test end-to-end** — SSE stream + tool execution + auth

---

## 1. Fork + baseline
**Owner:** anh P.Q  
**Ngày:** 2026-06-20  
**Tác động:** Clone `mrkrsl/cloaksearch` về workspace, gọi local là `cloaksearch`.

---

## 2. Audit source
**Owner:** dev  
**Output:** Danh sách files, entrypoint, deps hiện tại.

### 2.1 Cấu trúc files (hiện tại)
```
cloaksearch/
├── src/
│   ├── index.ts              ← Entry stdio hiện tại (OK)
│   ├── http-server-entry.ts  ← HTTP/SSE entry point
│   ├── http-server.ts        ← HTTP transport + routes
│   ├── auth.ts               ← API key middleware
│   ├── browser-pool.ts
│   ├── content-extractor.ts
│   ├── enhanced-content-extractor.ts
│   ├── search-engine.ts
│   ├── rate-limiter.ts
│   ├── types.ts
│   └── utils.ts
├── package.json              ← express, cors, @modelcontextprotocol/sdk@1.15.0
```

### 2.2 Entry point hiện tại
- `src/index.ts` → stdio → `WebSearchMCPServer` → `StdioServerTransport`
- `src/http-server-entry.ts` → HTTP/SSE → `SSEServerTransport`

### 2.3 Tools đang expose
- `full-web-search`
- `get-web-search-summaries`
- `get-single-web-page-content`

---

## 5. Dependencies
**Đã hoàn thành:** `express`, `cors`, `@modelcontextprotocol/sdk@1.15.0`, `tsx`, `typescript@5.4.5`.

---

## 9. Docker
**Files:**
- `Dockerfile`: **binds `127.0.0.1` for dev only**
- `docker-compose.yml`: **exposes container’s `0.0.0.0:3000`; host mapping is up to deployer**

### Bảo mật
- `HOST`/`PORT` được inject qua env; không hard-code trong code.
- `SERVICE_API_KEY` là bắt buộc với `cloaksearch`.
- Đặt `COMPOSE_PROJECT_NAME` và đổi port nếu cần trên production.

---

## 12. Chạy thử
```
SERVICE_API_KEY=secret PORT=3000 HOST=127.0.0.1 npx tsx src/http-server-entry.ts
curl -s http://127.0.0.1:3000/health
curl -N -H 'Authorization: Bearer secret' http://127.0.0.1:3000/mcp
```

---

## Branch / Commit log
- `main`: baseline + HTTP + auth + Docker + docs (đã merge)
- `feature/docker`: Dockerfile, compose, .dockerignore (đã merge vào main)
- `feature/http-transport`: auth + HTTP/SSE transport (đã merge vào main)
