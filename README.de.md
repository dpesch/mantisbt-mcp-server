# MantisBT MCP Server

[![npm version](https://img.shields.io/npm/v/@dpesch/mantisbt-mcp-server)](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server)
[![license](https://img.shields.io/npm/l/@dpesch/mantisbt-mcp-server)](LICENSE)
[![MantisBT MCP Server](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server)

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
npm run init
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
| `MCP_HTTP_HOST` | – | `127.0.0.1` | Bind-Adresse für HTTP-Modus. **Geändert von `0.0.0.0` auf `127.0.0.1`** — der Server horcht standardmäßig nur auf localhost. Für Docker oder Remote-Zugriff `0.0.0.0` setzen. |
| `MCP_HTTP_TOKEN` | – | – | Wenn gesetzt, muss jede `/mcp`-Anfrage den Header `Authorization: Bearer <token>` enthalten. `/health` ist immer öffentlich. |
| `MANTIS_SEARCH_ENABLED` | – | `false` | Auf `true` setzen, um die semantische Suche zu aktivieren |
| `MANTIS_SEARCH_BACKEND` | – | `vectra` | Vektorspeicher: `vectra` (reines JS) oder `sqlite-vec` (manuelle Installation erforderlich) |
| `MANTIS_SEARCH_DIR` | – | `{MANTIS_CACHE_DIR}/search` | Verzeichnis für den Suchindex |
| `MANTIS_SEARCH_MODEL` | – | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Embedding-Modell (wird beim ersten Start einmalig heruntergeladen, ~80 MB) |
| `MANTIS_SEARCH_THREADS` | – | `1` | Anzahl der ONNX-Intra-Op-Threads für das Embedding-Modell. Standard ist 1, um CPU-Sättigung auf Mehrkernsystemen und in WSL zu verhindern. Nur erhöhen, wenn die Indexierungsgeschwindigkeit kritisch ist und der Host ausschließlich für diese Last vorgesehen ist. |
| `MANTIS_UPLOAD_DIR` | – | – | Schränkt `upload_file` auf Dateien in diesem Verzeichnis ein. Wenn gesetzt, wird jeder `file_path` außerhalb des Verzeichnisses abgelehnt (Pfad-Traversal-Versuche via `../` werden blockiert). Ohne diese Variable gilt keine Einschränkung. |

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
| `create_issue` | Neues Issue anlegen; optionaler `handler`-Parameter akzeptiert einen Benutzernamen als Alternative zu `handler_id` (wird gegen die Projektmitglieder aufgelöst) |
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
| `add_relationship` | Beziehung zwischen zwei Issues erstellen; optionaler `type_name`-Parameter akzeptiert einen String-Namen (z.B. `"related_to"`, `"duplicate_of"`) als Alternative zur numerischen `type_id` |
| `remove_relationship` | Beziehung von einem Issue entfernen (die `id` aus dem Beziehungsobjekt verwenden, nicht die type-ID) |

### Beobachter

| Tool | Beschreibung |
|---|---|
| `add_monitor` | Sich selbst als Beobachter eines Issues eintragen |
| `remove_monitor` | Benutzer als Beobachter eines Issues austragen |

### Tags

| Tool | Beschreibung |
|---|---|
| `list_tags` | Alle verfügbaren Tags auflisten; greift auf den Metadaten-Cache zurück, wenn `GET /tags` mit 404 antwortet (vorher `sync_metadata` ausführen) |
| `attach_tags` | Tags an ein Issue hängen |
| `detach_tag` | Tag von einem Issue entfernen |

### Projekte

| Tool | Beschreibung |
|---|---|
| `list_projects` | Alle zugänglichen Projekte auflisten |
| `get_project_versions` | Versionen eines Projekts abrufen; optionale Booleans `obsolete` und `inherit` für veraltete bzw. vom Elternprojekt geerbte Versionen |
| `get_project_categories` | Kategorien eines Projekts abrufen |
| `get_project_users` | Benutzer eines Projekts abrufen |

### Semantische Suche *(optional)*

Statt einfachem Keyword-Matching versteht die semantische Suche die *Bedeutung* einer Anfrage. Formuliere in natürlicher Sprache — die Suche findet konzeptuell verwandte Issues, auch wenn die genauen Begriffe nicht übereinstimmen:

- *„Login funktioniert nach Passwort-Reset nicht"* — findet Issues rund um Authentifizierungsgrenzfälle
- *„Performance-Probleme auf der Checkout-Seite"* — liefert verwandte Meldungen unabhängig von der verwendeten Terminologie
- *„doppelte Einträge in der Rechnungsliste"* — erkennt auch Issues, die als „zweifach angezeigt", „dupliziert" o.ä. beschrieben sind

Das Embedding-Modell (~80 MB) läuft vollständig **offline** — kein OpenAI-Key, keine externe API. Es wird beim ersten Start einmalig heruntergeladen und lokal gecacht. Issues werden bei jedem Serverstart inkrementell indexiert (nur neue und geänderte Issues werden neu verarbeitet).

Aktivierung mit `MANTIS_SEARCH_ENABLED=true`.

| Tool | Beschreibung |
|---|---|
| `search_issues` | Natürlichsprachige Suche über alle indizierten Issues – liefert Top-N-Ergebnisse mit Cosine-Similarity-Score; optionales `select` (kommagetrennte Feldnamen) reichert jedes Ergebnis mit den angeforderten Issue-Feldern an |
| `rebuild_search_index` | Suchindex aufbauen oder aktualisieren; `full: true` löscht und baut ihn vollständig neu |
| `get_search_index_status` | Aktuellen Füllstand des Suchindex zurückgeben: wie viele Issues bereits indiziert sind im Verhältnis zur Gesamtanzahl, plus Zeitstempel der letzten Synchronisation |

#### Welches Backend wählen?

| | `vectra` *(Standard)* | `sqlite-vec` |
|---|---|---|
| Abhängigkeiten | Keine (reines JS) | Benötigt native Build-Tools |
| Installation | Enthalten | `npm install sqlite-vec better-sqlite3` |
| Geeignet für | Bis ~10.000 Issues | Ab 10.000 Issues |
| Performance | Für die meisten Instanzen ausreichend | Schneller bei großen Datenmengen |

Mit `vectra` starten. Zu `sqlite-vec` wechseln, wenn Indexierungszeiten oder Abfragen spürbar langsam werden.

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
| `get_issue_enums` | Gültige ID/Name-Paare für alle Enum-Felder zurückgeben (Severity, Status, Priority, Resolution, Reproducibility) — vor `create_issue` / `update_issue` verwenden, um korrekte Werte nachzuschlagen; auf lokalisierten Installationen kann jeder Eintrag ein `canonical_name`-Feld mit dem englischen Standard-API-Namen enthalten |
| `get_mantis_version` | MantisBT-Version abrufen und auf Updates prüfen |
| `get_mcp_version` | Version dieser mantisbt-mcp-server-Instanz zurückgeben |

## HTTP-Modus

Für den Einsatz als eigenständiger Server (z.B. in Remote-Setups):

```bash
MANTIS_BASE_URL=... MANTIS_API_KEY=... TRANSPORT=http PORT=3456 node dist/index.js

# Mit Token-Authentifizierung und expliziter Bind-Adresse (erforderlich für Docker/Remote):
# MCP_HTTP_TOKEN=secret MANTIS_BASE_URL=... MANTIS_API_KEY=... \
#   TRANSPORT=http PORT=3456 MCP_HTTP_HOST=0.0.0.0 node dist/index.js
```

Healthcheck: `GET http://localhost:3456/health` (immer öffentlich, kein Token erforderlich)

## Entwicklung

```bash
npm run init         # Ersteinrichtung: Abhängigkeiten, Git-Hooks, Typprüfung
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
