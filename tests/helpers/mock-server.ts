export function makeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    text: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
  } as unknown as Response;
}

// Typ für das Result-Objekt das die Tools zurückgeben
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

import { z } from 'zod';

// Handler-Typ (args ist der Zod-geparste Input)
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

interface ToolDefinition {
  inputSchema?: z.ZodTypeAny;
  [key: string]: unknown;
}

export interface PromptMessage {
  role: string;
  content: { type: string; text: string };
}

export interface PromptResult {
  messages: PromptMessage[];
}

export interface ResourceResult {
  contents: Array<{ uri: string; mimeType?: string; text: string }>;
}

type PromptHandler = (args: Record<string, unknown>) => PromptResult;

type ResourceHandler = (uri: URL) => Promise<ResourceResult>;

interface PromptDefinition {
  argsSchema?: Record<string, z.ZodTypeAny>;
  [key: string]: unknown;
}

export class MockMcpServer {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly schemas = new Map<string, z.ZodTypeAny>();
  private readonly promptHandlers = new Map<string, PromptHandler>();
  private readonly resourceHandlers = new Map<string, ResourceHandler>();

  // Nachahmt McpServer.registerTool – fängt Handler und Schema ein
  registerTool(name: string, definition: ToolDefinition, handler: ToolHandler): void {
    this.handlers.set(name, handler);
    if (definition.inputSchema) {
      this.schemas.set(name, definition.inputSchema);
    }
  }

  // Nachahmt McpServer.registerPrompt
  registerPrompt(name: string, _definition: PromptDefinition, handler: PromptHandler): void {
    this.promptHandlers.set(name, handler);
  }

  /**
   * Ruft den Handler auf. Wenn `validate: true`, wird der Input zuerst
   * durch das Zod-Schema geparst (wie der echte MCP-Server es tut).
   * Das ermöglicht Tests für Coercion und Validierungsfehler.
   */
  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options: { validate?: boolean } = {},
  ): Promise<ToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Tool not registered: ${name}`);

    if (options.validate) {
      const schema = this.schemas.get(name);
      if (schema) {
        const parsed = schema.safeParse(args);
        if (!parsed.success) {
          return {
            content: [{ type: 'text', text: `Validation error: ${parsed.error.message}` }],
            isError: true,
          };
        }
        return handler(parsed.data as Record<string, unknown>);
      }
    }

    return handler(args);
  }

  callPrompt(name: string, args: Record<string, unknown> = {}): PromptResult {
    const handler = this.promptHandlers.get(name);
    if (!handler) throw new Error(`Prompt not registered: ${name}`);
    return handler(args);
  }

  hasToolRegistered(name: string): boolean {
    return this.handlers.has(name);
  }

  hasPromptRegistered(name: string): boolean {
    return this.promptHandlers.has(name);
  }

  registeredToolNames(): string[] {
    return [...this.handlers.keys()];
  }

  registeredPromptNames(): string[] {
    return [...this.promptHandlers.keys()];
  }

  registerResource(name: string, uri: string, _config: unknown, handler: ResourceHandler): void {
    this.resourceHandlers.set(uri, handler);
  }

  async callResource(uri: string): Promise<ResourceResult> {
    const handler = this.resourceHandlers.get(uri);
    if (!handler) throw new Error(`Resource not registered: ${uri}`);
    return handler(new URL(uri));
  }

  hasResourceRegistered(uri: string): boolean {
    return this.resourceHandlers.has(uri);
  }

  registeredResourceUris(): string[] {
    return [...this.resourceHandlers.keys()];
  }
}
