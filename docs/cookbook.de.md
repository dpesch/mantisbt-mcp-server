# Cookbook

Tool-orientierte Rezepte für den MantisBT MCP Server — jedes Rezept zeigt genau, welches Tool mit welchen Parametern aufgerufen wird. Beispiele mit natürlicher Sprache sind in [examples.de.md](examples.de.md) zu finden.

---

- [Die eigene Instanz erkunden](#die-eigene-instanz-erkunden)
  - [Alle Projekte abrufen](#alle-projekte-abrufen)
  - [Gültige Enum-Werte ermitteln (Schweregrad, Status, Priorität)](#gültige-enum-werte-ermitteln-schweregrad-status-priorität)
  - [Gültige Feldnamen für `select` ermitteln](#gültige-feldnamen-für-select-ermitteln)
- [Issues](#issues)
  - [Einzelnes Issue abrufen](#einzelnes-issue-abrufen)
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
- [Version & Diagnose](#version--diagnose)
  - [MCP-Server-Version abrufen](#mcp-server-version-abrufen)
  - [MantisBT-Version abrufen](#mantisbt-version-abrufen)
  - [Aktuellen Benutzer abrufen](#aktuellen-benutzer-abrufen)
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

> **Hinweis:** Die von `get_issue_enums()` zurückgegebenen Namen können lokalisiert sein. `create_issue` und `update_issue` erwarten für `severity` und `priority` **kanonische englische Namen** (z.B. `minor`, `major`, `normal`) — bei Unsicherheit das `canonical_name`-Feld in der Antwort prüfen.

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
  "relationships": []
}
```

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
      "handler": { "id": 7, "name": "jdoe" }
    },
    {
      "id": 1041,
      "summary": "Checkout total rounds incorrectly",
      "status": { "id": 40, "name": "confirmed" },
      "handler": { "id": 4, "name": "jsmith" }
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
      "handler": { "id": 7, "name": "jdoe" }
    }
    // ...
  ]
}
```

> **Hinweis:** Mit `get_issue_fields()` lassen sich alle verfügbaren Feldnamen anzeigen.

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
- `priority` — _(optional)_ kanonischer englischer Prioritätsname: `none`, `low`, `normal`, `high`, `urgent`, `immediate` — lokalisierte Bezeichnungen über `get_issue_enums()` ermitteln
- `severity` — _(optional)_ kanonischer englischer Schweregrad-Name: `feature`, `trivial`, `text`, `tweak`, `minor`, `major`, `crash`, `block`; Standard ist `"minor"` — lokalisierte Bezeichnungen über `get_issue_enums()` ermitteln
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
  "relationships": []
}
```

**Fehler: unbekannter Schweregrad oder unbekannte Priorität**

Wird ein nicht erkannter Name für `severity` oder `priority` übergeben, gibt der Server einen Fehler zurück, der die gültigen Werte auflistet:

> Error: Invalid severity "schwerer Fehler". Valid canonical names: feature, trivial, text, tweak, minor, major, crash, block. Call get_issue_enums to see localized labels.

Mit `get_issue_enums` lassen sich die kanonischen Namen ermitteln, die `create_issue` akzeptiert.

---

### Issue schließen (Status + Auflösung)

Löst ein Issue auf und schließt es. **Immer beide Felder** `status` und `resolution` setzen — wird nur der Status gesetzt, bleibt die Auflösung auf »offen«.

**Tool:** `update_issue`

**Parameter:**
- `id` — numerische Issue-ID
- `fields.status` — Status-Objekt mit Name
- `fields.resolution` — Auflösungs-Objekt mit ID

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
  "updated_at": "2024-11-06T10:30:00+00:00"
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
  "updated_at": "2024-11-06T11:00:00+00:00"
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
  "updated_at": "2024-11-06T11:15:00+00:00"
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
  "created_at": "2024-11-05T14:02:11+00:00"
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
  "created_at": "2024-11-05T14:05:00+00:00"
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

> **Hinweis:** `detach_tag` erfordert eine numerische ID, keinen Tag-Namen. Es gibt keine Suche per Name — die ID muss immer zuerst über `get_issue` oder `get_metadata` abgerufen werden.

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
  { "id": 1042, "score": 0.91 },
  { "id": 987,  "score": 0.84 },
  { "id": 1015, "score": 0.79 }
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
    "handler": { "id": 7, "name": "jdoe" }
  }
  // ...
]
```

> **Hinweis:** Die Verwendung von `select` löst für jedes Ergebnis zusätzliche API-Aufrufe an MantisBT aus. `top_n` bei Verwendung der Felderweiterung klein halten, um übermäßige Anfragen zu vermeiden.

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
