import { describe, it, expect, beforeEach } from 'vitest';
import { registerPrompts } from '../../src/prompts/index.js';
import { MockMcpServer } from '../helpers/mock-server.js';

let mockServer: MockMcpServer;

beforeEach(() => {
  mockServer = new MockMcpServer();
  registerPrompts(mockServer as never);
});

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('prompt registration', () => {
  it('registers create-bug-report', () => {
    expect(mockServer.hasPromptRegistered('create-bug-report')).toBe(true);
  });

  it('registers create-feature-request', () => {
    expect(mockServer.hasPromptRegistered('create-feature-request')).toBe(true);
  });

  it('registers summarize-issue', () => {
    expect(mockServer.hasPromptRegistered('summarize-issue')).toBe(true);
  });

  it('registers project-status', () => {
    expect(mockServer.hasPromptRegistered('project-status')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// create-bug-report
// ---------------------------------------------------------------------------

describe('create-bug-report', () => {
  it('returns a single user message', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 1,
      category: 'General',
      summary: 'Login fails',
      description: 'Cannot log in after password reset',
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('user');
    expect(result.messages[0]!.content.type).toBe('text');
  });

  it('includes project_id, category, summary, and description in the text', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 7,
      category: 'Authentication',
      summary: 'Session expires too early',
      description: 'Session is invalidated after 5 minutes of inactivity',
    });

    const text = result.messages[0]!.content.text;
    expect(text).toContain('project 7');
    expect(text).toContain('Authentication');
    expect(text).toContain('Session expires too early');
    expect(text).toContain('Session is invalidated after 5 minutes');
  });

  it('includes optional steps_to_reproduce when provided', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 1,
      category: 'General',
      summary: 'Bug',
      description: 'Desc',
      steps_to_reproduce: '1. Open app\n2. Click login',
    });

    expect(result.messages[0]!.content.text).toContain('Steps to reproduce');
    expect(result.messages[0]!.content.text).toContain('1. Open app');
  });

  it('omits optional sections when not provided', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 1,
      category: 'General',
      summary: 'Bug',
      description: 'Desc',
    });

    const text = result.messages[0]!.content.text;
    expect(text).not.toContain('Steps to reproduce');
    expect(text).not.toContain('Expected behavior');
    expect(text).not.toContain('Actual behavior');
    expect(text).not.toContain('Environment');
  });

  it('includes all optional fields when provided', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 1,
      category: 'UI',
      summary: 'Button broken',
      description: 'Save button does nothing',
      steps_to_reproduce: 'Click Save',
      expected: 'Form is saved',
      actual: 'Nothing happens',
      environment: 'Chrome 120, Windows 11',
    });

    const text = result.messages[0]!.content.text;
    expect(text).toContain('Steps to reproduce');
    expect(text).toContain('Expected behavior');
    expect(text).toContain('Actual behavior');
    expect(text).toContain('Environment');
    expect(text).toContain('Chrome 120');
  });

  it('mentions create_issue tool', () => {
    const result = mockServer.callPrompt('create-bug-report', {
      project_id: 1,
      category: 'General',
      summary: 'Bug',
      description: 'Desc',
    });

    expect(result.messages[0]!.content.text).toContain('create_issue');
  });
});

// ---------------------------------------------------------------------------
// create-feature-request
// ---------------------------------------------------------------------------

describe('create-feature-request', () => {
  it('returns a single user message', () => {
    const result = mockServer.callPrompt('create-feature-request', {
      project_id: 2,
      category: 'General',
      summary: 'Dark mode',
      description: 'Add a dark mode toggle to the UI',
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('user');
  });

  it('includes project_id, category, summary, and description', () => {
    const result = mockServer.callPrompt('create-feature-request', {
      project_id: 5,
      category: 'UX',
      summary: 'Export to CSV',
      description: 'Allow exporting issue lists as CSV',
    });

    const text = result.messages[0]!.content.text;
    expect(text).toContain('project 5');
    expect(text).toContain('UX');
    expect(text).toContain('Export to CSV');
    expect(text).toContain('Allow exporting issue lists');
  });

  it('includes use_case when provided', () => {
    const result = mockServer.callPrompt('create-feature-request', {
      project_id: 1,
      category: 'General',
      summary: 'Feature',
      description: 'Desc',
      use_case: 'Needed for monthly reporting',
    });

    expect(result.messages[0]!.content.text).toContain('Needed for monthly reporting');
  });

  it('omits use_case section when not provided', () => {
    const result = mockServer.callPrompt('create-feature-request', {
      project_id: 1,
      category: 'General',
      summary: 'Feature',
      description: 'Desc',
    });

    expect(result.messages[0]!.content.text).not.toContain('Use case');
  });

  it('mentions create_issue tool', () => {
    const result = mockServer.callPrompt('create-feature-request', {
      project_id: 1,
      category: 'General',
      summary: 'Feature',
      description: 'Desc',
    });

    expect(result.messages[0]!.content.text).toContain('create_issue');
  });
});

// ---------------------------------------------------------------------------
// summarize-issue
// ---------------------------------------------------------------------------

describe('summarize-issue', () => {
  it('returns a single user message', () => {
    const result = mockServer.callPrompt('summarize-issue', { issue_id: 42 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('user');
  });

  it('includes the issue ID in the text', () => {
    const result = mockServer.callPrompt('summarize-issue', { issue_id: 1234 });

    expect(result.messages[0]!.content.text).toContain('1234');
  });

  it('mentions get_issue tool', () => {
    const result = mockServer.callPrompt('summarize-issue', { issue_id: 1 });

    expect(result.messages[0]!.content.text).toContain('get_issue');
  });
});

// ---------------------------------------------------------------------------
// project-status
// ---------------------------------------------------------------------------

describe('project-status', () => {
  it('returns a single user message', () => {
    const result = mockServer.callPrompt('project-status', { project_id: 3 });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.role).toBe('user');
  });

  it('includes the project ID in the text', () => {
    const result = mockServer.callPrompt('project-status', { project_id: 99 });

    expect(result.messages[0]!.content.text).toContain('99');
  });

  it('mentions list_issues tool', () => {
    const result = mockServer.callPrompt('project-status', { project_id: 1 });

    expect(result.messages[0]!.content.text).toContain('list_issues');
  });
});
