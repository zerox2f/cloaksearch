/**
 * HTTP/SSE Server for MCP (Model Context Protocol)
 *
 * Implements the HTTP+SSE transport following the MCP specification 2024-11-05.
 * - GET /mcp: Establish SSE stream (200 OK + Accept: text/event-stream)
 * - POST /messages: Receive JSON-RPC messages
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import cors from 'cors';
import express from 'express';
import { authMiddleware } from './auth.js';

export interface CreateHttpServerOptions {
  server: McpServer;
}

/**
 * Creates an Express app serving the MCP HTTP/SSE transport.
 */
export function createHttpServer({ server }: CreateHttpServerOptions): any {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Health check must be public (no auth)
  app.get('/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      name: 'cloaksearch-remote',
      version: '0.4.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Protected routes
  app.use((req: any, res: any, next: any) => {
    authMiddleware(req as any, res as any, next as any);
  });

  // Store transports by session ID
  const transports = new Map<string, SSEServerTransport>();

  // SSE endpoint for establishing the stream
  app.get('/mcp', async (req: any, res: any) => {
    console.log('[HTTP Server] Received GET request to /mcp (establishing SSE stream)');

    try {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;

      console.log(`[HTTP Server] Created SSE transport for session: ${sessionId}`);

      transports.set(sessionId, transport);
      transport.onclose = () => {
        console.log(`[HTTP Server] SSE transport closed for session ${sessionId}`);
        transports.delete(sessionId);
      };

      console.log(`[HTTP Server] Connecting MCP server to transport for session ${sessionId}`);

      await server.connect(transport);

      console.log(`[HTTP Server] Established SSE stream with session ID: ${sessionId}`);
    } catch (error) {
      console.error('[HTTP Server] Error establishing SSE stream:', error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Error establishing SSE stream',
          },
        });
      }
    }
  });

  // Messages endpoint for receiving client JSON-RPC requests
  app.post('/messages', async (req: any, res: any) => {
    console.log('[HTTP Server] Received POST request to /messages');

    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      console.error('[HTTP Server] No session ID provided in request URL');
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Missing sessionId parameter',
        },
      });
    }

    const transport = transports.get(sessionId);
    if (!transport) {
      console.error(`[HTTP Server] No active transport found for session ID: ${sessionId}`);
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found',
        },
      });
    }

    try {
      console.log(`[HTTP Server] Handling POST message for session ${sessionId}`);
      await transport.handlePostMessage(req as any, res as any, req.body);
    } catch (error) {
      console.error('[HTTP Server] Error handling request:', error);

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Error handling request',
          },
        });
      }
    }
  });

  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[HTTP Server] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Internal server error',
        },
      });
    }
  });

  return app;
}
