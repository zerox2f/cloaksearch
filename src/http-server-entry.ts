#!/usr/bin/env node

/**
 * HTTP/SSE MCP Server Entry Point
 *
 * Starts the MCP server with HTTP/SSE transport for remote access.
 *
 * Usage:
 *   SERVICE_API_KEY=secret PORT=3000 HOST=127.0.0.1 npx tsx src/http-server-entry.ts
 *
 * Or via npm:
 *   npm run start:remote
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { WebSearchMCPServer } from './index.js';
import { createHttpServer } from './http-server.js';
import { getApiKey } from './auth.js';

async function main(): Promise<void> {
  console.log('🚀 CloakSearch Remote Server initializing...\n');

  // Validate required environment variables
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('❌ [FATAL] SERVICE_API_KEY environment variable is required');
    console.error('Expected format: SERVICE_API_KEY=your-secret-key PORT=3000 HOST=127.0.0.1 npx tsx src/http-server-entry.ts\n');
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '127.0.0.1';

  console.log('📋 Configuration:');
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   API Key: ${apiKey.substring(0, 8)}...\n`);

  try {
    // Create the MCP server instance (reuse existing logic from src/index.ts)
    const serverInstance = new WebSearchMCPServer();
    console.log('✅ MCP server created and tools registered\n');

    // Get the McpServer instance from WebSearchMCPServer
    const mcpserver = serverInstance.getServer();
    console.log('✅ MCP server instance obtained\n');

    // Create the HTTP/SSE server
    const app = createHttpServer({ server: mcpserver });

    // Start the HTTP server
    const server = (app as any).listen(port, host, () => {
      console.log('🎉 CloakSearch Remote Server started:\n');
      console.log('   SSE endpoint:  http://' + host + ':' + port + '/mcp');
      console.log('   Messages:      http://' + host + ':' + port + '/messages');
      console.log('   Health check:  http://' + host + ':' + port + '/health');
      console.log('   API key:       ' + apiKey.substring(0, 8) + '...\n');
      console.log('   🔄 Waiting for MCP messages...\n');
    });

    // Graceful shutdown
    const cleanup = async (signal: string) => {
      console.log(`\n⚠️  Received ${signal}, shutting down gracefully...\n`);
      try {
        await serverInstance.closeAll();
        console.log('✅ All browsers closed successfully\n');
        console.log('👋 Goodbye!\n');
        process.exit(0);
      } catch (cleanupError) {
        console.error('❌ Error during cleanup:', cleanupError);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
    process.on('unhandledRejection', (reason) => {
      console.error('❌ Unhandled Rejection:', reason);
    });
    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ [FATAL] Failed to start server:', error);
    process.exit(1);
  }
}

main();