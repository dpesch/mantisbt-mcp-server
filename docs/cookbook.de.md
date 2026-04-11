# Cookbook

Tool-orientierte Rezepte für den MantisBT MCP Server — jedes Rezept zeigt genau, welches Tool mit welchen Parametern aufgerufen wird. Beispiele mit natürlicher Sprache sind in [examples.de.md](examples.de.md) zu finden.

---

- [Die eigene Instanz erkunden](#die-eigene-instanz-erkunden)
  - [Alle Projekte abrufen](#alle-projekte-abrufen)
  - [Gültige Enum-Werte ermitteln (Schweregrad, Status, Priorität)](#gültige-enum-werte-ermitteln-schweregrad-status-priorität)
  - [Gültige Feldnamen für `select` ermitteln](#gültige-feldnamen-für-select-ermitteln)
- [Issues](#issues)
  - [Einzelnes Issue abrufen](#einzelnes-issue-abrufen)
  - [Mehrere Issues in einem Aufruf abrufen](#mehrere-issues-in-einem-aufruf-abrufen)
  - [Issues auflisten (paginiert)](#issues-auflisten-paginiert)
  - [Antwortgröße mit `select` reduzieren](#antwortgröße-mit-select-reduzieren)
  - [Nach Status filtern](#nach-status-filtern)
  - [Nach Bearbeiter oder Melder filtern](#nach-bearbeiter-oder-melder-filtern)
  - [Gespeicherten Filter anwenden](#gespeicherten-filter-anwenden)
  - [Issue erstellen](#issue-erstellen)
  - [Issue schließen (Status + Auflösung)](#issue-schließen-status--auflösung)
  - [Issue neu zuweisen](#issue-neu-zuweisen)
  - [Fix-Version setzen](#fix-version-setzen)
- [Notizen](#notizen)
  - [Öffentliche Notiz hinzufügen](#öffentliche-notiz-hinzufügen)
  - [Private Notiz hinzufügen](#private-notiz-hinzufügen)
  - [Notiz löschen](#notiz-löschen)
- [Dateianhänge](#dateianhänge)
  - [Lokale Datei hochladen](#lokale-datei-hochladen)
  - [Dateiinhalt hochladen (Base64)](#dateiinhalt-hochladen-base64)
  - [Anhänge auflisten](#anhänge-auflisten)
- [Verknüpfungen](#verknüpfungen)
  - [Als Duplikat markieren](#als-duplikat-markieren)
  - [Als verwandt verknüpfen](#als-verwandt-verknüpfen)
  - [Blockier-Verknüpfung setzen](#blockier-verknüpfung-setzen)
  - [Verknüpfung entfernen](#verknüpfung-entfernen)
- [Tags](#tags)
  - [Tags per Name anhängen](#tags-per-name-anhängen)
  - [Tag entfernen](#tag-entfernen)
- [Monitore (Beobachter)](#monitore-beobachter)
  - [Beobachter hinzufügen](#beobachter-hinzufügen)
  - [Beobachter entfernen](#beobachter-entfernen)
- [Semantische Suche](#semantische-suche)
  - [Initialen Index aufbauen](#initialen-index-aufbauen)
  - [Inkrementelles Index-Update](#inkrementelles-index-update)
  - [Index-Status prüfen](#index-status-prüfen)
  - [Nach Bedeutung suchen](#nach-bedeutung-suchen)
  - [Suche mit Felderweiterung](#suche-mit-felderweiterung)
- [Projekte & Kategorien](#projekte--kategorien)
  - [Projektkategorien auflisten](#projektkategorien-auflisten)
  - [Projektmitglied suchen](#projektmitglied-suchen)
- [Metadaten](#metadaten)
  - [Metadaten-Zusammenfassung abrufen](#metadaten-zusammenfassung-abrufen)
  - [Vollständigen Metadaten-Cache abrufen](#vollständigen-metadaten-cache-abrufen)
- [Version & Diagnose](#version--diagnose)
  - [MCP-Server-Version abrufen](#mcp-server-version-abrufen)
  - [MantisBT-Version abrufen](#mantisbt-version-abrufen)
  - [Aktuellen Benutzer abrufen](#aktuellen-benutzer-abrufen)
- [Ressourcen](#ressourcen)
  - [Eigenes Benutzerprofil lesen](#eigenes-benutzerprofil-lesen)
  - [Alle Projekte lesen](#alle-projekte-lesen)
  - [Einzelnes Projekt mit allen Details lesen](#einzelnes-projekt-mit-allen-details-lesen)
  - [Issue-Enum-Werte lesen](#issue-enum-werte-lesen)
- [Prompts](#prompts)
  - [Bug-Report erstellen](#bug-report-erstellen)
  - [Feature-Request erstellen](#feature-request-erstellen)
  - [Issue zusammenfassen](#issue-zusammenfassen)
  - [Projekt-Status-Report](#projekt-status-report)
- [Destruktive Operationen](#destruktive-operationen)
  - [Issue löschen](#issue-löschen)

---

## Die eigene Instanz erkunden

### Alle Projekte abrufen

Gibt die vollständige Liste der mit dem API-Key zugänglichen Projekte zurück.

**Tool:** `list_projects`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
[
  { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true },
  { "id": 5, "name": "Backend API", "status": { "id": 10, "name": "development" }, "enabled": true }
]
```

---

### Gültige Enum-Werte ermitteln (Schweregrad, Status, Priorität)

Gibt die auf der eigenen MantisBT-Instanz konfigurierten Enum-Werte zurück. Vor dem Erstellen oder Aktualisieren von Issues aufrufen, um gültige Werte zu kennen.

**Tool:** `get_issue_enums`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "priorities": [
    { "id": 10, "name": "none" },
    { "id": 20, "name": "low" },
    { "id": 30, "name": "normal" },
    { "id": 40, "name": "high" },
    { "id": 50, "name": "urgent" },
    { "id": 60, "name": "immediate" }
  ],
  "severities": [
    { "id": 10, "name": "feature" },
    { "id": 20, "name": "trivial" },
    { "id": 50, "name": "major" },
    { "id": 60, "name": "crash" }
    // ...
  ],
  "statuses": [
    { "id": 10, "name": "new" },
    { "id": 50, "name": "assigned" },
    { "id": 80, "name": "resolved" },
    { "id": 90, "name": "closed" }
    // ...
  ],
  "resolutions": [
    { "id": 10, "name": "open" },
    { "id": 20, "name": "fixed" },
    { "id": 60, "name": "duplicate" }
    // ...
  ]
}
```

> **Hinweis:** Auf lokalisierten Instanzen liefert `get_issue_enums()` im Feld `name` den lokalisierten Begriff und optional im Feld `canonical_name` den englischen Originalnamen. `create_issue` akzeptiert **beides** — sowohl den kanonischen englischen Namen (z.B. `minor`) als auch den lokalisierten Namen (z.B. `Unschönheit`). Der Server löst den Wert automatisch auf.

---

### Gültige Feldnamen für `select` ermitteln

Gibt alle Feldnamen zurück, die dem `select`-Parameter von `list_issues` übergeben werden können.

**Tool:** `get_issue_fields`

**Parameter:**
- `project_id` — _(optional)_ auf Felder eines bestimmten Projekts beschränken

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
{
  "fields": [
    "additional_information", "attachments", "category", "created_at",
    "description", "fixed_in_version", "handler", "id", "notes",
    "priority", "project", "relationships", "reporter", "resolution",
    "severity", "status", "summary", "tags", "target_version",
    "updated_at", "version", "view_state"
  ],
  "source": "live"
}
```

---

## Issues

### Einzelnes Issue abrufen

Ruft ein einzelnes Issue anhand seiner numerischen ID ab, inklusive Notizen, Anhängen, Tags und Verknüpfungen.

**Tool:** `get_issue`

**Parameter:**
- `id` — numerische Issue-ID

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login button unresponsive on mobile Safari",
  "description": "Tapping the login button on iPhone 14 / Safari 17 does nothing.",
  "project": { "id": 3, "name": "Webshop" },
  "category": { "id": 1, "name": "UI" },
  "status": { "id": 50, "name": "assigned" },
  "resolution": { "id": 10, "name": "open" },
  "priority": { "id": 30, "name": "normal" },
  "severity": { "id": 50, "name": "major" },
  "reporter": { "id": 4, "name": "jsmith" },
  "handler": { "id": 7, "name": "jdoe" },
  "created_at": "2024-11-03T09:14:22+00:00",
  "updated_at": "2024-11-05T14:02:11+00:00",
  "tags": [],
  "notes": [],
  "attachments": [],
  "relationships": [],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

---

### Mehrere Issues in einem Aufruf abrufen

Ruft bis zu 50 Issues in einem einzigen MCP-Aufruf ab. Die Anfragen laufen parallel (max. 5 gleichzeitig). Nicht zugängliche IDs liefern `null` an ihrer Position — der Aufruf schlägt nie wegen einzelner fehlender IDs fehl.

**Tool:** `get_issues`

**Parameter:**
- `ids` — Array numerischer Issue-IDs (1–50)

**Request:**

```json
{
  "ids": [1042, 1041, 9999]
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login-Button auf mobilem Safari reagiert nicht",
      "status": { "id": 50, "name": "assigned" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    },
    {
      "id": 1041,
      "summary": "Checkout-Gesamtbetrag wird falsch gerundet",
      "status": { "id": 40, "name": "confirmed" },
      "view_url": "https://mantis.example.com/view.php?id=1041"
    },
    null
  ],
  "requested": 3,
  "found": 2,
  "failed": 1
}
```

> **Hinweis:** `null`-Einträge zeigen IDs an, die nicht gefunden oder nicht zugänglich waren. `failed` gibt an, wie viele IDs nicht abgerufen werden konnten.

---

### Issues auflisten (paginiert)

Gibt eine paginierte Liste von Issues zurück, optional auf ein Projekt beschränkt.

**Tool:** `list_issues`

**Parameter:**
- `project_id` — _(optional)_ numerische Projekt-ID
- `page` — _(optional)_ Seitennummer, Standard 1
- `page_size` — _(optional)_ Issues pro Seite, Standard 50

**Request:**

```json
{
  "project_id": 3,
  "page": 1,
  "page_size": 25
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    },
    {
      "id": 1041,
      "summary": "Checkout total rounds incorrectly",
      "status": { "id": 40, "name": "confirmed" },
      "handler": { "id": 4, "name": "jsmith" },
      "view_url": "https://mantis.example.com/view.php?id=1041"
    }
    // ...
  ]
}
```

---

### Antwortgröße mit `select` reduzieren

Eine kommagetrennte Liste von Feldnamen übergeben, um nur die benötigten Felder zu erhalten. Reduziert die Payload-Größe bei großen Listen erheblich.

**Tool:** `list_issues`

**Parameter:**
- `project_id` — _(optional)_ numerische Projekt-ID
- `select` — kommagetrennte Feldnamen

**Request:**

```json
{
  "project_id": 3,
  "select": "id,summary,status,handler"
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" },
      "view_url": "https://mantis.example.com/view.php?id=1042"
    }
    // ...
  ]
}
```

> **Hinweis:** Mit `get_issue_fields()` lassen sich alle verfügbaren Feldnamen anzeigen.

> **Hinweis:** `view_url` ist in allen Issue-Responses immer vorhanden — es wird vom MCP-Server injiziert und wird durch den `select`-Parameter nicht beeinflusst.

---

### Nach Status filtern

Gibt nur Issues mit einem bestimmten Status zurück. Der Filter wird clientseitig angewendet — das Tool durchsucht intern bis zu 500 Issues.

**Tool:** `list_issues`

**Parameter:**
- `project_id` — _(optional)_ numerische Projekt-ID
- `status` — Status-Name als Zeichenkette (z. B. `"new"`, `"assigned"`, `"resolved"`)

**Request:**

```json
{
  "project_id": 3,
  "status": "assigned"
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

> **Hinweis:** Kanonische Statusnamen (z.B. `"new"`, `"resolved"`) werden zur numerischen ID aufgelöst und per `issue.status.id` gefiltert — funktioniert auch auf lokalisierten Installationen, bei denen die API übersetzte Statusnamen zurückgibt. Direkt übergebene lokalisierte Namen (z.B. `"Neu"`) werden als Fallback über den Namen abgeglichen. Das Kürzel `"open"` (alle Status mit id < 80) steht unabhängig von der Installationssprache immer zur Verfügung.

> **Hinweis:** Bei großen Projekten mit vielen Issues stattdessen einen vorgespeicherten MantisBT-Filter über `filter_id` verwenden — die clientseitige Filterung durchsucht nur die ersten 500 Issues (10 Seiten × 50).

---

### Nach Bearbeiter oder Melder filtern

Gibt Issues gefiltert nach dem zugewiesenen Benutzer oder dem Melder zurück. Beide Filter werden clientseitig angewendet.

**Tool:** `list_issues`

**Parameter:**
- `project_id` — _(optional)_ numerische Projekt-ID
- `assigned_to` — _(optional)_ numerische Benutzer-ID des Bearbeiters
- `reporter_id` — _(optional)_ numerische Benutzer-ID des Melders

**Request:**

```json
{
  "project_id": 3,
  "assigned_to": 7
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

---

### Gespeicherten Filter anwenden

Einen in MantisBT vorgespeicherten Filter anhand seiner ID verwenden. Dies ist die empfohlene Vorgehensweise bei großen Datenmengen.

**Schritt 1 — Verfügbare Filter auflisten:**

**Tool:** `list_filters`

**Request:**

```json
{}
```

**Response:**

```json
[
  { "id": 12, "name": "My open issues", "owner": { "id": 4, "name": "jsmith" } },
  { "id": 15, "name": "Critical bugs", "owner": { "id": 4, "name": "jsmith" } }
]
```

**Schritt 2 — Issues mit der Filter-ID abrufen:**

**Tool:** `list_issues`

**Parameter:**
- `filter_id` — numerische Filter-ID aus Schritt 1

**Request:**

```json
{
  "filter_id": 12
}
```

**Response:**

```json
{
  "issues": [
    {
      "id": 1042,
      "summary": "Login button unresponsive on mobile Safari",
      "status": { "id": 50, "name": "assigned" },
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

---

### Issue erstellen

Legt ein neues Issue in MantisBT an.

**Tool:** `create_issue`

**Parameter:**
- `summary` — Titel des Issues
- `project_id` — numerische Projekt-ID
- `category` — Kategoriename als Zeichenkette
- `description` — _(optional)_ ausführliche Beschreibung
- `priority` — _(optional)_ Priorität: kanonischer englischer Name (`none`, `low`, `normal`, `high`, `urgent`, `immediate`) oder lokalisierter Begriff. Standard: `"normal"`. Alle verfügbaren Werte über `get_issue_enums()` ermitteln.
- `severity` — _(optional)_ Schweregrad: kanonischer englischer Name (`feature`, `trivial`, `text`, `tweak`, `minor`, `major`, `crash`, `block`) oder lokalisierter Begriff. Standard: `"minor"`. Alle verfügbaren Werte über `get_issue_enums()` ermitteln.
- `handler` — _(optional)_ Benutzername des Bearbeiters (wird automatisch in eine ID aufgelöst)
- `handler_id` — _(optional)_ numerische Benutzer-ID des Bearbeiters (Alternative zu `handler`)

**Request:**

```json
{
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "project_id": 3,
  "category": "UI",
  "description": "Tippen auf den Login-Button auf iPhone 14 / Safari 17 hat keinen Effekt.",
  "severity": "major",
  "handler": "jsmith"
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "description": "Tippen auf den Login-Button auf iPhone 14 / Safari 17 hat keinen Effekt.",
  "project": { "id": 3, "name": "Webshop" },
  "category": { "id": 1, "name": "UI" },
  "status": { "id": 10, "name": "new" },
  "resolution": { "id": 10, "name": "open" },
  "priority": { "id": 30, "name": "normal" },
  "severity": { "id": 50, "name": "major" },
  "reporter": { "id": 4, "name": "jsmith" },
  "handler": { "id": 4, "name": "jsmith" },
  "created_at": "2024-11-03T09:14:22+00:00",
  "updated_at": "2024-11-03T09:14:22+00:00",
  "tags": [],
  "notes": [],
  "attachments": [],
  "relationships": [],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

**Fehler: unbekannter Schweregrad oder unbekannte Priorität**

Der Server prüft zuerst kanonische englische Namen und fällt dann auf einen Live-`get_issue_enums`-Lookup zurück. Ein Fehler wird nur zurückgegeben, wenn der Wert weder kanonisch noch lokalisiert erkannt wird:

> Error: Invalid severity "xyz". Valid canonical names: feature, trivial, text, tweak, minor, major, crash, block. Call get_issue_enums to see localized labels.

Mit `get_issue_enums` lassen sich alle akzeptierten Werte ermitteln — sowohl kanonische als auch lokalisierte Namen funktionieren.

---

### Issue schließen (Status + Auflösung)

Löst ein Issue auf und schließt es. **Immer beide Felder** `status` und `resolution` setzen — wird nur der Status gesetzt, bleibt die Auflösung auf »offen«.

**Tool:** `update_issue`

**Parameter:**
- `id` — numerische Issue-ID
- `fields.status` — Status-Objekt mit Name
- `fields.resolution` — Auflösungs-Objekt mit ID

> **Hinweis:** Alle Enum-Felder (`status`, `priority`, `severity`, `resolution`, `reproducibility`) akzeptieren kanonische englische Namen, lokalisierte Namen oder numerische IDs. Der Server löst Namen automatisch zu IDs auf — dadurch ist die Übergabe sprachunabhängig.

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "status": { "name": "resolved" },
    "resolution": { "id": 20 }
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "status": { "id": 80, "name": "resolved" },
  "resolution": { "id": 20, "name": "fixed" },
  "updated_at": "2024-11-06T10:30:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Hinweis:** Auflösungs-ID 20 entspricht in einer Standard-MantisBT-Installation »behoben«. Mit `get_issue_enums()` die korrekte ID für die eigene Instanz prüfen.

---

### Issue neu zuweisen

Ändert den Bearbeiter (Handler) eines bestehenden Issues.

**Tool:** `update_issue`

**Parameter:**
- `id` — numerische Issue-ID
- `fields.handler` — Benutzername (wird automatisch in eine ID aufgelöst)

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "handler": "jdoe"
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "status": { "id": 50, "name": "assigned" },
  "handler": { "id": 7, "name": "jdoe" },
  "updated_at": "2024-11-06T11:00:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

---

### Fix-Version setzen

Setzt das Feld `fixed_in_version` eines Issues.

**Tool:** `update_issue`

**Parameter:**
- `id` — numerische Issue-ID
- `fields.fixed_in_version` — Versionsname als Zeichenkette

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "fixed_in_version": "2.1.0"
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "fixed_in_version": { "name": "2.1.0" },
  "updated_at": "2024-11-06T11:15:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Hinweis:** Mit `get_project_versions(project_id)` lassen sich gültige Versionsnamen für ein Projekt auflisten.

---

## Notizen

### Öffentliche Notiz hinzufügen

Fügt eine öffentlich sichtbare Notiz zu einem Issue hinzu.

**Tool:** `add_note`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `text` — Inhalt der Notiz
- `view_state` — _(optional)_ `"public"` (Standard) oder `"private"`

**Request:**

```json
{
  "issue_id": 1042,
  "text": "In Version 2.0.3 reproduziert. Ursache in der Auth-Middleware identifiziert."
}
```

**Response:**

```json
{
  "id": 88,
  "reporter": { "id": 7, "name": "jdoe" },
  "text": "In Version 2.0.3 reproduziert. Ursache in der Auth-Middleware identifiziert.",
  "view_state": { "id": 10, "name": "public" },
  "created_at": "2024-11-05T14:02:11+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042#bugnote88"
}
```

---

### Private Notiz hinzufügen

Fügt eine Notiz hinzu, die nur für Entwickler und Manager sichtbar ist.

**Tool:** `add_note`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `text` — Inhalt der Notiz
- `view_state` — `"private"`

**Request:**

```json
{
  "issue_id": 1042,
  "text": "Intern: Ursache ist das nicht erneuerte Session-Token.",
  "view_state": "private"
}
```

**Response:**

```json
{
  "id": 89,
  "reporter": { "id": 7, "name": "jdoe" },
  "text": "Intern: Ursache ist das nicht erneuerte Session-Token.",
  "view_state": { "id": 50, "name": "private" },
  "created_at": "2024-11-05T14:05:00+00:00",
  "view_url": "https://mantis.example.com/view.php?id=1042#bugnote89"
}
```

---

### Notiz löschen

Entfernt eine Notiz dauerhaft von einem Issue.

**Tool:** `delete_note`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `note_id` — numerische Notiz-ID (aus `list_notes` oder `get_issue`)

**Request:**

```json
{
  "issue_id": 1042,
  "note_id": 88
}
```

**Response:**

```
"Note #88 deleted from issue #1042."
```

> **Hinweis:** Diese Aktion ist dauerhaft und kann nicht rückgängig gemacht werden.

---

## Dateianhänge

### Lokale Datei hochladen

Hängt eine Datei aus dem lokalen Dateisystem an ein Issue an.

**Tool:** `upload_file`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `file_path` — absoluter Pfad zur Datei

**Request:**

```json
{
  "issue_id": 1042,
  "file_path": "/home/user/screenshots/login-fehler.png"
}
```

**Response:**

```json
{
  "id": 101,
  "file_name": "login-fehler.png",
  "size": 14523,
  "content_type": "image/png"
}
```

> **Hinweis:** Falls die MantisBT-Instanz keine Datei-Metadaten zurückgibt, lautet die Response `{ "success": true }`.

> **Hinweis:** Wenn `MANTIS_UPLOAD_DIR` gesetzt ist, muss `file_path` auf eine Datei innerhalb dieses Verzeichnisses zeigen. Pfade außerhalb des Verzeichnisses oder Path-Traversal-Versuche (`../`) werden mit einem Fehler abgelehnt.

---

### Dateiinhalt hochladen (Base64)

Hängt eine Datei an, indem ihr base64-kodierter Inhalt direkt übergeben wird. Verwenden, wenn die Datei nicht auf einem lokal zugänglichen Dateisystem liegt.

**Tool:** `upload_file`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `content` — base64-kodierter Dateiinhalt
- `filename` — Dateiname inklusive Erweiterung (erforderlich bei Verwendung von `content`)
- `content_type` — _(optional)_ MIME-Typ
- `description` — _(optional)_ Beschreibung des Anhangs

**Request:**

```json
{
  "issue_id": 1042,
  "content": "iVBORw0KGgoAAAANSUhEUgAA...",
  "filename": "screenshot.png",
  "content_type": "image/png",
  "description": "Login-Fehler auf mobilem Safari"
}
```

**Response:**

```json
{
  "id": 101,
  "file_name": "screenshot.png",
  "size": 14523,
  "content_type": "image/png"
}
```

> **Hinweis:** Falls die MantisBT-Instanz keine Datei-Metadaten zurückgibt, lautet die Response `{ "success": true }`.

---

### Anhänge auflisten

Gibt alle Dateianhänge eines Issues zurück.

**Tool:** `list_issue_files`

**Parameter:**
- `issue_id` — numerische Issue-ID

**Request:**

```json
{
  "issue_id": 1042
}
```

**Response:**

```json
[
  {
    "id": 23,
    "filename": "login-error.png",
    "size": 42318,
    "content_type": "image/png",
    "description": "Login error on mobile Safari",
    "created_at": "2024-11-05T15:30:00+00:00"
  }
]
```

---

## Verknüpfungen

### Als Duplikat markieren

Verknüpft Issue A als Duplikat von Issue B.

**Tool:** `add_relationship`

**Parameter:**
- `issue_id` — ID des Duplikat-Issues (A)
- `target_id` — ID des ursprünglichen Issues (B)
- `type_name` — `"duplicate_of"`

**Request:**

```json
{
  "issue_id": 1055,
  "target_id": 1042,
  "type_name": "duplicate_of"
}
```

**Response:**

```json
{
  "id": 5,
  "issue": { "id": 1055 },
  "type": { "id": 0, "name": "duplicate of" }
}
```

---

### Als verwandt verknüpfen

Erstellt eine nicht-direktionale »verwandt mit«-Verknüpfung zwischen zwei Issues.

**Tool:** `add_relationship`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `target_id` — numerische ID des verwandten Issues
- `type_name` — `"related_to"`

**Request:**

```json
{
  "issue_id": 1042,
  "target_id": 1038,
  "type_name": "related_to"
}
```

**Response:**

```json
{
  "id": 6,
  "issue": { "id": 1042 },
  "type": { "id": 1, "name": "related to" }
}
```

---

### Blockier-Verknüpfung setzen

Markiert Issue A als blockierend für Issue B (B kann nicht fortgeführt werden, bis A erledigt ist). Die Richtung ist entscheidend — sorgfältig lesen.

**Tool:** `add_relationship`

**Parameter:**
- `issue_id` — ID des blockierenden Issues (A)
- `target_id` — ID des blockierten Issues (B)
- `type_name` — `"parent_of"` (A blockiert B) oder `"child_of"` (A wird von B blockiert)

**Beispiel — A blockiert B:**

**Request:**

```json
{
  "issue_id": 1038,
  "target_id": 1042,
  "type_name": "parent_of"
}
```

**Response:**

```json
{
  "id": 7,
  "issue": { "id": 1038 },
  "type": { "id": 2, "name": "parent of" }
}
```

Akzeptierte Werte für `type_name`:
- `duplicate_of` / `has_duplicate`
- `related_to` / `related-to`
- `parent_of` / `parent-of` / `depends_on`
- `child_of` / `child-of` / `blocks`

> **Hinweis:** »A `child_of` B« bedeutet, dass A von B blockiert wird (A hängt von B ab). »A `parent_of` B« bedeutet, dass A B blockiert. Die Aliase `depends_on` (→ `parent_of`) und `blocks` (→ `child_of`) werden ebenfalls akzeptiert. Strich-Varianten (z.B. `related-to`, `parent-of`) funktionieren gleichermaßen. Eine falsche Richtung kehrt die Abhängigkeit um.

---

### Verknüpfung entfernen

Entfernt eine Verknüpfung von einem Issue.

**Schritt 1 — Verknüpfungs-ID ermitteln:**

**Tool:** `get_issue`

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "relationships": [
    { "id": 5, "type": { "id": 0, "name": "duplicate of" }, "issue": { "id": 1055 } }
  ]
}
```

`relationships[].id` aus der Antwort lesen.

**Schritt 2 — Verknüpfung entfernen:**

**Tool:** `remove_relationship`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `relationship_id` — numerische Verknüpfungs-ID aus Schritt 1

**Request:**

```json
{
  "issue_id": 1042,
  "relationship_id": 5
}
```

**Response:**

```json
{ "success": true }
```

> **Hinweis:** `relationship_id` ist die ID des Verknüpfungsdatensatzes selbst — nicht die Typ-ID und nicht die ID des Ziel-Issues.

---

## Tags

### Tags per Name anhängen

Hängt einen oder mehrere Tags per Name an ein Issue an. Unbekannte Tag-Namen werden automatisch angelegt.

**Tool:** `attach_tags`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `tags` — Array von Tag-Objekten; `{name: "..."}` für Referenz per Name oder `{id: N}` für Referenz per ID

**Request:**

```json
{
  "issue_id": 1042,
  "tags": [
    { "name": "needs-review" },
    { "name": "regression" }
  ]
}
```

**Response:**

```
"Tags successfully attached to issue #1042."
```

---

### Tag entfernen

Entfernt einen Tag von einem Issue. Erfordert die numerische Tag-ID.

**Schritt 1 — Tag-ID ermitteln:**

**Tool:** `get_issue`

**Request:**

```json
{
  "id": 1042
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button auf mobilem Safari reagiert nicht",
  "tags": [
    { "id": 14, "name": "needs-review" },
    { "id": 17, "name": "regression" }
  ]
}
```

`tags[].id` aus der Antwort lesen.

**Schritt 2 — Tag entfernen:**

**Tool:** `detach_tag`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `tag_id` — numerische Tag-ID aus Schritt 1

**Request:**

```json
{
  "issue_id": 1042,
  "tag_id": 14
}
```

**Response:**

```
"Tag #14 successfully removed from issue #1042."
```

> **Hinweis:** `detach_tag` erfordert eine numerische ID, keinen Tag-Namen. Es gibt keine Suche per Name — die ID muss immer zuerst über `get_issue` oder `list_tags` abgerufen werden.

---

## Monitore (Beobachter)

### Beobachter hinzufügen

Abonniert einen Benutzer für Benachrichtigungen zu einem Issue.

**Tool:** `add_monitor`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `username` — Benutzername als Zeichenkette

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{ "success": true }
```

---

### Beobachter entfernen

Deabonniert einen Benutzer von Benachrichtigungen zu einem Issue.

**Tool:** `remove_monitor`

**Parameter:**
- `issue_id` — numerische Issue-ID
- `username` — Benutzername als Zeichenkette

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{ "success": true }
```

---

## Semantische Suche

> **Hinweis:** Alle Tools in diesem Abschnitt erfordern `MANTIS_SEARCH_ENABLED=true` in der Server-Konfiguration.

### Initialen Index aufbauen

Baut den vollständigen Vektor-Suchindex von Grund auf neu auf. Einmalig nach der Aktivierung der semantischen Suche ausführen.

**Tool:** `rebuild_search_index`

**Parameter:**
- `full` — auf `true` setzen, um den bestehenden Index vor dem Aufbau zu leeren

**Request:**

```json
{
  "full": true
}
```

**Response:**

```json
{
  "indexed": 312,
  "skipped": 0,
  "total": 312,
  "duration_ms": 48203
}
```

---

### Inkrementelles Index-Update

Aktualisiert den Index mit Issues, die seit dem letzten Aufbau hinzugekommen oder geändert wurden. Schneller als ein vollständiger Neuaufbau.

**Tool:** `rebuild_search_index`

**Parameter:**
- `project_id` — _(optional)_ auf ein einzelnes Projekt beschränken
- `full` — weglassen oder auf `false` setzen für den inkrementellen Modus

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
{
  "indexed": 14,
  "skipped": 298,
  "total": 312,
  "duration_ms": 2104
}
```

---

### Index-Status prüfen

Gibt die Anzahl der indizierten Issues, die Gesamtanzahl der Issues und den Zeitstempel der letzten Synchronisation zurück.

**Tool:** `get_search_index_status`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "summary": "312/312 (100 %)",
  "indexed": 312,
  "total": 312,
  "percent": 100,
  "last_synced_at": "2024-11-05T14:00:00.000Z"
}
```

---

### Nach Bedeutung suchen

Findet Issues, die einem natürlichsprachigen Suchbegriff semantisch ähnlich sind. Gibt Issue-IDs und Relevanz-Scores zurück.

**Tool:** `search_issues`

**Parameter:**
- `query` — Suchanfrage in natürlicher Sprache
- `top_n` — _(optional)_ Anzahl zurückzugebender Ergebnisse; Standard 10
- `highlight` — _(optional)_ bei `true` werden keyword-basierte Ausschnitte je Ergebnis ergänzt; Standard `false`

**Request:**

```json
{
  "query": "Authentifizierung schlägt nach Passwort-Reset fehl",
  "top_n": 5
}
```

**Response:**

```json
[
  { "id": 1042, "score": 0.91, "view_url": "https://mantis.example.com/view.php?id=1042" },
  { "id": 987,  "score": 0.84, "view_url": "https://mantis.example.com/view.php?id=987" },
  { "id": 1015, "score": 0.79, "view_url": "https://mantis.example.com/view.php?id=1015" }
]
```

> **Hinweis:** Die semantische Suche gibt die top-N ähnlichsten Issues zurück — vollständige Treffergarantie besteht nicht. Sie eignet sich nicht für Abfragen wie »alle Issues zu Thema X auflisten«.

---

### Suche mit Felderweiterung

Reichert Suchergebnisse mit bestimmten Feldern aus MantisBT an. Ohne `select` werden nur `id` und Score zurückgegeben.

**Tool:** `search_issues`

**Parameter:**
- `query` — Suchanfrage in natürlicher Sprache
- `top_n` — _(optional)_ Anzahl der Ergebnisse
- `select` — kommagetrennte Feldnamen, die für jedes Ergebnis abgerufen werden
- `highlight` — _(optional)_ bei `true` werden keyword-basierte Ausschnitte je Ergebnis ergänzt; Standard `false`

**Request:**

```json
{
  "query": "Authentifizierung schlägt nach Passwort-Reset fehl",
  "top_n": 10,
  "select": "id,summary,status,handler"
}
```

**Response:**

```json
[
  {
    "id": 1042,
    "score": 0.91,
    "summary": "Login button unresponsive on mobile Safari",
    "status": { "id": 50, "name": "assigned" },
    "handler": { "id": 7, "name": "jdoe" },
    "view_url": "https://mantis.example.com/view.php?id=1042"
  }
  // ...
]
```

> **Hinweis:** Die Verwendung von `select` löst für jedes Ergebnis zusätzliche API-Aufrufe an MantisBT aus. `top_n` bei Verwendung der Felderweiterung klein halten, um übermäßige Anfragen zu vermeiden.

---

### Suche mit Keyword-Highlights

Zeigt, welcher Teil eines Issues mit der Suchanfrage übereinstimmt. Jedes Ergebnis, das lexikalisch mit der Anfrage übereinstimmt, erhält ein `highlights`-Feld mit fett hervorgehobenen Ausschnitten. Highlights sind keyword-basiert (lexikalisch), nicht semantisch — Ergebnisse ohne lexikalische Übereinstimmung haben kein `highlights`-Feld.

**Tool:** `search_issues`

**Parameter:**
- `query` — Suchanfrage in natürlicher Sprache
- `top_n` — _(optional)_ Anzahl der Ergebnisse; Standard 10
- `highlight` — auf `true` setzen, um Highlights zu aktivieren

**Request:**

```json
{
  "query": "Login-Fehler nach Passwort-Reset",
  "top_n": 5,
  "highlight": true
}
```

**Response:**

```json
[
  {
    "id": 1042,
    "score": 0.91,
    "view_url": "https://mantis.example.com/view.php?id=1042",
    "highlights": {
      "summary": "**Login**-Button reagiert nach **Passwort**-**Reset** auf Mobile Safari nicht",
      "description": "…Benutzer tippt auf **Login** und es passiert nichts. Reproduzierbar nach einem **Passwort**-**Reset**-Vorgang…"
    }
  },
  {
    "id": 987,
    "score": 0.84,
    "view_url": "https://mantis.example.com/view.php?id=987",
    "highlights": {
      "summary": "**Login** schlägt mit 401 fehl — Token ungültig"
    }
  },
  {
    "id": 1015,
    "score": 0.79,
    "view_url": "https://mantis.example.com/view.php?id=1015"
  }
]
```

> **Hinweis:** Nur Ergebnisse mit mindestens einer Keyword-Übereinstimmung in `summary` oder `description` erhalten ein `highlights`-Feld. Der `description`-Ausschnitt umfasst ca. 300 Zeichen, zentriert um den ersten Treffer. Wenn zusätzlich `select` gesetzt ist und `summary` oder `description` enthält, werden die Highlights aus den abgerufenen Feldern generiert; andernfalls stammen sie aus den indizierten Metadaten.

---

## Projekte & Kategorien

### Projektkategorien auflisten

Gibt alle verfügbaren Kategorien eines MantisBT-Projekts zurück. Die zurückgegebenen Namen können direkt beim Erstellen von Issues verwendet werden.

**Tool:** `get_project_categories`

**Parameter:**
- `project_id` — numerische Projekt-ID

**Request:**

```json
{
  "project_id": 3
}
```

**Response:**

```json
[
  { "id": 1, "name": "General" },
  { "id": 2, "name": "UI" },
  { "id": 3, "name": "Backend" }
]
```

> **Hinweis:** Kategorienamen mit dem Prefix `[All Projects]` (aus dem globalen Projekt geerbt) werden in der Antwort automatisch ohne diesen Prefix zurückgegeben.

---

### Projektmitglied suchen

Sucht Projektmitglieder nach Name, Realname oder E-Mail. Die Suche ist Groß-/Kleinschreibungsunabhängig und findet Teilstrings. Ergebnisse werden bevorzugt aus dem Metadaten-Cache geliefert; bei leerem Cache wird die live API verwendet.

**Tool:** `find_project_member`

**Parameter:**
- `project_id` — numerische Projekt-ID
- `query` — _(optional)_ Suchbegriff für `name`, `real_name` oder `email`
- `limit` — _(optional)_ maximale Trefferanzahl, Standard 10, max. 100

**Request:**

```json
{
  "project_id": 3,
  "query": "smith",
  "limit": 5
}
```

**Response:**

```json
[
  { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
  { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "reporter" } }
]
```

> **Tipp:** `query` weglassen, um alle Mitglieder des Projekts aufzulisten (bis zu `limit`).

---

## Metadaten

### Metadaten-Zusammenfassung abrufen

Gibt eine kompakte Übersicht aller gecachten Metadaten zurück: Gesamtzahl der Projekte und Tags sowie die Anzahl von Benutzern, Versionen und Kategorien je Projekt. Nützlich für einen schnellen Überblick, ohne große Arrays zu übertragen.

**Tool:** `get_metadata`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": {
    "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 },
    "5": { "name": "Backend API", "users": 5, "versions": 7, "categories": 3 }
  },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800
}
```

> **Hinweis:** Für vollständige Listen `list_projects`, `get_project_users`, `get_project_versions`, `get_project_categories`, `list_tags` oder `get_metadata_full` verwenden.

---

### Vollständigen Metadaten-Cache abrufen

Gibt den vollständigen rohen Metadaten-Cache als minifiziertes JSON zurück. Enthält alle Projekte mit vollständigen Feldern sowie Benutzer, Versionen und Kategorien je Projekt und alle Tags. Geeignet, wenn alle Daten in einem einzigen Aufruf benötigt werden.

**Tool:** `get_metadata_full`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "projects": [
    {
      "id": 3,
      "name": "Webshop",
      "status": { "id": 10, "name": "development" },
      "enabled": true,
      "users": [
        { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } }
      ],
      "versions": [
        { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
      ],
      "categories": [
        { "id": 1, "name": "General" },
        { "id": 2, "name": "UI" }
      ]
    }
  ],
  "tags": [
    { "id": 1, "name": "regression" },
    { "id": 2, "name": "hotfix" }
  ],
  "cached_at": "2026-03-27T09:00:00.000Z"
}
```

> **Tipp:** `get_metadata` liefert dieselben Daten als kompakte Zusammenfassung (nur Zählwerte). `get_metadata_full` verwenden, wenn die eigentlichen Arrays benötigt werden.

---

## Version & Diagnose

### MCP-Server-Version abrufen

Gibt die Version dieser mantisbt-mcp-server-Instanz zurück.

**Tool:** `get_mcp_version`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "version": "1.5.8"
}
```

---

### MantisBT-Version abrufen

Gibt die Version der verbundenen MantisBT-Installation zurück und vergleicht sie optional mit dem neuesten offiziellen Release auf GitHub.

**Tool:** `get_mantis_version`

**Parameter:**
- `check_latest` — _(optional)_ ob gegen das neueste GitHub-Release verglichen werden soll; Standard `true`

**Request:**

```json
{
  "check_latest": true
}
```

**Response:**

```json
{
  "installed_version": "2.27.0",
  "latest_version": "2.27.1",
  "status": "update-available"
}
```

Mögliche Werte für `status`: `up-to-date`, `update-available`, `newer-than-release`, `unknown`.

> **Hinweis:** Der GitHub-Vergleich erfordert eine ausgehende HTTPS-Verbindung. Mit `check_latest: false` lässt er sich überspringen.

---

### Aktuellen Benutzer abrufen

Gibt das Profil des Benutzers zurück, der dem konfigurierten API-Key zugeordnet ist. Nützlich, um die Verbindung zu prüfen und das verwendete Konto zu bestätigen.

**Tool:** `get_current_user`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response:**

```json
{
  "id": 4,
  "name": "jsmith",
  "real_name": "John Smith",
  "email": "jsmith@example.com",
  "access_level": { "id": 55, "name": "developer" }
}
```

---

## Ressourcen

MCP-Ressourcen sind URI-adressierbare, schreibgeschützte Daten. Clients, die Ressourcen unterstützen, können sie direkt per URI abrufen — kein Tool-Aufruf nötig. Hinweis: Ressourcen werden von MCP-Clients weniger breit unterstützt als Tools; bitte die Dokumentation des jeweiligen Clients prüfen.

> **Hinweis:** Ressourcen sind schreibgeschützt. Schreiboperationen sind über das Ressourcen-Primitiv nicht möglich — für Änderungen das entsprechende Tool verwenden (`create_issue`, `update_issue` usw.).

### Eigenes Benutzerprofil lesen

Gibt das Profil des authentifizierten API-Benutzers zurück.

**Ressource-URI:** `mantis://me`

**Abrufverhalten:** Immer live — ruft bei jedem Zugriff `GET /users/me` auf.

**Response:**

```json
{
  "id": 4,
  "name": "jsmith",
  "real_name": "John Smith",
  "email": "jsmith@example.com",
  "access_level": { "id": 55, "name": "developer" }
}
```

> **Tipp:** Das Tool `get_current_user` liefert dieselben Daten für Clients ohne Ressourcen-Unterstützung.

---

### Alle Projekte lesen

Gibt alle MantisBT-Projekte zurück, auf die der konfigurierte API-Key Zugriff hat.

**Ressource-URI:** `mantis://projects`

**Abrufverhalten:** Wird aus dem MetadataCache bedient (Standard-TTL 24 h). Fällt auf einen Live-API-Aufruf zurück, wenn der Cache leer ist. `sync_metadata` aufrufen, um eine Aktualisierung zu erzwingen.

**Response:**

```json
[
  { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true },
  { "id": 5, "name": "Backend API", "status": { "id": 10, "name": "development" }, "enabled": true }
]
```

> **Tipp:** Das Tool `list_projects` liefert dieselben Daten für Clients ohne Ressourcen-Unterstützung.

---

### Einzelnes Projekt mit allen Details lesen

Gibt eine kombinierte Ansicht eines einzelnen Projekts zurück: Projektfelder sowie alle Mitglieder, Versionen und Kategorien in einem Aufruf. Cache-first (MetadataCache); bei leerem Cache werden drei parallele API-Aufrufe durchgeführt. Clients mit Resource-List-Unterstützung können alle verfügbaren Projekt-URIs aufzählen.

**Ressource-URI:** `mantis://projects/{id}` (`{id}` durch die numerische Projekt-ID ersetzen)

**Abrufverhalten:** Cache-first (MetadataCache, Standard-TTL 24 h). Fällt auf Live-API-Aufrufe zurück, wenn der Cache leer ist.

**Beispiel-URI:** `mantis://projects/42`

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } }
  ],
  "versions": [
    { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
  ],
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" }
  ]
}
```

> **Tipp:** `mantis://projects` für eine kompakte Liste aller Projekte verwenden, anschließend Detaildaten einzelner Projekte über `mantis://projects/{id}` abrufen.

---

### Issue-Enum-Werte lesen

Gibt gültige ID/Name-Paare für alle Issue-Enum-Felder zurück (Severity, Priority, Status, Resolution, Reproducibility). Bei `create_issue` werden sowohl kanonische englische Namen als auch lokalisierte `name`/`label`-Werte akzeptiert — diese Ressource hilft, alle verfügbaren Werte zu ermitteln.

**Ressource-URI:** `mantis://enums`

**Abrufverhalten:** Immer live — ruft bei jedem Zugriff den MantisBT-Config-Endpoint auf.

**Response:**

```json
{
  "priorities": [
    { "id": 10, "name": "none" },
    { "id": 20, "name": "low" },
    { "id": 30, "name": "normal" },
    { "id": 40, "name": "high" },
    { "id": 50, "name": "urgent" },
    { "id": 60, "name": "immediate" }
  ],
  "severities": [
    { "id": 10, "name": "feature" },
    { "id": 20, "name": "trivial" },
    { "id": 50, "name": "major" },
    { "id": 60, "name": "crash" }
  ],
  "statuses": [
    { "id": 10, "name": "new" },
    { "id": 50, "name": "assigned" },
    { "id": 80, "name": "resolved" },
    { "id": 90, "name": "closed" }
  ],
  "resolutions": [
    { "id": 10, "name": "open" },
    { "id": 20, "name": "fixed" },
    { "id": 60, "name": "duplicate" }
  ]
}
```

> **Tipp:** Das Tool `get_issue_enums` liefert dieselben Daten für Clients ohne Ressourcen-Unterstützung.

---

## Prompts

MCP-Prompt-Templates starten eine geführte Unterhaltung — der Client sendet die Prompt-Argumente und der Server liefert eine vorgefertigte Nachricht, die den LLM anweist, die passenden Tools aufzurufen. Beispiele in natürlicher Sprache sind in [examples.de.md](examples.de.md) zu finden.

### Bug-Report erstellen

Sammelt strukturierte Bug-Daten und ruft `create_issue` auf.

**Prompt:** `create-bug-report`

**Pflichtargumente:**
- `project_id` — numerische Projekt-ID
- `category` — Kategoriename
- `summary` — Issue-Titel
- `description` — detaillierte Fehlerbeschreibung

**Optionale Argumente:**
- `steps_to_reproduce` — Schritte zur Reproduktion
- `expected` — erwartetes Verhalten
- `actual` — tatsächliches (beobachtetes) Verhalten
- `environment` — Umgebungsangaben (Betriebssystem, Browser, Version usw.)

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, zunächst `get_issue_enums` aufzurufen (um gültige Schweregrad- und Prioritätswerte zu ermitteln) und anschließend `create_issue` mit den übergebenen Daten auszuführen.

**Beispielaufruf:**

```json
{
  "project_id": 3,
  "category": "UI",
  "summary": "Login-Button reagiert auf Mobile Safari nicht",
  "description": "Ein Tipp auf den Login-Button auf einem iPhone 14 / Safari 17 bewirkt nichts.",
  "steps_to_reproduce": "1. Login-Seite auf iPhone 14 öffnen\n2. Auf 'Anmelden' tippen\n3. Nichts passiert",
  "expected": "Benutzer wird angemeldet und zum Dashboard weitergeleitet",
  "actual": "Die Seite bleibt auf dem Login-Formular, keine Fehlermeldung",
  "environment": "iPhone 14, iOS 17, Safari 17"
}
```

---

### Feature-Request erstellen

Sammelt Feature-Details und ruft `create_issue` auf.

**Prompt:** `create-feature-request`

**Pflichtargumente:**
- `project_id` — numerische Projekt-ID
- `category` — Kategoriename
- `summary` — Feature-Titel
- `description` — detaillierte Beschreibung des Features

**Optionale Argumente:**
- `use_case` — konkreter Anwendungsfall oder Motivation für das Feature

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, `create_issue` mit dem Schweregrad `feature` aufzurufen.

**Beispielaufruf:**

```json
{
  "project_id": 5,
  "category": "UX",
  "summary": "Dunkelmodus für Benutzereinstellungen",
  "description": "Einen Dunkelmodus-Schalter auf der Seite mit den Benutzereinstellungen hinzufügen.",
  "use_case": "Benutzer, die in schlecht beleuchteten Umgebungen arbeiten, berichten über Augenbelastung durch die aktuelle helle Benutzeroberfläche."
}
```

---

### Issue zusammenfassen

Ruft ein einzelnes Issue ab und liefert eine prägnante Zusammenfassung.

**Prompt:** `summarize-issue`

**Pflichtargumente:**
- `issue_id` — numerische Issue-ID

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, `get_issue` aufzurufen und das Ergebnis zusammenzufassen — inklusive Status, Priorität, aktueller Notizen und empfohlener nächster Schritte.

**Beispielaufruf:**

```json
{
  "issue_id": 1042
}
```

---

### Projekt-Status-Report

Listet alle Issues eines Projekts auf und erstellt einen Status-Report nach Schweregrad.

**Prompt:** `project-status`

**Pflichtargumente:**
- `project_id` — numerische Projekt-ID

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, `list_issues` für das Projekt aufzurufen und einen strukturierten Report zu erstellen: Anzahl offener Issues, Aufschlüsselung nach Schweregrad und eine Liste der kritischsten Einträge.

**Beispielaufruf:**

```json
{
  "project_id": 3
}
```

---

## Destruktive Operationen

### Issue löschen

Löscht ein MantisBT-Issue dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.

**Tool:** `delete_issue`

**Parameter:**
- `id` — numerische Issue-ID

**Request:**

```json
{
  "id": 42
}
```

**Response:**

```
"Issue #42 deleted successfully."
```

> **Warnung:** Diese Aktion ist dauerhaft und kann nicht rückgängig gemacht werden.

---
