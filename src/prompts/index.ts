import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {

  // ---------------------------------------------------------------------------
  // create-bug-report
  // ---------------------------------------------------------------------------

  server.registerPrompt(
    'create-bug-report',
    {
      title: 'Create Bug Report',
      description: 'Guide the creation of a complete bug report in MantisBT. Project, category, summary, and description are required.',
      argsSchema: {
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
        category: z.string().describe('Issue category (call get_project_categories to list valid values)'),
        summary: z.string().describe('Short, descriptive summary of the bug'),
        description: z.string().describe('Detailed description of the bug'),
        steps_to_reproduce: z.string().optional().describe('Step-by-step reproduction instructions'),
        expected: z.string().optional().describe('Expected behavior'),
        actual: z.string().optional().describe('Actual (buggy) behavior'),
        environment: z.string().optional().describe('Environment info (OS, browser, version, etc.)'),
      },
    },
    ({ project_id, category, summary, description, steps_to_reproduce, expected, actual, environment }) => {
      const lines: string[] = [
        `Create a bug report in MantisBT for project ${project_id}.`,
        ``,
        `Category: ${category}`,
        `Summary: ${summary}`,
        ``,
        `Description:`,
        description,
      ];

      if (steps_to_reproduce) {
        lines.push(``, `Steps to reproduce:`, steps_to_reproduce);
      }
      if (expected) {
        lines.push(``, `Expected behavior:`, expected);
      }
      if (actual) {
        lines.push(``, `Actual behavior:`, actual);
      }
      if (environment) {
        lines.push(``, `Environment:`, environment);
      }

      lines.push(
        ``,
        `Use the create_issue tool to submit this bug report.`,
        `Call get_issue_enums first if you need to look up valid severity and priority values.`,
        `Default to severity "minor" and priority "normal" unless the user specifies otherwise.`,
      );

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: lines.join('\n') },
        }],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // create-feature-request
  // ---------------------------------------------------------------------------

  server.registerPrompt(
    'create-feature-request',
    {
      title: 'Create Feature Request',
      description: 'Guide the creation of a feature request in MantisBT. Project, category, summary, and description are required.',
      argsSchema: {
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
        category: z.string().describe('Issue category (call get_project_categories to list valid values)'),
        summary: z.string().describe('Short description of the requested feature'),
        description: z.string().describe('Detailed description of the feature'),
        use_case: z.string().optional().describe('Business use case or motivation for the feature'),
      },
    },
    ({ project_id, category, summary, description, use_case }) => {
      const lines: string[] = [
        `Create a feature request in MantisBT for project ${project_id}.`,
        ``,
        `Category: ${category}`,
        `Summary: ${summary}`,
        ``,
        `Description:`,
        description,
      ];

      if (use_case) {
        lines.push(``, `Use case / motivation:`, use_case);
      }

      lines.push(
        ``,
        `Use the create_issue tool to submit this feature request.`,
        `Call get_issue_enums first to look up valid severity values — use severity "feature" and priority "normal" unless the user specifies otherwise.`,
      );

      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: lines.join('\n') },
        }],
      };
    },
  );

  // ---------------------------------------------------------------------------
  // summarize-issue
  // ---------------------------------------------------------------------------

  server.registerPrompt(
    'summarize-issue',
    {
      title: 'Summarize Issue',
      description: 'Fetch a MantisBT issue and provide a concise summary of its status, details, and recent activity.',
      argsSchema: {
        issue_id: z.coerce.number().int().positive().describe('Numeric issue ID'),
      },
    },
    ({ issue_id }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Fetch issue #${issue_id} using the get_issue tool and provide a concise summary.`,
            `Include: status, assignee, severity, priority, description, and any recent notes.`,
            `Highlight blockers, unresolved questions, or anything that requires attention.`,
          ].join('\n'),
        },
      }],
    }),
  );

  // ---------------------------------------------------------------------------
  // project-status
  // ---------------------------------------------------------------------------

  server.registerPrompt(
    'project-status',
    {
      title: 'Project Status Report',
      description: 'Generate a status overview of open issues for a MantisBT project, grouped by severity.',
      argsSchema: {
        project_id: z.coerce.number().int().positive().describe('Numeric project ID'),
      },
    },
    ({ project_id }) => ({
      messages: [{
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: [
            `Use the list_issues tool to fetch open issues for MantisBT project ${project_id}.`,
            `Produce a status report that includes:`,
            `- Total count of open issues`,
            `- Breakdown by severity (critical and major issues first)`,
            `- Breakdown by assignee`,
            `- A short list of the most critical or longest-open issues that need attention`,
          ].join('\n'),
        },
      }],
    }),
  );
}
