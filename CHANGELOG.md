# Changelog

## 2026‑06‑21 – Rename to **CloakSearch** and major enhancements

### Renamed project
- Project name changed from `web-search-mcp` / `Web Search MCP` to **CloakSearch** (all source files, logs, documentation, Docker labels, npm bin).

### New functionality compared to upstream `mrkrsl/web-search-mcp`
- **CloakBrowser integration** for stealth search and correct Vietnamese diacritics handling.
- **HTTP/SSE transport** (`src/http-server.ts` + `src/http-server-entry.ts`) exposing `/mcp` (SSE) and `/messages` (JSON‑RPC) endpoints.
- **API‑key authentication** middleware (`src/auth.ts`) protecting all routes except `/health`.
- **Dockerization** (`Dockerfile`, `docker‑compose.yml`) with bind‑to `127.0.0.1`, health‑check, service and container labels `com.openclaw.service=cloaksearch`.
- **Health endpoint** now returns `{ name: 'cloaksearch-remote', ... }`.
- **Log branding** updated across all entry points and test script (`CloakSearch Server starting...`).
- **New npm scripts** for remote mode (`dev:remote`, `start:remote`).
- **Feature branch workflow** enforced in README (never push directly to `main`).
- **Documentation updates** (`README.md`, `docs/API.md`, `docs/DOCUMENTATION.md`, `PLAN.md`) reflecting new name, architecture, and usage.
- **Test scripts** `scripts/inspect-pages.mjs` and `scripts/test-selectors.mjs` added for selector debugging.

### Minor adjustments / refactors
- Updated `package.json` name, bin, and repository URL.
- Updated Docker compose service, container, and network names.
- Adjusted health JSON field order and added timestamp.
- Updated all console messages to reference **CloakSearch**.
- Adjusted CI test script output to use new branding.
- Updated README quick‑start to include `git clone https://github.com/zerox2f/cloaksearch.git`.

### Compatibility
- Core business logic (search engines, content extraction, tool signatures) remains compatible with upstream; existing MCP clients continue to work unchanged.

---

*Generated from the series of commits on branch `feature/rename-to-cloaksearch`.*
