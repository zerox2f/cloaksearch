#!/usr/bin/env node
console.log('CloakSearch Server starting...');

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SearchEngine } from './search-engine.js';
import { EnhancedContentExtractor } from './enhanced-content-extractor.js';
import { WebSearchToolInput, WebSearchToolOutput, SearchResult } from './types.js';
import { isPdfUrl } from './utils.js';

class WebSearchMCPServer {
  private server: McpServer;
  private searchEngine: SearchEngine;
  private contentExtractor: EnhancedContentExtractor;

  constructor() {
    this.server = new McpServer({
      name: 'cloaksearch',
      version: '0.3.1',
    });

    this.searchEngine = new SearchEngine();
    this.contentExtractor = new EnhancedContentExtractor();

    this.setupTools();
    this.setupGracefulShutdown();
  }

  private setupTools(): void {
    this.server.tool(
      'full-web-search',
      'Search the web and fetch complete page content from top results. This is the most comprehensive web search tool. It searches the web and then follows the resulting links to extract their full page content, providing the most detailed and complete information available. Use get-web-search-summaries for a lightweight alternative.',
      ({query: z.string().describe('Search query'),limit: z.number().int().min(1).max(10).default(5).optional(),includeContent: z.boolean().default(true).optional(),maxContentLength: z.number().int().nonnegative().optional(),} as any),
      async (args: any) => {
        console.log(`[MCP] Tool call received: full-web-search`);
        console.log(`[MCP] Raw arguments:`, JSON.stringify(args, null, 2));

        try {
          // Convert and validate arguments (supports both simple object and LM Studio arrays/strings)
          const validatedArgs = this.validateAndConvertArgs(args);
          
          // Auto-detect model types based on parameter formats
          const isLikelyLlama = typeof args === 'object' && args !== null && (
            (typeof args.limit === 'string') || (typeof args.includeContent === 'string')
          );
          
          const isLikelyRobustModel = typeof args === 'object' && args !== null && (
            typeof args.limit === 'number' && typeof args.includeContent === 'boolean'
          );
          
          const hasExplicitMaxLength = typeof args === 'object' && args !== null && 'maxContentLength' in args;
          
          if (!hasExplicitMaxLength && isLikelyLlama) {
            console.log(`[MCP] Detected potential Llama model (string parameters), applying content length limit`);
            validatedArgs.maxContentLength = 2000;
          }
          
          if (isLikelyRobustModel && validatedArgs.maxContentLength && validatedArgs.maxContentLength < 5000) {
            console.log(`[MCP] Detected robust model (numeric parameters), removing unnecessary content length limit`);
            validatedArgs.maxContentLength = undefined;
          }
          
          console.log(`[MCP] Validated args:`, JSON.stringify(validatedArgs, null, 2));
          
          const result = await this.handleWebSearch(validatedArgs);
          
          console.log(`[MCP] Search completed, found ${result.results.length} results`);
          
          let responseText = `Search completed for "${result.query}" with ${result.total_results} results:\n\n`;
          
          if (result.status) {
            responseText += `**Status:** ${result.status}\n\n`;
          }
          
          const maxLength = validatedArgs.maxContentLength;
          
          result.results.forEach((searchResult, idx) => {
            responseText += `**${idx + 1}. ${searchResult.title}**\n`;
            responseText += `URL: ${searchResult.url}\n`;
            responseText += `Description: ${searchResult.description}\n`;
            
            if (searchResult.fullContent && searchResult.fullContent.trim()) {
              let content = searchResult.fullContent;
              if (maxLength && maxLength > 0 && content.length > maxLength) {
                content = content.substring(0, maxLength) + `\n\n[Content truncated at ${maxLength} characters]`;
              }
              responseText += `\n**Full Content:**\n${content}\n`;
            } else if (searchResult.contentPreview && searchResult.contentPreview.trim()) {
              let content = searchResult.contentPreview;
              if (maxLength && maxLength > 0 && content.length > maxLength) {
                content = content.substring(0, maxLength) + `\n\n[Content truncated at ${maxLength} characters]`;
              }
              responseText += `\n**Content Preview:**\n${content}\n`;
            } else if (searchResult.fetchStatus === 'error') {
              responseText += `\n**Content Extraction Failed:** ${searchResult.error}\n`;
            }
            
            responseText += `\n---\n\n`;
          });
          
          return {
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
            ],
          };
        } catch (error) {
          console.error(`[MCP] Error in tool handler:`, error);
          throw error;
        }
      }
    );

    this.server.tool(
      'get-web-search-summaries',
      'Search the web and return only the search result snippets/descriptions without following links to extract full page content. This is a lightweight alternative to full-web-search for when you only need brief search results. For comprehensive information, use full-web-search instead.',
      ({query: z.string().describe('Search query'),limit: z.number().int().min(1).max(10).default(5).optional(),} as any),
      async (args: any) => {
        console.log(`[MCP] Tool call received: get-web-search-summaries`);
        console.log(`[MCP] Raw arguments:`, JSON.stringify(args, null, 2));

        try {
          if (typeof args !== 'object' || args === null) {
            throw new Error('Invalid arguments: args must be an object');
          }
          const obj = args as Record<string, unknown>;
          
          if (!obj.query || typeof obj.query !== 'string') {
            throw new Error('Invalid arguments: query is required and must be a string');
          }

          let limit = 5; // default
          if (obj.limit !== undefined) {
            const limitValue = typeof obj.limit === 'string' ? parseInt(obj.limit, 10) : obj.limit;
            if (typeof limitValue !== 'number' || isNaN(limitValue) || limitValue < 1 || limitValue > 10) {
              throw new Error('Invalid limit: must be a number between 1 and 10');
            }
            limit = limitValue;
          }

          console.log(`[MCP] Starting web search summaries...`);
          
          try {
            const searchResponse = await this.searchEngine.search({
              query: obj.query as string,
              numResults: limit,
            });

            const summaryResults = searchResponse.results.map(item => ({
              title: item.title,
              url: item.url,
              description: item.description,
              timestamp: item.timestamp,
            }));

            console.log(`[MCP] Search summaries completed, found ${summaryResults.length} results`);
            
            let responseText = `Search summaries for "${obj.query}" with ${summaryResults.length} results:\n\n`;
            
            summaryResults.forEach((summary, i) => {
              responseText += `**${i + 1}. ${summary.title}**\n`;
              responseText += `URL: ${summary.url}\n`;
              responseText += `Description: ${summary.description}\n`;
              responseText += `\n---\n\n`;
            });

            return {
              content: [
                {
                  type: 'text' as const,
                  text: responseText,
                },
              ],
            };
          } finally {
            try {
              await this.searchEngine.closeAll();
            } catch (cleanupError) {
              console.error(`[MCP] Error during browser cleanup:`, cleanupError);
            }
          }
        } catch (error) {
          console.error(`[MCP] Error in get-web-search-summaries tool handler:`, error);
          throw error;
        }
      }
    );

    this.server.tool(
      'get-single-web-page-content',
      'Extract and return the full content from a single web page URL. This tool follows a provided URL and extracts the main page content. Useful for getting detailed content from a specific webpage without performing a search.',
      ({url: z.string().url().describe('The URL of the web page to extract content from'),maxContentLength: z.number().int().nonnegative().optional(),} as any),
      async (args: any) => {
        console.log(`[MCP] Tool call received: get-single-web-page-content`);
        console.log(`[MCP] Raw arguments:`, JSON.stringify(args, null, 2));

        try {
          if (typeof args !== 'object' || args === null) {
            throw new Error('Invalid arguments: args must be an object');
          }
          const obj = args as Record<string, unknown>;
          
          if (!obj.url || typeof obj.url !== 'string') {
            throw new Error('Invalid arguments: url is required and must be a string');
          }

          let maxContentLength: number | undefined;
          if (obj.maxContentLength !== undefined) {
            const maxLengthValue = typeof obj.maxContentLength === 'string' ? parseInt(obj.maxContentLength as string, 10) : obj.maxContentLength;
            if (typeof maxLengthValue !== 'number' || isNaN(maxLengthValue) || maxLengthValue < 0) {
              throw new Error('Invalid maxContentLength: must be a non-negative number');
            }
            maxContentLength = maxLengthValue === 0 ? undefined : maxLengthValue;
          }

          console.log(`[MCP] Starting single page content extraction for: ${obj.url}`);
          
          const content = await this.contentExtractor.extractContent({
            url: obj.url as string,
            maxContentLength,
          });

          const urlObj = new URL(obj.url as string);
          const title = urlObj.hostname + urlObj.pathname;

          const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

          console.log(`[MCP] Single page content extraction completed, extracted ${content.length} characters`);

          let responseText = `**Page Content from: ${obj.url}**\n\n`;
          responseText += `**Title:** ${title}\n`;
          responseText += `**Word Count:** ${wordCount}\n`;
          responseText += `**Content Length:** ${content.length} characters\n\n`;
          
          if (maxContentLength && maxContentLength > 0 && content.length > maxContentLength) {
            responseText += `**Content (truncated at ${maxContentLength} characters):**\n${content.substring(0, maxContentLength)}\n\n[Content truncated at ${maxContentLength} characters]`;
          } else {
            responseText += `**Content:**\n${content}`;
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: responseText,
              },
            ],
          };
        } catch (error) {
          console.error(`[MCP] Error in get-single-web-page-content tool handler:`, error);
          throw error;
        }
      }
    );
  }

  private validateAndConvertArgs(args: unknown): WebSearchToolInput {
    if (typeof args !== 'object' || args === null) {
      throw new Error('Invalid arguments: args must be an object');
    }
    const obj = args as Record<string, unknown>;

    // LM Studio sometimes sends `queries` array instead of `query`
    let query: string = '';
    const rawQuery = obj.query;
    if (Array.isArray(rawQuery) && rawQuery.length > 0) {
      query = rawQuery.map(String).join(' ').trim();
    } else if (typeof rawQuery === 'string') {
      query = rawQuery;
    }
    if (!query) {
      throw new Error('Invalid arguments: query is required and must be a string or array of strings');
    }
    obj.query = query;

    // limit (default 5, range 1-10)
    let limit = 5;
    if (obj.limit !== undefined) {
      const limitValue = typeof obj.limit === 'string' ? parseInt(obj.limit, 10) : obj.limit;
      if (typeof limitValue !== 'number' || isNaN(limitValue) || limitValue < 1 || limitValue > 10) {
        throw new Error('Invalid limit: must be a number between 1 and 10');
      }
      limit = limitValue;
    }

    // includeContent (default true)
    let includeContent = true;
    if (obj.includeContent !== undefined) {
      if (typeof obj.includeContent === 'string') {
        includeContent = obj.includeContent.toLowerCase() === 'true';
      } else {
        includeContent = Boolean(obj.includeContent);
      }
    }

    // maxContentLength (optional, non-negative)
    let maxContentLength: number | undefined;
    if (obj.maxContentLength !== undefined) {
      const raw = typeof obj.maxContentLength === 'string' ? parseInt(obj.maxContentLength as string, 10) : obj.maxContentLength;
      if (typeof raw === 'number' && !isNaN(raw) && raw >= 0) {
        maxContentLength = raw === 0 ? undefined : raw;
      }
    }

    return { query, limit, includeContent, maxContentLength };
  }

  private async handleWebSearch(input: WebSearchToolInput): Promise<WebSearchToolOutput> {
    const startTime = Date.now();
    const { query, limit = 5, includeContent = true } = input;
    
    console.error(`[web-search-mcp] DEBUG: handleWebSearch called with limit=${limit}, includeContent=${includeContent}`);

    try {
      const searchLimit = includeContent ? Math.min(limit * 2 + 2, 10) : limit;
      
      console.log(`[web-search-mcp] DEBUG: Requesting ${searchLimit} search results to get ${limit} non-PDF content results`);
      
      const searchResponse = await this.searchEngine.search({
        query,
        numResults: searchLimit,
      });
      const searchResults = searchResponse.results;
      
      const pdfCount = searchResults.filter(result => isPdfUrl(result.url)).length;
      const followedCount = searchResults.length - pdfCount;
      console.error(`[web-search-mcp] DEBUG: Search engine: ${searchResponse.engine}; ${limit} requested/${searchResults.length} obtained; PDF: ${pdfCount}; ${followedCount} followed.`);

      const enhancedResults = includeContent 
        ? await this.contentExtractor.extractContentForResults(searchResults, limit)
        : searchResults.slice(0, limit);
      
      let combinedStatus = `Search engine: ${searchResponse.engine}; ${limit} result requested/${searchResults.length} obtained; PDF: ${pdfCount}; ${followedCount} followed`;

      for (const result of enhancedResults) {
        if (result.fetchStatus === 'success' && includeContent) {
          const field = result.fullContent && result.fullContent.trim() ? 'fullContent' : 'contentPreview';
          combinedStatus += `\n- ${result.title} (${result.url}): ${field} length=${result[field]?.length || 0}, wordCount=${result.wordCount}, fetchStatus=${result.fetchStatus}`;
        } else {
          combinedStatus += `\n- ${result.title} (${result.url}): fetchStatus=${result.fetchStatus}${result.error ? '; error=' + result.error : ''}`;
        }
      }

      const totalFound = searchResponse.results.length;
      const processingTimeMs = Date.now() - startTime;

      return {
        results: enhancedResults,
        total_results: totalFound,
        search_time_ms: processingTimeMs,
        query,
        status: combinedStatus,
      };
    } catch (error) {
      console.error('[web-search-mcp] Error in handleWebSearch:', error);
      throw error;
    }
  }

  private async handleWebSummaries(query: string, limit: number): Promise<any> {
    const startTime = Date.now();
    try {
      const searchResponse = await this.searchEngine.search({
        query,
        numResults: limit,
      });

      const results = searchResponse.results.map(item => ({
        title: item.title,
        url: item.url,
        description: item.description,
        timestamp: item.timestamp,
      }));

      return {
        results,
        total_results: results.length,
        search_time_ms: Date.now() - startTime,
        query,
      };
    } finally {
      try {
        await this.searchEngine.closeAll();
      } catch (cleanupError) {
        console.error('[web-search-mcp] Error during search engine cleanup:', cleanupError);
      }
    }
  }

  private async handleSinglePageContent(url: string, maxContentLength?: number): Promise<any> {
    const startTime = Date.now();
    try {
      const content = await this.contentExtractor.extractContent({
        url,
        maxContentLength,
      });
      
      const urlObj = new URL(url);
      const title = urlObj.hostname + urlObj.pathname;
      const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
      const contentPreview = content.length > 200 ? content.substring(0, 200) + '...' : content;
      
      return {
        url,
        title,
        content,
        contentPreview,
        wordCount,
        timestamp: new Date().toISOString(),
        fetchStatus: 'success',
      };
    } catch (error: any) {
      return {
        url,
        title: '',
        content: '',
        contentPreview: '',
        wordCount: 0,
        timestamp: new Date().toISOString(),
        fetchStatus: 'error',
        error: error?.message || String(error),
      };
    }
  }

  private setupGracefulShutdown(): void {
    process.on('SIGINT', async () => {
      console.log('Shutting down...');
      await this.closeAll();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      console.log('Shutting down...');
      await this.closeAll();
      process.exit(0);
    });
  }

  async closeAll(): Promise<void> {
    await this.searchEngine.closeAll();
  }

  getServer(): McpServer {
    return this.server;
  }
}

export { WebSearchMCPServer };
