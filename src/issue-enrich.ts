import { buildAttachmentDownloadUrl, buildIssueViewUrl, buildNoteViewUrl } from './client.js';
import type { MantisIssue } from './types.js';

/**
 * Adds the links MantisBT's REST API leaves out: view_url for the issue and
 * each note, download_url for each attachment (REST sends it only via SOAP).
 * issueId is the fallback when a select projection excluded the id field.
 */
export function enrichIssue(issue: MantisIssue, baseUrl: string, issueId?: number): MantisIssue {
  const id = issue.id ?? issueId;
  if (id === undefined) return issue;
  return {
    ...issue,
    view_url: buildIssueViewUrl(baseUrl, id),
    notes: issue.notes?.map(note => ({
      ...note,
      view_url: buildNoteViewUrl(baseUrl, id, note.id),
    })),
    attachments: issue.attachments?.map(file => ({
      ...file,
      download_url: buildAttachmentDownloadUrl(baseUrl, file.id),
    })),
  };
}
