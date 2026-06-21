# Documentation – cloaksearch

**Version:** 0.3.1 (source) → 0.4.0 (remote)  
**Last updated:** 2026-06-20  
**Owner:** anh P.Q & dev

---

## Tóm tắt nhanh

Dự án này là fork của `mrkrsl/web-search-mcp`, tách riêng mode `stdio` và `remote HTTP/SSE`. Service chạy theo **Docker**, được **bảo vệ bằng API key**.

### Mục tiêu

- Giữ nguyên toàn bộ business logic: web search + content extraction
- Expose service qua HTTP endpoints (`GET /sse`, `POST /messages`)
- Auth mỗi request bằng API key (Authorization: Bearer <key>)
- Đóng gói thành Docker service deployable

### Các mode hỗ trợ

| Mode | Transport | Entry point | Auth | Deployment |
|------|-----------|-------------|------|-----------|
| Local | stdio | `src/index.ts` | N/A | `npm start` (local only) |
| Remote | SSE (HTTP) | `src/http-server.ts` | API key | Docker / Node |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        MCP Client                          │
│  (Claude Desktop, Cursor, VS Code, custom tools)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ SSE Stream (GET /sse + POST /messages)
                      │ Authorization: Bearer <API_KEY>
                      │ Mcp-Session-Id header (session mgmt)
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                  cloaksearch                       │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Express Server (HTTP)                              │    │
│  │  - API key middleware                                │    │
│  │  - CORS handler                                      │    │
│  │  - Session management                               │    │
│  │  - Encoding/decoding (UTF-8)                        │    │
│  └───────────────────┬─────────────────────────────────┘    │
│                      │                                        │
│  ┌───────────────────▼─────────────────────────────────┐    │
│  │  SSEServerTransport (@modelcontextprotocol/sdk)     │    │
│  │  - Maintains SSE connections per session            │    │
│  │  - Handles server-to-client JSON-RPC messages       │    │
│  │  - Sends response on stream                         │    │
│  └───────────────────┬─────────────────────────────────┘    │
│                      │                                        │
│  ┌───────────────────▼─────────────────────────────────┐    │
│  │  McpServer (@modelcontextprotocol/sdk v1.x)          │    │
│  │  - Registers tools (full-web-search, etc.)           │    │
│  │  - Tool handlers (search/content extraction)         │    │
│  │  - JSON-RPC protocol logic                          │    │
│  └───────────────────┬─────────────────────────────────┘    │
│                      │                                        │
│  ┌───────────────────▼─────────────────────────────────┐    │
│  │  Business Logic (maintained from source)             │    │
│  │  - SearchEngine (multi-engine search)                │    │
│  │  - ContentExtractor (axios + Playwright fallback)    │    │
│  │  - RateLimiter, BrowserPool                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Business Logic Overview

### 1. SearchEngine (src/search-engine.ts)

- **Mục đích:** Multi-engine web search với fallback strategy
- **Engines ưu tiên:** Playwright + Google → Playwright + Bing → Playwright + Brave → Axios + DuckDuckGo
- **Rate limiting:** 10 requests/phút
- **Quality checking:** Optional relevance threshold
- **Polling:** Multi-browser rotating bằng `BrowserPool`
- **Browsers:** CloakBrowser → Firefox → Chromium → axios

**Trajan:**
- Input: `{ query: string, numResults: number, timeout: number }`
- Output: `{ results: SearchResult[], engine: string, totalFound: number, searchTimestamp: string, processingTimeMs: number }`

**Environment config:**
- `ENABLE_RELEVANCE_CHECKING`, `RELEVANCE_THRESHOLD`, `FORCE_MULTI_ENGINE_SEARCH`
- `DEBUG_BROWSER_LIFECYCLE`

### 2. ContentExtractor (src/content-extractor.ts)

- **Mục đích:** Content extraction từ URL, được axios fallback sang Playwright
- **Timeout default:** 10s
- **Max content length:** `MAX_CONTENT_LENGTH` env (default 500KB)

**Trajan:**
- Input: `{ url: string, timeout?: number, maxContentLength?: number }`
- Output: string (HTML content parsed, cleaned, stripped)

**Error handling:**
- Axios errors (network, 4xx, etc.)
- Playwright fallback cho blocked/dynamic pages (Cloudflare, JS-render)
- Sleep retries cho rate limit (p-retry)

### 3. EnhancedContentExtractor (src/enhanced-content-extractor.ts)

- **Từ code nguồn:** Không được export class ngoài
- **Vai trò:** Merge logic SearchEngine → ContentExtractor để extract multi-results
- **Fallback threshold:** Có thể config qua `BROWSER_FALLBACK_THRESHOLD`

### 4. Types (src/types.ts)

```typescript
interface SearchResult {
  title: string;
  url: string;
  description: string;
  fullContent: string;
  contentPreview: string;
  wordCount: number;
  timestamp: string;
  fetchStatus: 'success' | 'error' | 'timeout';
  error?: string;
}

interface SearchOptions {
  query: string;
  numResults?: number;
  timeout?: number;
}

interface SearchResponse {
  query: string;
  limit: number;
  results: SearchResult[];
  totalFound: number;
  searchTimestamp: string;
  processingTimeMs: number;
}
```

---

## MCP Server Tools

### full-web-search

- **Muon dùng khi:** Comprehensive search, cần full page content
- **Arguments:**
  - `query` (str, required)
  - `limit` (int, 1-10, default 5)
  - `includeContent` (bool, default true)
  - `maxContentLength` (int, optional, default 0=no limit)
- **Process:**
  - Search web với `includeContent=true` (2x limit + 2 leeway)
  - Skip PDF URLs
  - Extract content từ tied results (target `limit`)
- **Output:** Text response với results (title, url, description, full content, metadata)

### get-web-search-summaries

- **Muon dùng khi:** Quick search, chỉ cần snippets
- **Arguments:**
  - `query` (str, required)
  - `limit` (int, 1-10, default 5)
- **Process:**
  - Search web (không extract content)
  - Close browser pool sau mỗi search để tránh memory leak

### get-single-web-page-content

- **Muon dùng khi:** Extract riêng một page từ URL
- **Arguments:**
  - `url` (str, required, valid URL)
  - `maxContentLength` (int, optional, 0=no limit)
- **Output:** Full content + metadata (word count, length)

---

## HTTP/SSE Transport Pattern (Legacy)

### MCP Specification

Sử dụng **HTTP+SSE transport** (2024-11-05 spec), tương thích với hầu hết MCP clients hiện tại.

### Endpoint

- `POST /messages` – Nhận JSON-RPC messages
- `GET /sse` – Mở SSE stream cho server-to-client messages

### Session Management

MCP spec Session management (2025-06-18):
- Server gắn `Mcp-Session-Id` trong header response `InitializeResult`
- Client phải gắn header này trong các request tiếp theo
- Nếu missing session ID → 400 Bad Request

### Auth Flow

```typescript
app.use((req, res, next) => {
  const key = req.headers["authorization"]?.replace("Bearer ", "") || req.headers["x-api-key"];
  if (key !== SERVICE_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});
```

---

## Docker Deployment

### Docker Image

- **Base:** Node 20-slim (lightweight, security updates过往 госООБCS Robert MIT)
- **Mounting:** `chown -R node:node /app/node_modules` if needed
- **Health check:** HTTPS hoặc docs để health endpoint (optional)

### Environment Variables

```env
SERVICE_API_KEY=your-secret-key
PORT=3000
HOST=127.0.0.1
MAX_CONTENT_LENGTH=500000
MAX_BROWSERS=3
BROWSER_HEADLESS=true
BROWSER_TYPES=chromium,firefox
ENABLE_RELEVANCE_CHECKING=true
RELEVANCE_THRESHOLD=0.3
```

### Security

- Bind làm localhost: `HOST=127.0.0.1`
- Ans.ScrollBars: nếu public → reverse proxy (nginx) + TLS
- Env keys mạnh: độ dài tối thiểu 32 ký tự
- `systemctl` service để manage restart (systemd)

---

## MCP Clients

### Claude Desktop

```json
{
  "mcpServers": {
    "web-search-remote": {
      "type": "sse",
      "url": "http://localhost:3000/mce",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor IDE

```json
{
  "mcpServers": {
    "web-search-remote": {
      "transport": "sse",
      "url": "http://localhost:3000/mce",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

### VS Code + MCP Inspector

```json
{
  "mcpServers": {
    "web-search-remote": {
      "type": "sse",
      "url": "http://localhost:3000/mce",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      },
      "name": "web-search-remote"
    }
  },
  "enabled": true
}
```

---

## Testing

### Manual test với curl

```bash
# Test SSE stream opening (no auth)
curl -N -H "Accept: text/event-stream" http://localhost:3000/mce
# 404 nếu auth missing

# Test SSE với auth
curl -N -H "Accept: text/event-stream" -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/mce

# Test POST với auth
curl -X POST http://localhost:3000/mce \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    }
  }'
```

### Docker build

```bash
docker build -t cloaksearch:latest .
docker run -d -p 127.0.0.1:3000:3000 -e SERVICE_API_KEY=secret cloaksearch:latest
```

### Docker Compose

```bash
docker compose up  \
  --build \
  -d

# Check logs
docker compose logs -f cloaksearch

# Stop
docker compose down
```

---

## Troubleshooting

### API key omitted error

```json
{
  "jsonrpc": "2.0",
  "error": { "code": -32002, "message": "Missing API key" }
}
```

**Fix:** Bổ biến Authorization: Bearer <key> header.

### SSE stream closes abruptly

**Cause:**
- Client disconnect tetra transport hasn't finished response
- Session expired

**Fix:**
- Session expiry configurable (`SESSION_TTL_MS`)
- Ensure server closes stream after sending response

### Browser pool exhaustion

**Symptom:** `ECONNREFUSED` hoặc browser related errors

**Fix:**
- Reduce `MAX_BROWSERS`
- Check `DEBUG_BROWSER_LIFECYCLE=true`
- Restart service

### Memory leak (eventemitter listener proliferation)

**Cause:** Browser cleanup issues trong search-only flows

**Fix:**
- Ensure `searchEngine.closeAll()` được gọi trong `get-web-search-summaries`
- Avoid keep browser open across calls

---

## Changelog

### v0.4.0 (remote mode)

- Thêm `http-server.ts` entry point với SSE transport
- Thêm `auth.ts` middleware cho API key
- Dockerfile + docker-compose.yml
- README update (stdio vs remote modes)

### v0.3.1 (source, chính thức)

- Local MCP server với stdio transport
- Full web search + content extraction
- 3 tools chính: `full-web-search`, `get-web-search-summaries`, `get-single-web-page-content`

---

## Lệnh hữu ích (Quick Reference)

```bash
# Clone
/workspace/cloaksearch $ git clone https://github.com/mrkrsl/cloaksearch.git cloaksearch

# Build
npm install
npx tsc

# Run remote mode (local)
SERVICE_API_KEY=secret PORT=3000 node dist/http-server.js

# Run remote mode (dev)
SERVICE_API_KEY=secret npx tsx watch src/http-server.ts

# Run stdio mode (local - existing)
npm run build
npm start

# Docker build
docker build -t cloaksearch:latest .

# Docker run
docker run -d \
  -p 127.0.0.1:3000:3000 \
  -e SERVICE_API_KEY=secret \
  cloaksearch:latest

# Docker Compose
docker compose up --build -d
docker compose logs -f cloaksearch

# Client test (MCP Inspector)
curl -X POST http://localhost:3000/mce \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer secret" \
  -d '...'
```

---

**Tiếp theo (roadmap next release):**
- [ ] Streamable HTTP spec (v2 SDK) khi stable
- [ ] Load balancing / health check endpoints
- [ ] Metrics (Prometheus) và logging structured (OPENTELEMETRY)

---

**Contact:** hi@xeu.me
**License:** MIT (source) + open-source
