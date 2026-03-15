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

// Handler-Typ (args ist der Zod-geparste Input)
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>;

export class MockMcpServer {
  private readonly handlers = new Map<string, ToolHandler>();

  // Nachahmt McpServer.registerTool – fängt Handler ein
  registerTool(name: string, _definition: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  // Ruft den eingefangenen Handler auf
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Tool not registered: ${name}`);
    return handler(args);
  }

  hasToolRegistered(name: string): boolean {
    return this.handlers.has(name);
  }

  registeredToolNames(): string[] {
    return [...this.handlers.keys()];
  }
}
