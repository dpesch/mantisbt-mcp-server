import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MantisClient } from '../src/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// .env.local laden (falls vorhanden)
// ---------------------------------------------------------------------------

try {
  const envPath = join(__dirname, '..', '.env.local');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
} catch {
  // .env.local nicht vorhanden – ENV-Vars direkt nutzen
}

// ---------------------------------------------------------------------------
// Config aus ENV
// ---------------------------------------------------------------------------

const baseUrlRaw = process.env['MANTIS_BASE_URL'];
const apiKey = process.env['MANTIS_API_KEY'];

if (!baseUrlRaw || !apiKey) {
  console.error('Error: MANTIS_BASE_URL and MANTIS_API_KEY environment variables must be set.');
  process.exit(1);
}

const baseUrl = baseUrlRaw.replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Fixtures-Verzeichnis
// ---------------------------------------------------------------------------

const fixturesDir = join(__dirname, '..', 'tests', 'fixtures', 'recorded');
mkdirSync(fixturesDir, { recursive: true });

function saveFixture(filename: string, data: unknown): void {
  const filePath = join(fixturesDir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`Saved: ${filePath}`);
}

// ---------------------------------------------------------------------------
// Client instanziieren
// ---------------------------------------------------------------------------

const client = new MantisClient(baseUrl, apiKey);

// ---------------------------------------------------------------------------
// Fixtures aufzeichnen
// ---------------------------------------------------------------------------

async function recordFixtures(): Promise<void> {
  // GET projects
  let firstProjectId: number | undefined;
  let projectIdWithVersions: number | undefined;
  try {
    const projectsResult = await client.get<{ projects: Array<{ id: number; name: string; versions?: unknown[] }> }>('projects');
    saveFixture('list_projects.json', projectsResult);
    if (Array.isArray(projectsResult.projects) && projectsResult.projects.length > 0) {
      firstProjectId = projectsResult.projects[0]?.id;
      // Erstes Projekt mit nicht-leeren Versionen bevorzugen
      projectIdWithVersions = projectsResult.projects.find(
        (p) => Array.isArray(p.versions) && p.versions.length > 0,
      )?.id ?? firstProjectId;
    }
  } catch (err) {
    console.error('Failed to fetch projects:', err instanceof Error ? err.message : String(err));
  }

  // GET users/me
  try {
    const userResult = await client.get<unknown>('users/me');
    saveFixture('get_current_user.json', userResult);
  } catch (err) {
    console.error('Failed to fetch users/me:', err instanceof Error ? err.message : String(err));
  }

  // GET issues?page=1&page_size=3
  let firstIssueId: number | undefined;
  try {
    const issuesResult = await client.get<{ issues: Array<{ id: number }> }>('issues', {
      page: 1,
      page_size: 3,
    });
    saveFixture('list_issues.json', issuesResult);
    if (Array.isArray(issuesResult.issues) && issuesResult.issues.length > 0) {
      firstIssueId = issuesResult.issues[0]?.id;
    }
  } catch (err) {
    console.error('Failed to fetch issues:', err instanceof Error ? err.message : String(err));
  }

  // GET issues?page=1&page_size=1 — single issue sample for get_issue_fields field discovery
  try {
    const sampleResult = await client.get<{ issues: unknown[] }>('issues', {
      page: 1,
      page_size: 1,
    });
    saveFixture('get_issue_fields_sample.json', sampleResult);
  } catch (err) {
    console.error('Failed to fetch issues sample:', err instanceof Error ? err.message : String(err));
  }

  // GET issues/{id}
  if (firstIssueId !== undefined) {
    try {
      const issueResult = await client.get<unknown>(`issues/${firstIssueId}`);
      saveFixture('get_issue.json', issueResult);
    } catch (err) {
      console.error(`Failed to fetch issues/${firstIssueId}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // GET projects/{id}/versions + categories
  if (firstProjectId !== undefined) {
    const versionProjectId = projectIdWithVersions ?? firstProjectId;
    try {
      const versionsResult = await client.get<unknown>(`projects/${versionProjectId}/versions`);
      saveFixture('get_project_versions.json', versionsResult);
    } catch (err) {
      console.error(`Failed to fetch projects/${versionProjectId}/versions:`, err instanceof Error ? err.message : String(err));
    }

    try {
      const projectResult = await client.get<{ projects: Array<{ categories?: unknown[] }> }>(`projects/${firstProjectId}`);
      saveFixture('get_project_categories.json', { categories: projectResult.projects?.[0]?.categories ?? [] });
    } catch (err) {
      console.error(`Failed to fetch projects/${firstProjectId} (categories):`, err instanceof Error ? err.message : String(err));
    }
  }
}

recordFixtures().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
