# MantisBT MCP Server

[![npm version](https://img.shields.io/npm/v/@dpesch/mantisbt-mcp-server)](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server)
[![license](https://img.shields.io/npm/l/@dpesch/mantisbt-mcp-server)](LICENSE)

Ein [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) Server, der die [MantisBT REST API](https://documenter.getpostman.com/view/29959/mantis-bug-tracker-rest-api) in Claude Code und andere MCP-fähige Clients integriert. Issues lesen, erstellen und bearbeiten – direkt aus dem Editor heraus.

## Voraussetzungen

- Node.js ≥ 18
- MantisBT-Installation mit aktivierter REST-API (ab Version 2.23)
- MantisBT API-Token (unter *Mein Konto → API-Token* erstellen)

## Installation

**Via npx (empfohlen):**

In `~/.claude/claude_desktop_config.json` (Claude Desktop) oder der lokalen
`claude_desktop_config.json` (Claude Code) eintragen:

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "npx",
      "args": ["-y", "@dpesch/mantisbt-mcp-server"],
      "env": {
        "MANTIS_BASE_URL": "https://deine-mantis-instanz.example.com/api/rest",
        "MANTIS_API_KEY": "dein-api-token"
      }
    }
  }
}
```

**Lokaler Build:**

```bash
git clone https://codeberg.org/dpesch/mantisbt-mcp-server
cd mantisbt-mcp-server
npm install
npm run build
```

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "node",
      "args": ["/pfad/zum/mantisbt-mcp-server/dist/index.js"],
      "env": {
        "MANTIS_BASE_URL": "https://deine-mantis-instanz.example.com/api/rest",
        "MANTIS_API_KEY": "dein-api-token"
      }
    }
  }
}
```

## Konfiguration

### Umgebungsvariablen

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `MANTIS_BASE_URL` | ✅ | – | Basis-URL der MantisBT REST API |
| `MANTIS_API_KEY` | ✅ | – | API-Token für die Authentifizierung |
| `MANTIS_CACHE_DIR` | – | `~/.cache/mantisbt-mcp` | Verzeichnis für den Metadaten-Cache |
| `MANTIS_CACHE_TTL` | – | `3600` | Cache-Lebensdauer in Sekunden |
| `TRANSPORT` | – | `stdio` | Transport-Modus: `stdio` oder `http` |
| `PORT` | – | `3000` | Port für HTTP-Modus |
| `MANTIS_SEARCH_ENABLED` | – | `false` | Auf `true` setzen, um die semantische Suche zu aktivieren |
| `MANTIS_SEARCH_BACKEND` | – | `vectra` | Vektorspeicher: `vectra` (reines JS) oder `sqlite-vec` (manuelle Installation erforderlich) |
| `MANTIS_SEARCH_DIR` | – | `{MANTIS_CACHE_DIR}/search` | Verzeichnis für den Suchindex |
| `MANTIS_SEARCH_MODEL` | – | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Embedding-Modell (wird beim ersten Start einmalig heruntergeladen, ~80 MB) |

### Config-Datei (Fallback)

Falls keine Umgebungsvariablen gesetzt sind, wird `~/.claude/mantis.json` ausgelesen:

```json
{
  "base_url": "https://deine-mantis-instanz.example.com/api/rest",
  "api_key": "dein-api-token"
}
```

## Verfügbare Tools

### Issues

| Tool | Beschreibung |
|---|---|
| `get_issue` | Ein Issue anhand seiner ID abrufen |
| `list_issues` | Issues nach Projekt, Status, Autor u.v.m. filtern; optionales `select` für Feldprojektion und `status` für clientseitige Statusfilterung |
| `create_issue` | Neues Issue anlegen |
| `update_issue` | Bestehendes Issue bearbeiten |
| `delete_issue` | Issue löschen |

### Notizen

| Tool | Beschreibung |
|---|---|
| `list_notes` | Alle Notizen eines Issues auflisten |
| `add_note` | Notiz zu einem Issue hinzufügen |
| `delete_note` | Notiz löschen |

### Anhänge

| Tool | Beschreibung |
|---|---|
| `list_issue_files` | Anhänge eines Issues auflisten |
| `upload_file` | Datei an ein Issue anhängen – entweder per lokalem `file_path` oder Base64-kodiertem `content` + `filename` |

### Beziehungen

| Tool | Beschreibung |
|---|---|
| `add_relationship` | Beziehung zwischen zwei Issues erstellen |
| `remove_relationship` | Beziehung von einem Issue entfernen (die `id` aus dem Beziehungsobjekt verwenden, nicht die type-ID) |

### Beobachter

| Tool | Beschreibung |
|---|---|
| `add_monitor` | Sich selbst als Beobachter eines Issues eintragen |
| `remove_monitor` | Benutzer als Beobachter eines Issues austragen |

### Tags

| Tool | Beschreibung |
|---|---|
| `list_tags` | Alle verfügbaren Tags auflisten |
| `attach_tags` | Tags an ein Issue hängen |
| `detach_tag` | Tag von einem Issue entfernen |

### Projekte

| Tool | Beschreibung |
|---|---|
| `list_projects` | Alle zugänglichen Projekte auflisten |
| `get_project_versions` | Versionen eines Projekts abrufen |
| `get_project_categories` | Kategorien eines Projekts abrufen |
| `get_project_users` | Benutzer eines Projekts abrufen |

### Semantische Suche *(optional)*

Aktivierung mit `MANTIS_SEARCH_ENABLED=true`. Beim ersten Start wird das Embedding-Modell (~80 MB) heruntergeladen und lokal gecacht. Alle Issues werden danach bei jedem Serverstart inkrementell indexiert.

| Tool | Beschreibung |
|---|---|
| `search_issues` | Natürlichsprachige Suche über alle indizierten Issues – liefert Top-N-Ergebnisse mit Cosine-Similarity-Score |
| `rebuild_search_index` | Suchindex aufbauen oder aktualisieren; `full: true` löscht und baut ihn vollständig neu |

**`sqlite-vec`-Backend** (optional, schneller bei großen Instanzen):
```bash
npm install sqlite-vec better-sqlite3
# dann MANTIS_SEARCH_BACKEND=sqlite-vec setzen
```

### Metadaten & System

| Tool | Beschreibung |
|---|---|
| `get_issue_fields` | Alle gültigen Feldnamen für den `select`-Parameter von `list_issues` zurückgeben |
| `get_metadata` | Gecachte Metadaten abrufen (Projekte, Benutzer, Versionen, Kategorien) |
| `sync_metadata` | Metadaten-Cache neu befüllen |
| `list_filters` | Gespeicherte Filter auflisten |
| `get_current_user` | Eigenes Benutzerprofil abrufen |
| `list_languages` | Verfügbare Sprachen auflisten |
| `get_config` | Server-Konfiguration (Basis-URL, Cache-TTL) anzeigen |
| `get_mantis_version` | MantisBT-Version abrufen und auf Updates prüfen |

## HTTP-Modus

Für den Einsatz als eigenständiger Server (z.B. in Remote-Setups):

```bash
MANTIS_BASE_URL=... MANTIS_API_KEY=... TRANSPORT=http PORT=3456 node dist/index.js
```

Healthcheck: `GET http://localhost:3456/health`

## Entwicklung

```bash
npm install          # Abhängigkeiten installieren
npm run build        # TypeScript → dist/ kompilieren
npm run typecheck    # Typprüfung ohne Ausgabe
npm run dev          # Watch-Modus für Entwicklung
npm test             # Tests ausführen (vitest)
npm run test:watch   # Tests im Watch-Modus
npm run test:coverage # Coverage-Report
```

## Lizenz

MIT – siehe [LICENSE](LICENSE)

## Mitwirken

Beiträge willkommen! Bitte [CONTRIBUTING.md](CONTRIBUTING.md) lesen.
Repository: [codeberg.org/dpesch/mantisbt-mcp-server](https://codeberg.org/dpesch/mantisbt-mcp-server)
