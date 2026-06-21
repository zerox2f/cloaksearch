# Build stage
FROM node:22-slim AS builder
ENV NODE_ENV=development
WORKDIR /app
COPY package*.json ./
RUN npm ci --include=dev --no-audit --no-fund
COPY tsconfig.json ./
COPY src/ ./src/
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npx tsc --outDir dist --sourceMap false --declaration false --declarationMap false

# Runtime stage: Playwright with Firefox
FROM mcr.microsoft.com/playwright:v1.48.0-jammy
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
# Install browser
RUN npm install cloakbrowser
RUN npx playwright install firefox || true
RUN npx playwright install chromium || true

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health', (r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/http-server-entry.js"]
