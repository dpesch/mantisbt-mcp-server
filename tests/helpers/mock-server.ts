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

export class MockMcpServer {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly schemas = new Map<string, z.ZodTypeAny>();

  // Nachahmt McpServer.registerTool – fängt Handler und Schema ein
  registerTool(name: string, definition: ToolDefinition, handler: ToolHandler): void {
    this.handlers.set(name, handler);
    if (definition.inputSchema) {
      this.schemas.set(name, definition.inputSchema);
    }
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

  hasToolRegistered(name: string): boolean {
    return this.handlers.has(name);
  }

  registeredToolNames(): string[] {
    return [...this.handlers.keys()];
  }
}
