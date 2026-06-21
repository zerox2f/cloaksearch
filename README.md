# CloakSearch Remote Server

Remote HTTP/SSE MCP server for web search with full page content extraction, search summaries, and single page content extraction. Built on top of `mrkrsl/cloaksearch`, extended with HTTP/SSE transport, API key authentication, and Docker deployment.

- **Repo:** [zerox2f/cloaksearch](https://github.com/zerox2f/cloaksearch)
- **Upstream:** [mrkrsl/web-search-mcp](https://github.com/mrkrsl/web-search-mcp)

## Features

- **Dual Transport:** stdio (local) + HTTP/SSE (remote)
- **API Key Auth:** secure remote access via `SERVICE_API_KEY`
- **Docker Ready:** `docker compose up` for single-command deployment
- **Same Tools:** `full-web-search`, `get-web-search-summaries`, `get-single-web-page-content`
- **Multi-Engine Search:** Google → Bing → Brave → DuckDuckGo
- **Browsers:** CloakBrowser → Firefox → Chromium → axios
- **Full Content Extraction:** concurrent page fetch with Playwright + axios fallback

## Quick Start with Docker

```bash
# 1. Clone
git clone https://github.com/zerox2f/cloaksearch.git
cd cloaksearch

# 2. Create .env
echo "SERVICE_API_KEY=your-secret-key" > .env

# 3. Start
docker compose up --build
```

Server runs at `http://127.0.0.1:3000` (health: `/health`, SSE: `/mcp`).

## mcp.json Configuration for LLM Clients

### HTTP/SSE (Remote / Docker)

```json
{
  "mcpServers": {
    "cloaksearch-remote": {
      "url": "http://127.0.0.1:3000/mcp",
      "transport": "sse",
      "headers": {
        "Authorization": "Bearer your-secret-key"
      }
    }
  }
}
```

### stdio (Local)

```json
{
  "mcpServers": {
    "cloaksearch-local": {
      "command": "node",
      "args": ["/path/to/cloaksearch/dist/index.js"],
      "env": {
        "MAX_CONTENT_LENGTH": "50000",
        "BROWSER_HEADLESS": "true"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SERVICE_API_KEY` | *(required in HTTP mode)* | API key for remote access |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | Server port |
| `MAX_CONTENT_LENGTH` | `500000` | Max chars per page |
| `BROWSER_HEADLESS` | `true` | Headless browser |
| `MAX_BROWSERS` | `3` | Browser pool size |
| `DEFAULT_TIMEOUT` | `6000` | Request timeout (ms) |
| `BROWSER_FALLBACK_THRESHOLD` | `3` | Axios failures before browser fallback |

## Project Structure

```
cloaksearch/
├── src/
│   ├── index.ts                  # stdio entry point + tool registration
│   ├── http-server-entry.ts      # HTTP/SSE entry point
│   ├── http-server.ts            # Express + SSEServerTransport
│   ├── auth.ts                   # API key middleware
│   ├── search-engine.ts          # Multi-engine search
│   ├── enhanced-content-extractor.ts
│   ├── browser-pool.ts
│   ├── types.ts
│   └── utils.ts
├── Dockerfile
├── docker-compose.yml
├── docs/DOCUMENTATION.md
└── PLAN.md
```

## Development

```bash
# Install deps
npm install
npx playwright install

# Run stdio mode
npm run dev:stdio

# Run HTTP/SSE mode
SERVICE_API_KEY=secret npm run dev:remote
```

## Documentation

See [API.md](./docs/API.md) for complete technical details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Feedback

This is an open source project and we welcome feedback! If you encounter any issues or have suggestions for improvements, please:

- Open an issue on GitHub
- Submit a pull request
