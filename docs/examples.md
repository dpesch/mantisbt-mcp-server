# Usage Examples

Practical examples of how to interact with MantisBT through Claude once the MCP server is connected. Just ask in natural language — no tool names or parameters required. For exact tool calls and parameters, see the [Cookbook](cookbook.md).

---

## Everyday Use Cases

### Browsing and searching issues

> "Show me all open issues in the Webshop project."

> "What bugs are currently assigned to me?"

> "List the unresolved issues with priority 'urgent' in the Backend project."

> "What's the status of issue #1042?"

> "Show me all issues reported by jsmith this month."

> "Which issues in the Webshop project are blocking the 2.4.0 release?"

---

### Creating issues

> "Create a bug report: on the checkout page, clicking 'Place order' twice submits the order twice. Category: Shop, severity: major."

> "Open a new issue in the API project — the token refresh endpoint returns 500 when the refresh token has expired. Assign it to the backend team."

> "Create a feature request in the Frontend project for a dark mode in the user settings. Low priority, no due date."

---

### Updating issues

> "Mark issue #1042 as resolved."

> "Reassign issue #887 to jdoe."

> "Change the severity of #1099 to 'major' and add a note: reproduced on production."

> "Set the fix version of issues #901 and #902 to 2.4.1."

---

### Notes and comments

> "Add a comment to #1042: fix deployed to staging, awaiting QA sign-off."

> "Show me all notes on issue #774."

> "Add a private note to #512: customer reference AC-2291, do not disclose."

---

### Attachments

> "Attach the file /tmp/error.log to issue #1042."

> "What files are attached to issue #930?"

---

### Relationships

> "Mark issue #1044 as a duplicate of #1042."

> "Link #901 and #902 as related issues."

> "Issue #1100 blocks #1101 — please create that relationship."
> *(direction matters: #1100 is the blocking issue)*

---

### Tags

> "Tag issue #1042 with 'regression' and 'hotfix'."

> "Remove the 'wontfix' tag from issue #887."

> "Which tags are available in this MantisBT instance?"

---

### Project metadata

> "Which projects do I have access to?"

> "What versions are defined in the Webshop project?"

> "List all categories in the Backend project."

> "Who are the members of the API project?"

---

### Triage and reporting

> "Give me an overview of all critical and urgent open issues across all projects."

> "Which issues in the Backend project have been open for more than 30 days without any activity?"

> "What are the most common types of bugs reported in the last six months?"

> "Summarise the notes on issue #774 and suggest a next step."

> "List all issues tagged 'regression' and summarise what went wrong."

---

## Guided Prompt Workflows

The server ships with prompt templates that guide Claude through structured workflows — no need to specify tool names or parameters manually. Invoke them by name from a MCP-capable client.

### Creating issues from a prompt template

> "Use the `create-bug-report` prompt to file the Safari login issue: project 3, category UI, summary 'Login button unresponsive on mobile Safari', description 'Tapping login on iPhone 14 / Safari 17 does nothing', steps: open login page → tap Login → nothing happens, expected: redirect to dashboard, actual: form stays open."

> "Use `create-feature-request` for project 5, category UX: add a dark mode toggle to the settings page."

### Summarizing and reporting

> "Run the `summarize-issue` prompt for issue #1042."

> "Use the `project-status` prompt for project 3 to get an overview of open issues grouped by severity."

---

## Semantic Search

Semantic search understands the *meaning* of your question — not just keywords. It finds conceptually related issues even when the exact wording differs. Enable it with `MANTIS_SEARCH_ENABLED=true`.

### Duplicate detection before filing a report

> "Before I create a new issue: has anyone reported a problem with the login form after a password reset?"

> "Is there already a ticket about slow PDF generation for large invoices?"

> "Search for issues similar to: 'user session is lost when switching browser tabs'."

---

### Thematic overviews

> "Show me relevant issues related to payment processing — across all projects."

> "Show me examples of reported email delivery failures."

> "Which issues mention performance problems on mobile devices?"

---

### Fuzzy / terminology-independent search

> "Find issues about 'duplicate entries' — they might also be described as 'shown twice', 'double records', or 'phantom rows'."

> "Search for authentication-related issues — the reports might use 'login', 'sign-in', 'token', 'session', or 'auth'."

---

### Cross-project research

> "Is the image upload bug we fixed in the Webshop also reported in the Mobile project?"

> "Which projects have open issues related to GDPR or data export?"

---

### Onboarding and knowledge transfer

> "Show me tickets that explain why the authentication flow was built this way."

> "Are there any known pitfalls when setting up the deployment pipeline?"

> "Which issues describe problems that occur during initial environment setup?"

---

## Resources

MCP Resources are URI-addressable, read-only data that clients can fetch directly by URI — no tool invocation required. Resource support varies by client; if your client does not support Resources, use the equivalent tool instead.

### Reading server state via resources

> "Read `mantis://me` to see which account the MCP server is using."

> "Fetch `mantis://projects` to get the list of available projects."

> "Load `mantis://enums` to see valid severity and priority values before creating an issue."

### Equivalent tool fallbacks

If your client does not support Resources, ask Claude to use the corresponding tool:

> "Show me my user profile." *(uses `get_current_user`)*

> "Which projects are available?" *(uses `list_projects`)*

> "What are the valid priority values?" *(uses `get_issue_enums`)*
