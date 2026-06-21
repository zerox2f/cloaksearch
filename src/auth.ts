/**
 * API Key Authentication Middleware
 *
 * Validates incoming requests using the ACCESS_TOKEN environment variable.
 * Supports both 'Authorization: Bearer <key>' and 'X-API-Key: <key>' headers.
 */

import type { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.SERVICE_API_KEY;

/**
 * Get the configured API key value (or undefined if not set).
 */
export function getApiKey(): string | undefined {
  return API_KEY;
}

/**
 * Middleware đơn giản để bảo vệ endpoint bằng API key
 */
export function authMiddleware(req: any, res: any, next: any): void {
  // Nếu không set SERVICE_API_KEY, hop qua (không bảo vệ)
  if (!API_KEY) {
    console.warn('[Auth] SERVICE_API_KEY is not set, skipping auth');
    next();
    return;
  }

  // Lấy key từ Authorization header hoặc X-API-Key header
  const authHeader = req.headers['authorization'];
  const apiKeyHeader = (req.headers as { 'x-api-key'?: string })['x-api-key'];

  const providedKey =
    (authHeader && typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null) ||
    (apiKeyHeader && typeof apiKeyHeader === 'string' ? apiKeyHeader : null);

  if (!providedKey) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32002,
        message: 'Missing API key. Please provide Authorization: Bearer <key> or X-API-Key: <key> header.',
      },
    });
    return;
  }

  if (providedKey !== API_KEY) {
    console.warn(`[Auth] Invalid API key from ${req.ip}`);
    res.status(401).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Unauthorized. Invalid API key.',
      },
    });
    return;
  }

  console.log(`[Auth] Valid API key for ${req.method} ${req.path} from ${req.ip}`);
  next();
}