# MantisBT MCP Server

[![npm version](https://img.shields.io/npm/v/@dpesch/mantisbt-mcp-server)](https://www.npmjs.com/package/@dpesch/mantisbt-mcp-server)
[![license](https://img.shields.io/npm/l/@dpesch/mantisbt-mcp-server)](LICENSE)
[![MCP compatible](https://img.shields.io/badge/MCP-compatible-green.svg?style=flat-square)](https://modelcontextprotocol.io/)
[![MCP Badge](https://lobehub.com/badge/mcp/dpesch-mantisbt-mcp-server)](https://lobehub.com/mcp/dpesch-mantisbt-mcp-server)
[![MantisBT MCP Server](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server/badges/card.svg)](https://glama.ai/mcp/servers/dpesch/mantisbt-mcp-server)

[English](README.md) · **Deutsch**

Ein [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) Server, der die [MantisBT REST API](https://documenter.getpostman.com/view/29959/mantis-bug-tracker-rest-api) in Claude Code und andere MCP-fähige Clients integriert. Issues lesen, erstellen und bearbeiten – direkt aus dem Editor heraus.

## Voraussetzungen

- Node.js ≥ 22
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
| `MANTIS_BASE_URL` | ✅ | – | Basis-URL der MantisBT-Installation. Beide Formate werden akzeptiert: `https://deine-mantis-instanz.example.com` und `https://deine-mantis-instanz.example.com/api/rest` – das `/api/rest`-Suffix wird automatisch normalisiert. |
| `MANTIS_API_KEY` | ✅ | – | API-Token für die Authentifizierung |
| `MANTIS_USE_INDEX_PHP` | – | auto | Auf `true` setzen, wenn URL-Rewriting nicht verfügbar ist – REST-Anfragen verwenden dann `/api/rest/index.php/` statt `/api/rest/`. Wird automatisch erkannt, wenn `MANTIS_BASE_URL` auf `/api/rest/index.php` endet; ein explizit gesetzter Wert hat immer Vorrang. Siehe [Cookbook](docs/cookbook.de.md#installation-ohne-url-rewriting-anbinden). |
| `MANTIS_CACHE_DIR` | – | `~/.cache/mantisbt-mcp` | Verzeichnis für den Metadaten-Cache |
| `MANTIS_CACHE_TTL` | – | `3600` | Cache-Lebensdauer in Sekunden |
| `TRANSPORT` | – | `stdio` | Transport-Modus: `stdio` oder `http` |
| `PORT` | – | `3000` | Port für HTTP-Modus |
| `MCP_HTTP_HOST` | – | `127.0.0.1` | Bind-Adresse für HTTP-Modus. **Geändert von `0.0.0.0` auf `127.0.0.1`** – der Server horcht standardmäßig nur auf localhost. Für Docker oder Remote-Zugriff `0.0.0.0` setzen. |
| `MCP_HTTP_TOKEN` | ✅ (HTTP-Modus) | – | Bearer-Token für den `/mcp`-Endpunkt (`Authorization: Bearer <token>`). **Pflicht bei `TRANSPORT=http`** – der Server startet im HTTP-Modus ohne diesen Wert nicht, damit Tools nie unauthentifiziert erreichbar sind. Im stdio-Modus ohne Bedeutung. `/health` ist immer öffentlich. |
| `MANTIS_SEARCH_ENABLED` | – | `false` | Auf `true` setzen, um die semantische Suche zu aktivieren |
| `MANTIS_SEARCH_BACKEND` | – | `vectra` | Vektorspeicher: `vectra` (reines JS) oder `sqlite-vec` (manuelle Installation erforderlich) |
| `MANTIS_SEARCH_DIR` | – | `{MANTIS_CACHE_DIR}/search` | Verzeichnis für den Suchindex |
| `MANTIS_SEARCH_MODEL` | – | `Xenova/paraphrase-multilingual-MiniLM-L12-v2` | Embedding-Modell (wird beim ersten Start einmalig heruntergeladen, ~80 MB). Nach einem Wechsel baut der nächste Sync den Index von selbst neu auf. |
| `MANTIS_SEARCH_THREADS` | – | `1` | Anzahl der ONNX-Intra-Op-Threads für das Embedding-Modell. Standard ist 1, um CPU-Sättigung auf Mehrkernsystemen und in WSL zu verhindern. Auf Rechnern mit 4 oder mehr Kernen ist `4` ein guter Wert: Ein vollständiger Neuaufbau von 7.700 Issues dauerte damit 160 s statt 377 s mit 1 Thread. Die Einstellung beschleunigt vor allem das Indexieren; eine Suchanfrage ist ein einzelner kurzer Text und profitiert kaum. Wirksam ab 1.16.0 – frühere Versionen haben die Einstellung ignoriert und immer alle Kerne genutzt. |
| `MANTIS_UPLOAD_DIR` | – | – | Schränkt den `file_path` von `upload_file` auf dieses Verzeichnis ein (Pfad-Traversal via `../` wird blockiert). Im **stdio-Modus** ist `file_path` ohne diese Variable unbeschränkt. Im **HTTP-Modus** liest `file_path` aus dem Dateisystem des Servers und ist deshalb **deaktiviert, sofern diese Variable nicht gesetzt ist** – HTTP-Clients sollten stattdessen den Parameter `content` (Base64) verwenden. |
| `MANTIS_TOOLSETS` | – | – (alle) | Kommagetrennte Liste der anzubietenden Tool-Gruppen: `issues`, `notes`, `links`, `files`, `projects`, `versions`, `meta`, `search` (Groß-/Kleinschreibung egal). Nicht gesetzt oder leer bedeutet alle Gruppen. Die Gruppe `search` erfordert zusätzlich `MANTIS_SEARCH_ENABLED=true`; ohne die Gruppe wird das Such-Modul gar nicht gestartet. Ein unbekannter Gruppenname stoppt den Server beim Start mit einer Meldung, die die gültigen Namen auflistet. Siehe [Angebotene Tools einschränken](#angebotene-tools-einschränken) und das [Cookbook](docs/cookbook.de.md#nur-bestimmte-tool-gruppen-anbieten). |
| `MANTIS_DISABLE_DESTRUCTIVE` | – | `false` | Auf `true` setzen, um alle destruktiven Tools auszublenden – `delete_issue`, `delete_note`, `delete_version`, `remove_relationship`, `remove_monitor` – unabhängig von den aktiven Gruppen. Ausgeblendete Tools werden nicht aufgelistet und liefern »Tool … not found«, wenn sie aufgerufen werden. |

### Angebotene Tools einschränken

Zwei Umgebungsvariablen reduzieren die dem Modell angebotene Tool-Oberfläche – sinnvoll, um den Kontext des Modells kürzer zu halten und versehentliche destruktive Operationen zu verhindern:

- **`MANTIS_TOOLSETS`** – nur die aufgelisteten Gruppen einbinden (kommagetrennt, Groß-/Kleinschreibung egal)
- **`MANTIS_DISABLE_DESTRUCTIVE=true`** – zusätzlich `delete_issue`, `delete_note`, `delete_version`, `remove_relationship` und `remove_monitor` ausblenden, unabhängig von den aktiven Gruppen

Ausgeblendete Tools werden nicht aufgelistet und liefern »Tool … not found«, wenn sie aufgerufen werden.

| Gruppe | Tools |
|---|---|
| `issues` | `get_issue`, `list_issues`, `create_issue`, `update_issue`, `delete_issue`¹, `get_issues`†, `list_notes`†, `list_issue_files`†, `add_monitor`†, `remove_monitor`†¹ |
| `notes` | `add_note`, `delete_note`¹ |
| `links` | `add_relationship`, `remove_relationship`¹, `attach_tags`, `detach_tag`, `list_tags` |
| `files` | `upload_file` |
| `projects` | `list_projects`, `get_project`, `list_filters`, `get_project_categories`†, `get_project_users`†, `get_project_versions`†, `find_project_member`† |
| `versions` | `create_version`, `update_version`, `delete_version`¹, `release_version`† |
| `meta` | `get_metadata`, `get_issue_schema`, `get_config`, `get_version`, `get_current_user`, `get_metadata_full`†, `sync_metadata`†, `get_search_index_status`†, `get_issue_fields`†, `get_issue_enums`†, `get_mcp_version`†, `get_mantis_version`†, `list_languages`† |
| `search` | `search_issues`, `rebuild_search_index` ² |

¹ wird von `MANTIS_DISABLE_DESTRUCTIVE=true` ausgeblendet · † veraltet, wird in 2.0.0 entfernt · ² erfordert zusätzlich `MANTIS_SEARCH_ENABLED=true`; ohne die Gruppe `search` wird das Such-Modul gar nicht gestartet

Veraltete Tools gehören immer zur gleichen Gruppe wie ihr Ersatz – eine Gruppe zu deaktivieren blendet sowohl den alten als auch den neuen Namen aus.

**Beispiel A – Triage-Setup** (Issues, Notizen und Metadaten; keine destruktiven Operationen):

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "npx",
      "args": ["-y", "@dpesch/mantisbt-mcp-server"],
      "env": {
        "MANTIS_BASE_URL": "https://deine-mantis-instanz.example.com/api/rest",
        "MANTIS_API_KEY": "dein-api-token",
        "MANTIS_TOOLSETS": "issues,notes,meta",
        "MANTIS_DISABLE_DESTRUCTIVE": "true"
      }
    }
  }
}
```

**Beispiel B – alle Gruppen, nur Löschschutz** (36 von 41 Standard-Tools):

```json
{
  "mcpServers": {
    "mantisbt": {
      "command": "npx",
      "args": ["-y", "@dpesch/mantisbt-mcp-server"],
      "env": {
        "MANTIS_BASE_URL": "https://deine-mantis-instanz.example.com/api/rest",
        "MANTIS_API_KEY": "dein-api-token",
        "MANTIS_DISABLE_DESTRUCTIVE": "true"
      }
    }
  }
}
```

## Verfügbare Tools

### Issues

| Tool | Beschreibung |
|---|---|
| `get_issue` | Ein Issue per `id` oder mehrere per `ids` (1–50) in einem Aufruf abrufen – genau eines von beiden angeben; mit `ids` lautet die Antwort `{ issues, requested, found, failed }`, nicht zugängliche IDs liefern `null` an ihrer Position; optionales `select` zur Feldauswahl |
| `get_issues` | **Veraltet:** stattdessen `get_issue` mit `ids` verwenden – wird in 2.0.0 entfernt |
| `list_issues` | Issues nach Projekt, Status, Autor u.v.m. filtern; optionales `select` für Feldprojektion und `status` für clientseitige Statusfilterung – kanonische englische Statusnamen (z.B. `"new"`, `"resolved"`) werden per ID abgeglichen und funktionieren damit sprachunabhängig auf lokalisierten Installationen; `group_by` (`"status"`, `"handler"`, `"priority"`, `"category"`) liefert statt einer Issue-Liste Zählwerte pro Gruppe – alle Filter greifen weiterhin, `page`, `page_size` und `select` werden ignoriert |
| `create_issue` | Neues Issue anlegen; `severity` und `priority` müssen kanonische englische Namen sein (z.B. `minor`, `major`, `normal`, `high`) – `get_issue_schema` aufrufen, um alle gültigen Werte und deren lokalisierte Bezeichnungen zu sehen; optionaler `handler`-Parameter akzeptiert einen Benutzernamen als Alternative zu `handler_id` (wird gegen die Projektmitglieder aufgelöst); optionales `custom_fields` zum Setzen benutzerdefinierter Felder; `response: "short"` liefert statt des ganzen Issues nur dessen Kernfelder (Standard `"full"`, ab 2.0.0 `"short"`) |
| `update_issue` | Bestehendes Issue bearbeiten; Enum-Felder (`status`, `priority`, `severity`, `resolution`, `reproducibility`) akzeptieren kanonische englische Namen, lokalisierte Namen oder numerische IDs – der Server löst Namen automatisch zu IDs auf; unterstützt `custom_fields` sowie einen optionalen `note`-Parameter, der im selben Aufruf eine Notiz anhängt; `fields` darf entfallen, wenn nur `add_monitors`, `remove_monitors` oder `note` angegeben werden; mit `add_monitors` / `remove_monitors` (Arrays von Login-Namen) können Beobachter hinzugefügt oder entfernt werden – die Antwort enthält einen `monitors`-Schlüssel mit der aktuellen und der geänderten Beobachterliste; mit `fields.notes` lassen sich bestehende Notizen per ID bearbeiten (Notiz-ID aus `get_issue`); `response: "short"` liefert statt des ganzen Issues mit Notizen und Historie nur die Kernfelder und die geänderten Felder (Standard `"full"`, ab 2.0.0 `"short"`) |
| `delete_issue` | Issue löschen |

### Notizen

| Tool | Beschreibung |
|---|---|
| `list_notes` | **Veraltet:** stattdessen `get_issue` mit `select: "notes"` verwenden – wird in 2.0.0 entfernt |
| `add_note` | Notiz zu einem Issue hinzufügen |
| `delete_note` | Notiz löschen |

### Anhänge

| Tool | Beschreibung |
|---|---|
| `list_issue_files` | **Veraltet:** stattdessen `get_issue` mit `select: "attachments"` verwenden – wird in 2.0.0 entfernt |
| `upload_file` | Datei an ein Issue anhängen – bevorzugt: lokaler `file_path` (der Server liest und kodiert die Datei automatisch); Fallback: Base64-kodiertes `content` + `filename` (nur verwenden, wenn `file_path` nicht verfügbar ist) |

### Beziehungen

| Tool | Beschreibung |
|---|---|
| `add_relationship` | Beziehung zwischen zwei Issues erstellen; optionaler `type_name`-Parameter akzeptiert einen String-Namen (z.B. `"related_to"`, `"duplicate_of"`) als Alternative zur numerischen `type_id` |
| `remove_relationship` | Beziehung von einem Issue entfernen (die `id` aus dem Beziehungsobjekt verwenden, nicht die type-ID) |

### Beobachter

| Tool | Beschreibung |
|---|---|
| `add_monitor` | **Veraltet:** stattdessen `update_issue` mit `add_monitors` verwenden – wird in 2.0.0 entfernt |
| `remove_monitor` | **Veraltet:** stattdessen `update_issue` mit `remove_monitors` verwenden – wird in 2.0.0 entfernt |

### Tags

| Tool | Beschreibung |
|---|---|
| `list_tags` | Alle verfügbaren Tags auflisten; greift auf den Metadaten-Cache zurück, wenn `GET /tags` mit 404 antwortet (vorher `get_metadata` mit `refresh: true` ausführen) |
| `attach_tags` | Tags an ein Issue hängen |
| `detach_tag` | Tag von einem Issue entfernen |

### Projekte

| Tool | Beschreibung |
|---|---|
| `list_projects` | Alle zugänglichen Projekte auflisten; gibt normalisierte Projektdaten zurück (konsistent mit dem Metadaten-Cache) |
| `get_project` | Stammdaten eines Projekts (id, name, status, enabled, Unterprojekte) sowie auf Anfrage Kategorien, Benutzer und/oder Versionen in einem Aufruf; `access_level` und `member_query` implizieren `users`; `obsolete`/`inherit` implizieren `versions` |
| `get_project_versions` | **Veraltet:** stattdessen `get_project` mit `include: ["versions"]` verwenden – wird in 2.0.0 entfernt |
| `create_version` | Neue Version in einem Projekt erstellen; gibt das erstellte Versionsobjekt zurück (id, name, description, released, obsolete, timestamp); erfordert `manage_project_threshold` (Standard: Manager) |
| `update_version` | Bestehende Version aktualisieren; nur übergebene Felder werden geändert (mindestens eines erforderlich); Umbenennen schreibt version/target_version/fixed_in_version aller referenzierenden Issues neu; optionales `next_version` (nur zusammen mit `released: true`) legt eine Folgeversion im gleichen Aufruf an; erfordert `manage_project_threshold` (Standard: Manager) |
| `release_version` | **Veraltet:** stattdessen `update_version` mit `released: true`, `timestamp` und optional `next_version` verwenden – wird in 2.0.0 entfernt |
| `delete_version` | Version dauerhaft löschen – nicht umkehrbar, MantisBT leert version/target_version/fixed_in_version aller referenzierenden Issues; `update_version` mit `obsolete=true` als nicht-destruktive Alternative bevorzugen; erfordert `manage_project_threshold` (Standard: Manager) |
| `get_project_categories` | **Veraltet:** stattdessen `get_project` mit `include: ["categories"]` verwenden – wird in 2.0.0 entfernt |
| `get_project_users` | **Veraltet:** stattdessen `get_project` mit `include: ["users"]` verwenden – wird in 2.0.0 entfernt |
| `find_project_member` | **Veraltet:** stattdessen `get_project` mit `member_query` verwenden (kein `limit`, liefert alle Treffer) – wird in 2.0.0 entfernt |

### Semantische Suche *(optional)*

Die semantische Suche versteht die *Bedeutung* einer Anfrage, nicht nur ihre Stichwörter. Formuliere in natürlicher Sprache – die Suche findet konzeptuell verwandte Issues, auch wenn die genauen Begriffe nicht übereinstimmen:

- *„Login funktioniert nach Passwort-Reset nicht"* – findet Issues rund um Authentifizierungsgrenzfälle
- *„Performance-Probleme auf der Checkout-Seite"* – liefert verwandte Meldungen unabhängig von der verwendeten Terminologie
- *„doppelte Einträge in der Rechnungsliste"* – erkennt auch Issues, die als „zweifach angezeigt", „dupliziert" o.ä. beschrieben sind

Das Embedding-Modell (~80 MB) läuft vollständig **offline** – kein OpenAI-Key, keine externe API. Es wird beim ersten Start einmalig heruntergeladen und lokal gecacht. Issues werden bei jedem Serverstart inkrementell indexiert (nur neue und geänderte Issues werden neu verarbeitet). Starten mehrere Client-Sitzungen gleichzeitig einen Server, synchronisiert nur einer davon den gemeinsamen Index. Das Modell wird bei der ersten Nutzung geladen und nach 10 Minuten ohne Einbetten wieder entladen, damit ruhende Sitzungen seinen Speicher (~0,9 GB pro Serverprozess) nicht dauerhaft belegen. Lange Beschreibungen werden in bis zu 8 Abschnitte geteilt, damit auch Details weiter unten gefunden werden; der Index enthält dadurch etwa 1,7 Vektoren pro Issue (rund 115 MB bei 7.700 Issues), die jeder Serverprozess mit aktivierter Suche im Speicher hält. Die Rangfolge berücksichtigt zusätzlich exakte Stichworttreffer, sodass eine Suche nach einem Bezeichner, Fehlercode oder einer Versionsnummer die Issues findet, die ihn enthalten – und alle Issues, die eine solche Kennung vollständig enthalten, vor allen anderen auflistet, sofern die Kennung nicht in mehr als 20 Issues vorkommt.

Aktivierung mit `MANTIS_SEARCH_ENABLED=true`.

| Tool | Beschreibung |
|---|---|
| `search_issues` | Natürlichsprachige Suche über alle indizierten Issues – kombiniert semantische Ähnlichkeit mit Stichwortsuche (BM25), damit auch exakte Begriffe wie Bezeichner oder Fehlercodes gefunden werden; Issues, die eine Kennung aus der Anfrage enthalten (Auftragsnummer, CVE, Version, Code-Bezeichner), stehen vorn; liefert Top-N-Ergebnisse mit der Cosine-Similarity als `score`, sortiert nach der kombinierten Rangfolge; optionales `select` (kommagetrennte Feldnamen) reichert jedes Ergebnis mit den angeforderten Issue-Feldern an; optionales `highlight` (boolean, Standard `false`) fügt je Ergebnis ein `highlights`-Feld mit keyword-basierten Ausschnitten aus `summary` und `description` hinzu (Treffer werden in `**fett**` dargestellt) |
| `rebuild_search_index` | Suchindex aufbauen oder aktualisieren; `full: true` löscht und baut ihn vollständig neu |
| `get_search_index_status` | **Veraltet:** stattdessen `get_metadata` (Feld `search_index`) verwenden – wird in 2.0.0 entfernt |

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
| `get_metadata` | Gecachte Metadaten abrufen: `detail: "summary"` (Standard) liefert Projekt-/Tag-Zählwerte und Benutzer-/Versions-/Kategorie-Zählwerte je Projekt; `detail: "full"` liefert den vollständigen rohen Cache; `refresh: true` lädt alle Daten zuerst von MantisBT nach; mit aktivierter semantischer Suche enthält die Antwort zusätzlich einen `search_index`-Block |
| `get_version` | Version dieses MCP-Servers und der verbundenen MantisBT-Installation in einer Antwort; der Server-Teil nennt zusätzlich Commit und Build-Zeitpunkt (Anhang `-dev`, wenn es kein veröffentlichter Release ist); `check_latest` (Standard `true`) vergleicht MantisBT mit dem neuesten GitHub-Release; `mantis` enthält `error`, wenn MantisBT nicht erreichbar ist |
| `get_issue_schema` | Gültige `select`-Felder (`fields`, `fields_source`) und Enum-Werte (`enums`: severity, status, priority, resolution, reproducibility) für diesen MantisBT-Server in einer Antwort; optionale `project_id` schränkt die Feldermittlung ein – vor `create_issue` / `update_issue` oder beim Aufbau eines `select`-Strings verwenden |
| `get_issue_fields` | **Veraltet:** stattdessen `get_issue_schema` verwenden – wird in 2.0.0 entfernt |
| `get_issue_enums` | **Veraltet:** stattdessen `get_issue_schema` verwenden; die Ressource `mantis://enums` bleibt – wird in 2.0.0 entfernt |
| `get_metadata_full` | **Veraltet:** stattdessen `get_metadata` mit `detail: "full"` verwenden – wird in 2.0.0 entfernt |
| `sync_metadata` | **Veraltet:** stattdessen `get_metadata` mit `refresh: true` verwenden – wird in 2.0.0 entfernt |
| `list_filters` | Gespeicherte Filter auflisten |
| `get_current_user` | Eigenes Benutzerprofil abrufen – enthält `language` (die MantisBT-Sprache des Benutzers, ein Hinweis auf die Sprache für Issue-Texte und Notizen) |
| `list_languages` | **Veraltet:** stattdessen `get_current_user` (Feld `language`) verwenden – wird in 2.0.0 entfernt |
| `get_config` | Server-Konfiguration (Basis-URL, Cache-TTL) anzeigen |
| `get_mantis_version` | **Veraltet:** stattdessen `get_version` verwenden – wird in 2.0.0 entfernt |
| `get_mcp_version` | **Veraltet:** stattdessen `get_version` verwenden – wird in 2.0.0 entfernt |

## Token-Verbrauch

Der Server übernimmt das Zählen und die Feldprojektion selbst – das Modell erhält eine kompakte Zusammenfassung, statt rohe Issue-Listen zu lesen. Gemessen am 2026-10-31 an einer MantisBT-2.28-Installation (604 Issues, fünf Issues mit langen Beschreibungen und Notizen):

| Aufgabe | Vorher | Tokens | Nachher | Tokens | Ersparnis |
|---|---|---:|---|---:|---:|
| Statusübersicht eines Projekts (604 Issues) | `list_issues`, alle Seiten | 1.274.398 | `list_issues` + `group_by: "status"` | 165 | 99,9 % |
| Offene Issues je Bearbeiter | `list_issues` Status `"open"` + `select`, alle Seiten ¹ | 2.686 | `list_issues` + `group_by: "handler"` | 108 | 95,9 % |
| 5 Issues mit ausgewählten Feldern | `get_issue` ids, ohne `select` | 16.272 | `get_issue` ids + `select` | 623 | 96,1 % |

¹ `list_issues` durchsucht bei aktiven clientseitigen Filtern höchstens 500 Issues – der »Vorher«-Wert ist daher zu niedrig angesetzt.

Tokens geschätzt als Zeichen / 4. Zur Reproduktion an der eigenen Instanz (erfordert einen Git-Checkout, nicht per npx verfügbar):

```bash
MANTIS_BASE_URL=… MANTIS_API_KEY=… \
  BENCHMARK_PROJECT_ID=12 BENCHMARK_ISSUE_IDS=101,102,103,104,105 \
  npm run benchmark
```

Anmeldedaten können auch aus `.env.local` kommen.

## Verfügbare Ressourcen

MCP-Ressourcen sind URI-adressierbare, schreibgeschützte Daten, die Clients direkt abrufen können, ohne ein Tool aufzurufen. Sie sind das dritte MCP-Primitiv neben Tools und Prompts. Hinweis: Ressourcen werden von MCP-Clients weniger breit unterstützt als Tools – bitte die Dokumentation des jeweiligen Clients prüfen.

| Ressource-URI | Beschreibung |
|---|---|
| `mantis://me` | Profil des authentifizierten API-Benutzers (Live-Abruf) |
| `mantis://projects` | Alle zugänglichen MantisBT-Projekte als kompakte Liste (Cache-basiert, Aktualisierung via `get_metadata` mit `refresh: true`) |
| `mantis://projects/{id}` | Kombinierte Projektansicht: Projektfelder + Benutzer + Versionen + Kategorien in einem Aufruf; Cache-first, List-Support zur Aufzählung aller verfügbaren Projekt-URIs |
| `mantis://enums` | Gültige Werte für alle Issue-Enum-Felder: Severity, Priority, Status, Resolution, Reproducibility (Live-Abruf) |

## Verfügbare Prompts

MCP-Prompt-Templates sind Gesprächseinstiege, die den LLM anweisen, strukturierte Eingaben zu sammeln und dann das passende Tool aufzurufen. Es handelt sich nicht um Tools – sie starten einen geführten Arbeitsablauf.

| Prompt | Pflichtargumente | Optionale Argumente | Beschreibung |
|---|---|---|---|
| `create-bug-report` | `project_id`, `category`, `summary`, `description` | `steps_to_reproduce`, `expected`, `actual`, `environment` | Führt durch einen strukturierten Bug-Report und ruft `create_issue` auf |
| `create-feature-request` | `project_id`, `category`, `summary`, `description` | `use_case` | Führt durch einen Feature-Request und ruft `create_issue` auf |
| `summarize-issue` | `issue_id` | – | Ruft das Issue per `get_issue` ab und liefert eine prägnante Zusammenfassung |
| `project-status` | `project_id` | – | Listet Issues per `list_issues` auf und erstellt einen Status-Report nach Schweregrad |

## HTTP-Modus

Für den Einsatz als eigenständiger Server (z.B. in Remote-Setups). `MCP_HTTP_TOKEN` ist im HTTP-Modus **Pflicht** – der Server startet ohne diesen Wert nicht:

```bash
MCP_HTTP_TOKEN=secret MANTIS_BASE_URL=... MANTIS_API_KEY=... \
  TRANSPORT=http PORT=3456 node dist/index.js

# Mit expliziter Bind-Adresse (erforderlich für Docker/Remote):
# MCP_HTTP_TOKEN=secret MANTIS_BASE_URL=... MANTIS_API_KEY=... \
#   TRANSPORT=http PORT=3456 MCP_HTTP_HOST=0.0.0.0 node dist/index.js
```

Jede `/mcp`-Anfrage muss `Authorization: Bearer <token>` senden. Im HTTP-Modus ist der `file_path` von `upload_file` deaktiviert, sofern `MANTIS_UPLOAD_DIR` nicht gesetzt ist – stattdessen den Parameter `content` (Base64) verwenden.

Healthcheck: `GET http://localhost:3456/health` (immer öffentlich, kein Token erforderlich)

## Dokumentation

- [**Cookbook**](docs/cookbook.de.md) – Tool-orientierte Rezepte mit direkt verwendbaren Parameter-Beispielen für alle registrierten Tools
- [**Anwendungsbeispiele**](docs/examples.de.md) – Beispiele in natürlicher Sprache für alltägliche Anwendungsfälle (keine Tool-Namen erforderlich)

## Entwicklung

```bash
npm run init         # Ersteinrichtung: Abhängigkeiten, Git-Hooks, Typprüfung
npm run build        # TypeScript → dist/ kompilieren
npm run typecheck    # Typprüfung ohne Ausgabe
npm run dev          # Watch-Modus für Entwicklung
npm test             # Tests ausführen (vitest)
npm run test:watch   # Tests im Watch-Modus
npm run test:coverage # Coverage-Report
npm run benchmark    # Token-Benchmark gegen eine Live-MantisBT-Instanz (siehe Token-Verbrauch oben)
npm run benchmark:search # Such-Trefferquote und Exakt-Treffer-Reihenfolge auf einem bestehenden Index (MANTIS_SEARCH_DIR), Vektor vs. hybrid
```

`benchmark:search` liest optional handgeschriebene Umschreibungen (`BENCHMARK_PARAPHRASES`) und feste Fälle mit erwarteter Rangfolge (`BENCHMARK_EXACT`); die Dateiformate stehen am Anfang von `scripts/benchmark-search.ts`.

## Lizenz

MIT – siehe [LICENSE](LICENSE)

## Mitwirken

Beiträge willkommen! Bitte [CONTRIBUTING.md](CONTRIBUTING.md) lesen.
Repository: [codeberg.org/dpesch/mantisbt-mcp-server](https://codeberg.org/dpesch/mantisbt-mcp-server)
