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

type ResourceHandler = (uri: URL, variables?: Record<string, string>) => Promise<ResourceResult>;

interface ResourceEntry {
  handler: ResourceHandler;
  /** URI template pattern, e.g. 'mantis://projects/{id}'. Present for template resources only. */
  template?: string;
}

function matchTemplate(template: string, uri: string): Record<string, string> | null {
  const names = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!);
  const pattern = template.replace(/\{[^}]+\}/g, '([^/]+)');
  const match = uri.match(new RegExp(`^${pattern}$`));
  if (!match) return null;
  return Object.fromEntries(names.map((name, i) => [name, match[i + 1]!]));
}

interface PromptDefinition {
  argsSchema?: Record<string, z.ZodTypeAny>;
  [key: string]: unknown;
}

export class MockMcpServer {
  private readonly handlers = new Map<string, ToolHandler>();
  private readonly schemas = new Map<string, z.ZodTypeAny>();
  private readonly promptHandlers = new Map<string, PromptHandler>();
  private readonly resourceEntries = new Map<string, ResourceEntry>();

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

    const schema = this.schemas.get(name);
    if (schema) {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        if (options.validate) {
          return {
            content: [{ type: 'text', text: `Validation error: ${parsed.error.message}` }],
            isError: true,
          };
        }
      } else {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerResource(name: string, uriOrTemplate: any, _config: unknown, handler: ResourceHandler): void {
    if (typeof uriOrTemplate === 'string') {
      this.resourceEntries.set(uriOrTemplate, { handler });
    } else {
      // ResourceTemplate — uriTemplate getter returns a UriTemplate object; .toString() gives the pattern string
      const templateStr: string = uriOrTemplate.uriTemplate?.toString() ?? name;
      this.resourceEntries.set(templateStr, { handler, template: templateStr });
    }
  }

  async callResource(uri: string): Promise<ResourceResult> {
    const exact = this.resourceEntries.get(uri);
    if (exact) return exact.handler(new URL(uri), {});

    for (const entry of this.resourceEntries.values()) {
      if (!entry.template) continue;
      const variables = matchTemplate(entry.template, uri);
      if (variables) return entry.handler(new URL(uri), variables);
    }

    throw new Error(`Resource not registered: ${uri}`);
  }

  hasResourceRegistered(uri: string): boolean {
    return this.resourceEntries.has(uri);
  }

  registeredResourceUris(): string[] {
    return [...this.resourceEntries.keys()];
  }
}
