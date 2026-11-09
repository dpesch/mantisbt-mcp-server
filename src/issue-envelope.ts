import type { MantisIssue } from './types.js';

/**
 * MantisBT wraps issues in its responses: GET and PATCH /issues/{id} answer
 * { issues: [issue] }, POST /issues answers { issue }.
 */
export type IssueEnvelope = { issues?: MantisIssue[]; issue?: MantisIssue };

/** The issue from a MantisBT issue response, whichever of the two envelopes it uses. */
export function firstIssue(response: IssueEnvelope | undefined): MantisIssue | undefined {
  return response?.issues?.[0] ?? response?.issue;
}
