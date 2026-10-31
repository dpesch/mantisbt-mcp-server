# Cookbook

Tool-orientierte Rezepte für den MantisBT MCP Server – jedes Rezept zeigt genau, welches Tool mit welchen Parametern aufgerufen wird. Beispiele mit natürlicher Sprache sind in [examples.de.md](examples.de.md) zu finden.

---

- [Verbindung einrichten](#verbindung-einrichten)
  - [Installation ohne URL-Rewriting anbinden](#installation-ohne-url-rewriting-anbinden)
  - [Nur bestimmte Tool-Gruppen anbieten](#nur-bestimmte-tool-gruppen-anbieten)
- [Die eigene Instanz erkunden](#die-eigene-instanz-erkunden)
  - [Alle Projekte abrufen](#alle-projekte-abrufen)
  - [Gültige select-Felder und Enum-Werte ermitteln](#gültige-select-felder-und-enum-werte-ermitteln)
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
  - [Issue auflösen mit Begründungs-Notiz (ein Aufruf)](#issue-auflösen-mit-begründungs-notiz-ein-aufruf)
  - [Benutzerdefinierte Felder setzen](#benutzerdefinierte-felder-setzen)
  - [Issue neu zuweisen](#issue-neu-zuweisen)
  - [Fix-Version setzen](#fix-version-setzen)
- [Notizen](#notizen)
  - [Notizen eines Issues abrufen](#notizen-eines-issues-abrufen)
  - [Öffentliche Notiz hinzufügen](#öffentliche-notiz-hinzufügen)
  - [Private Notiz hinzufügen](#private-notiz-hinzufügen)
  - [Notiz löschen](#notiz-löschen)
  - [Notiz ändern](#notiz-ändern)
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
  - [Beobachter via update_issue ändern](#beobachter-via-update_issue-ändern)
  - [Beobachter hinzufügen (veraltet)](#beobachter-hinzufügen-veraltet)
  - [Beobachter entfernen (veraltet)](#beobachter-entfernen-veraltet)
- [Semantische Suche](#semantische-suche)
  - [Initialen Index aufbauen](#initialen-index-aufbauen)
  - [Inkrementelles Index-Update](#inkrementelles-index-update)
  - [Index-Status prüfen](#index-status-prüfen)
  - [Nach Bedeutung suchen](#nach-bedeutung-suchen)
  - [Suche mit Felderweiterung](#suche-mit-felderweiterung)
- [Projekte & Kategorien](#projekte--kategorien)
  - [Projekt mit Kategorien, Nutzern und Versionen abrufen](#projekt-mit-kategorien-nutzern-und-versionen-abrufen)
  - [Projektkategorien auflisten](#projektkategorien-auflisten)
  - [Projektmitglied suchen](#projektmitglied-suchen)
  - [Projektversion erstellen](#projektversion-erstellen)
  - [Projektversion aktualisieren](#projektversion-aktualisieren)
  - [Version freigeben und nächsten Bugfix-Platzhalter erstellen (veraltet)](#version-freigeben-und-nächsten-bugfix-platzhalter-erstellen-veraltet)
  - [Projektversion löschen](#projektversion-löschen)
- [Metadaten](#metadaten)
  - [Metadaten-Zusammenfassung abrufen](#metadaten-zusammenfassung-abrufen)
  - [Metadaten-Cache aktualisieren](#metadaten-cache-aktualisieren)
  - [Vollständigen Metadaten-Cache abrufen](#vollständigen-metadaten-cache-abrufen)
- [Version & Diagnose](#version--diagnose)
  - [Versionen abrufen (MCP-Server und MantisBT)](#versionen-abrufen-mcp-server-und-mantisbt)
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

## Verbindung einrichten

### Installation ohne URL-Rewriting anbinden

Manche MantisBT-Installationen liefern die REST-API ausschließlich über ihren Front-Controller aus – typischerweise Apache ohne `mod_rewrite` oder IIS ohne Rewrite-Modul. Dort liefert `/api/rest/issues` einen 404, während `/api/rest/index.php/issues` funktioniert.

**Variante A – Flag explizit setzen:**

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "dein-api-token",
    "MANTIS_USE_INDEX_PHP": "true"
  }
}
```

**Variante B – vollständige REST-URL eintragen und erkennen lassen:**

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com/api/rest/index.php",
    "MANTIS_API_KEY": "dein-api-token"
  }
}
```

Endet `MANTIS_BASE_URL` auf `/api/rest/index.php`, wird das index.php-Routing automatisch aktiviert. Ein explizit gesetztes `MANTIS_USE_INDEX_PHP` hat immer Vorrang vor der Erkennung – steht es zusammen mit einer solchen URL auf `false`, wird das normale `/api/rest/`-Routing erzwungen und eine Warnung auf stderr ausgegeben.

**Prüfen:** `get_version` aufrufen. Kommt eine Antwort zurück, stimmt das Routing.

---

### Nur bestimmte Tool-Gruppen anbieten

Standardmäßig sind alle 41 Tools aktiv (Suche deaktiviert). Mit `MANTIS_TOOLSETS` lassen sich nur die benötigten Gruppen laden – das hält den Kontext des Modells kürzer. Mit `MANTIS_DISABLE_DESTRUCTIVE=true` werden alle destruktiven Tools ausgeblendet, unabhängig von den aktiven Gruppen.

Gültige Gruppennamen: `issues`, `notes`, `links`, `files`, `projects`, `versions`, `meta`, `search`. Ein unbekannter Name stoppt den Server beim Start mit einer Meldung, die die gültigen Namen auflistet. Veraltete Tools gehören immer zur gleichen Gruppe wie ihr Ersatz. Die vollständige Zuordnung von Gruppe zu Tools findet sich unter [Angebotene Tools einschränken im README](../README.de.md#angebotene-tools-einschränken).

**Beispiel A – Triage-Setup** (`issues`, `notes`, `meta`; keine destruktiven Operationen):

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "dein-api-token",
    "MANTIS_TOOLSETS": "issues,notes,meta",
    "MANTIS_DISABLE_DESTRUCTIVE": "true"
  }
}
```

**Beispiel B – alle Gruppen, nur Löschschutz** (36 von 41 Standard-Tools):

```json
{
  "env": {
    "MANTIS_BASE_URL": "https://mantis.example.com",
    "MANTIS_API_KEY": "dein-api-token",
    "MANTIS_DISABLE_DESTRUCTIVE": "true"
  }
}
```

Die Gruppe `search` erfordert zusätzlich `MANTIS_SEARCH_ENABLED=true`. Fehlt `search` in `MANTIS_TOOLSETS`, wird das Such-Modul – Index, Embedding-Modell, Hintergrund-Sync – gar nicht gestartet, auch wenn `MANTIS_SEARCH_ENABLED=true` gesetzt ist.

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

### Gültige select-Felder und Enum-Werte ermitteln

Gibt die gültigen `select`-Feldnamen und die Enum-Werte (severity, status, priority, resolution, reproducibility) für diesen MantisBT-Server in einem Aufruf zurück. Vor dem Aufbau eines `select`-Strings oder dem Setzen von Enum-Feldern in `create_issue` / `update_issue` aufrufen.

**Tool:** `get_issue_schema`

**Parameter:**
- `project_id` – _(optional)_ Feldermittlung auf ein bestimmtes Projekt einschränken

**Request:**

```json
{}
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
  "fields_source": "live",
  "enums": {
    "severity": [
      { "id": 10, "name": "feature" },
      { "id": 20, "name": "trivial" },
      { "id": 50, "name": "major" },
      { "id": 60, "name": "crash" }
    ],
    "status": [
      { "id": 10, "name": "new" },
      { "id": 50, "name": "assigned" },
      { "id": 80, "name": "resolved" },
      { "id": 90, "name": "closed" }
    ],
    "priority": [
      { "id": 10, "name": "none" },
      { "id": 20, "name": "low" },
      { "id": 30, "name": "normal" },
      { "id": 40, "name": "high" },
      { "id": 50, "name": "urgent" },
      { "id": 60, "name": "immediate" }
    ],
    "resolution": [
      { "id": 10, "name": "open" },
      { "id": 20, "name": "fixed" },
      { "id": 60, "name": "duplicate" }
    ],
    "reproducibility": [
      { "id": 10, "name": "always" },
      { "id": 30, "name": "sometimes" },
      { "id": 70, "name": "have not tried" }
    ]
  }
}
```

`fields_source` ist `"cache"`, `"live"` oder `"static"`. Auf lokalisierten Installationen kann jeder Enum-Eintrag ein `label` (lokalisiert) und einen `canonical_name` (englischer Standardname) enthalten. `create_issue` akzeptiert beides – kanonische englische Namen (z.B. `minor`) wie auch lokalisierte Namen; der Server löst den Wert automatisch auf.

> **Veraltet:** `get_issue_fields` (nur Felder) und `get_issue_enums` (nur Enums) werden durch `get_issue_schema` abgelöst – sie werden in 2.0.0 entfernt. Die Ressource `mantis://enums` bleibt erhalten.

---

## Issues

### Einzelnes Issue abrufen

Ruft ein einzelnes Issue anhand seiner numerischen ID ab, inklusive Notizen, Anhängen, Tags und Verknüpfungen.

**Tool:** `get_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `select` – _(optional)_ kommagetrennte Feldliste (server-seitige Projektion); reduziert die Antwortgröße bei großen Issues deutlich, z.B. `"id,summary,status,notes"`

**Request:**

```json
{
  "id": 1042
}
```

Kompakte Variante (nur die benötigten Felder):

```json
{
  "id": 1042,
  "select": "id,summary,status,handler"
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

Ruft bis zu 50 Issues in einem einzigen MCP-Aufruf ab. Die Anfragen laufen parallel (max. 5 gleichzeitig). Nicht zugängliche IDs liefern `null` an ihrer Position – der Aufruf schlägt nie wegen einzelner fehlender IDs fehl.

**Tool:** `get_issue`

**Parameter:**
- `ids` – Array numerischer Issue-IDs (1–50)
- `select` – _(optional)_ kommagetrennte Feldliste

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

> **Veraltet:** `get_issues` bietet dieselbe Funktion, ist aber veraltet – stattdessen `get_issue` mit `ids` wie oben gezeigt verwenden; `get_issues` wird in 2.0.0 entfernt.

---

### Issues auflisten (paginiert)

Gibt eine paginierte Liste von Issues zurück, optional auf ein Projekt beschränkt.

**Tool:** `list_issues`

**Parameter:**
- `project_id` – _(optional)_ numerische Projekt-ID
- `page` – _(optional)_ Seitennummer, Standard 1
- `page_size` – _(optional)_ Issues pro Seite, Standard 50

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
- `project_id` – _(optional)_ numerische Projekt-ID
- `select` – kommagetrennte Feldnamen

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

> **Hinweis:** Mit `get_issue_schema()` lassen sich alle verfügbaren Feldnamen anzeigen.

> **Hinweis:** `view_url` ist in allen Issue-Responses immer vorhanden – es wird vom MCP-Server injiziert und wird durch den `select`-Parameter nicht beeinflusst.

---

### Nach Status filtern

Gibt nur Issues mit einem bestimmten Status zurück. Der Filter wird clientseitig angewendet – das Tool durchsucht intern bis zu 500 Issues.

**Tool:** `list_issues`

**Parameter:**
- `project_id` – _(optional)_ numerische Projekt-ID
- `status` – Status-Name als Zeichenkette (z. B. `"new"`, `"assigned"`, `"resolved"`)

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

> **Hinweis:** Kanonische Statusnamen (z.B. `"new"`, `"resolved"`) werden zur numerischen ID aufgelöst und per `issue.status.id` gefiltert – funktioniert auch auf lokalisierten Installationen, bei denen die API übersetzte Statusnamen zurückgibt. Direkt übergebene lokalisierte Namen (z.B. `"Neu"`) werden als Fallback über den Namen abgeglichen. Das Kürzel `"open"` (alle Status mit id < 80) steht unabhängig von der Installationssprache immer zur Verfügung.

> **Hinweis:** Bei großen Projekten mit vielen Issues stattdessen einen vorgespeicherten MantisBT-Filter über `filter_id` verwenden – die clientseitige Filterung durchsucht nur die ersten 500 Issues (10 Seiten × 50).

---

### Nach Bearbeiter oder Melder filtern

Gibt Issues gefiltert nach dem zugewiesenen Benutzer oder dem Melder zurück. Beide Filter werden clientseitig angewendet.

**Tool:** `list_issues`

**Parameter:**
- `project_id` – _(optional)_ numerische Projekt-ID
- `assigned_to` – _(optional)_ numerische Benutzer-ID des Bearbeiters
- `reporter_id` – _(optional)_ numerische Benutzer-ID des Melders

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

**Schritt 1 – Verfügbare Filter auflisten:**

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

**Schritt 2 – Issues mit der Filter-ID abrufen:**

**Tool:** `list_issues`

**Parameter:**
- `filter_id` – numerische Filter-ID aus Schritt 1

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
- `summary` – Titel des Issues
- `project_id` – numerische Projekt-ID
- `category` – Kategoriename als Zeichenkette
- `description` – _(optional)_ ausführliche Beschreibung
- `priority` – _(optional)_ Priorität: kanonischer englischer Name (`none`, `low`, `normal`, `high`, `urgent`, `immediate`) oder lokalisierter Begriff. Standard: `"normal"`. Alle verfügbaren Werte über `get_issue_schema()` ermitteln.
- `severity` – _(optional)_ Schweregrad: kanonischer englischer Name (`feature`, `trivial`, `text`, `tweak`, `minor`, `major`, `crash`, `block`) oder lokalisierter Begriff. Standard: `"minor"`. Alle verfügbaren Werte über `get_issue_schema()` ermitteln.
- `handler` – _(optional)_ Benutzername des Bearbeiters (wird automatisch in eine ID aufgelöst)
- `handler_id` – _(optional)_ numerische Benutzer-ID des Bearbeiters (Alternative zu `handler`)

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

Der Server prüft zuerst kanonische englische Namen und fällt dann auf einen Live-Enum-Lookup zurück. Ein Fehler wird nur zurückgegeben, wenn der Wert weder kanonisch noch lokalisiert erkannt wird:

> Error: Invalid severity "xyz". Valid canonical names: feature, trivial, text, tweak, minor, major, crash, block. Call get_issue_schema to see localized labels.

Mit `get_issue_schema` lassen sich alle akzeptierten Werte ermitteln – sowohl kanonische als auch lokalisierte Namen funktionieren.

---

### Issue schließen (Status + Auflösung)

Löst ein Issue auf und schließt es. **Immer beide Felder** `status` und `resolution` setzen – wird nur der Status gesetzt, bleibt die Auflösung auf »offen«.

**Tool:** `update_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `fields.status` – Status-Objekt mit Name
- `fields.resolution` – Auflösungs-Objekt mit ID

> **Hinweis:** Alle Enum-Felder (`status`, `priority`, `severity`, `resolution`, `reproducibility`) akzeptieren kanonische englische Namen, lokalisierte Namen oder numerische IDs. Der Server löst Namen automatisch zu IDs auf – dadurch ist die Übergabe sprachunabhängig.

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

> **Hinweis:** Auflösungs-ID 20 entspricht in einer Standard-MantisBT-Installation »behoben«. Mit `get_issue_schema()` die korrekte ID für die eigene Instanz prüfen.

---

### Issue auflösen mit Begründungs-Notiz (ein Aufruf)

Ändert den Status und hängt eine Notiz mit der Begründung an – in einem einzigen `update_issue`-Aufruf, kein separates `add_note` nötig.

**Tool:** `update_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `fields` – zu ändernde Felder
- `note` – Notiztext, der nach erfolgreichem Update angehängt wird
- `note_view_state` – _(optional)_ `"public"` (Standard) oder `"private"`

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "status": { "name": "resolved" },
    "resolution": { "id": 20 }
  },
  "note": "Behoben in Commit abc123 – der Touch-Event-Handler fehlte unter iOS."
}
```

**Response:** das aktualisierte Issue plus ein `note`-Objekt mit `view_url`.

> **Hinweis:** Schlägt die Notiz nach erfolgreichem Update fehl, enthält die Antwort `note_error` statt eines Fehlers für den Gesamtaufruf – dann mit `add_note` nachholen. Für eine Notiz ohne Feldänderungen direkt `add_note` verwenden.

---

### Benutzerdefinierte Felder setzen

Schreibt Custom-Field-Werte beim Anlegen oder Aktualisieren. Dasselbe `custom_fields`-Format funktioniert bei `create_issue` und `update_issue` (dort innerhalb von `fields`).

**Tool:** `update_issue`

**Request:**

```json
{
  "id": 1042,
  "fields": {
    "custom_fields": [
      { "field": { "name": "Kunde" }, "value": "ACME Corp" },
      { "field": { "id": 3 }, "value": "2026-07-01" }
    ]
  }
}
```

> **Hinweis:** Nur die aufgeführten Custom Fields werden geändert – alle anderen bleiben unangetastet. Verfügbare Felder pro Projekt mit `get_issue_schema()` oder `get_metadata()` ermitteln. Werte sind immer Strings.

---

### Issue neu zuweisen

Ändert den Bearbeiter (Handler) eines bestehenden Issues.

**Tool:** `update_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `fields.handler` – Benutzername (wird automatisch in eine ID aufgelöst)

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
- `id` – numerische Issue-ID
- `fields.fixed_in_version` – Versionsname als Zeichenkette

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

> **Hinweis:** Mit `get_project` und `include: ["versions"]` lassen sich gültige Versionsnamen für ein Projekt auflisten.

---

## Notizen

### Notizen eines Issues abrufen

Ruft nur die Notizen eines Issues über serverseitige Feldprojektion ab. Dies ist die bevorzugte Alternative zum veralteten `list_notes`-Tool.

**Tool:** `get_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `select` – `"id,notes"` (`id` einschließen, damit `view_url` auch bei Projektionen immer gesetzt wird)

**Request:**

```json
{
  "id": 1042,
  "select": "id,notes"
}
```

**Response:**

```json
{
  "id": 1042,
  "notes": [
    {
      "id": 88,
      "reporter": { "id": 7, "name": "jdoe" },
      "text": "In Version 2.0.3 reproduziert. Ursache in der Auth-Middleware identifiziert.",
      "view_state": { "id": 10, "name": "public" },
      "created_at": "2024-11-05T14:02:11+00:00",
      "view_url": "https://mantis.example.com/view.php?id=1042#bugnote88"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Veraltet:** `list_notes` wird in 2.0.0 entfernt – stattdessen `get_issue` mit `select: "id,notes"` wie oben gezeigt verwenden.

---

### Öffentliche Notiz hinzufügen

Fügt eine öffentlich sichtbare Notiz zu einem Issue hinzu.

**Tool:** `add_note`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `text` – Inhalt der Notiz
- `view_state` – _(optional)_ `"public"` (Standard) oder `"private"`

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
- `issue_id` – numerische Issue-ID
- `text` – Inhalt der Notiz
- `view_state` – `"private"`

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
- `issue_id` – numerische Issue-ID
- `note_id` – numerische Notiz-ID (aus `get_issue`)

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

### Notiz ändern

Bearbeitet Text und/oder Sichtbarkeit einer bestehenden Notiz über `update_issue`. Die Notiz-ID stammt aus `get_issue`. Mindestens eines von `text` oder `view_state` muss angegeben werden. Mehrere Notizen können in einem Aufruf bearbeitet werden.

**Tool:** `update_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `fields.notes` – Array von Notiz-Änderungen: `{ id, text?, view_state? }`; ein weggelassenes `view_state` behält die aktuelle Sichtbarkeit der Notiz

**Request:** _(nur Text ändern)_

```json
{
  "id": 1042,
  "fields": {
    "notes": [
      { "id": 88, "text": "Auf Version 2.0.4 reproduziert – Null-Check in der Auth-Middleware fehlt." }
    ]
  }
}
```

**Response:**

```json
{
  "id": 1042,
  "summary": "Login-Button reagiert auf Mobile Safari nicht",
  "notes": [
    {
      "id": 88,
      "text": "Auf Version 2.0.4 reproduziert – Null-Check in der Auth-Middleware fehlt.",
      "view_state": { "id": 10, "name": "public" },
      "updated_at": "2024-11-06T12:00:00+00:00"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Hinweis:** Unbekannte Notiz-IDs werden vor dem Schreiben abgelehnt. Hat MantisBT eine Änderung nicht übernommen, enthält die Antwort `notes_error` mit Details statt den gesamten Aufruf abzubrechen – nur wenn die Notizbearbeitung die einzige angeforderte Änderung war, wird ein Fehler zurückgegeben. Zum Hinzufügen einer neuen Notiz den `note`-Parameter oder `add_note` verwenden.

---

## Dateianhänge

### Lokale Datei hochladen

Hängt eine Datei aus dem lokalen Dateisystem an ein Issue an.

**Tool:** `upload_file`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `file_path` – absoluter Pfad zur Datei

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

Hängt eine Datei an, indem ihr base64-kodierter Inhalt direkt übergeben wird. Nur als **Fallback** verwenden, wenn die Datei nicht über einen Pfad im Server-Dateisystem erreichbar ist (z.B. im Speicher erzeugte Daten oder Dateien, die nur auf der Client-Seite vorliegen). `file_path` bevorzugen, wenn die Datei auf der Festplatte existiert – der Server liest und kodiert sie automatisch.

**Tool:** `upload_file`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `content` – base64-kodierter Dateiinhalt
- `filename` – Dateiname inklusive Erweiterung (erforderlich bei Verwendung von `content`)
- `content_type` – _(optional)_ MIME-Typ
- `description` – _(optional)_ Beschreibung des Anhangs

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

Gibt alle Dateianhänge eines Issues über serverseitige Feldprojektion zurück. Jeder Anhang enthält eine `download_url`, die über den MantisBT-File-Download-Endpoint aufgebaut wird.

**Tool:** `get_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `select` – `"id,attachments"`

**Request:**

```json
{
  "id": 1042,
  "select": "id,attachments"
}
```

**Response:**

```json
{
  "id": 1042,
  "attachments": [
    {
      "id": 23,
      "filename": "login-error.png",
      "size": 42318,
      "content_type": "image/png",
      "created_at": "2024-11-05T15:30:00+00:00",
      "reporter": { "id": 4, "name": "jsmith" },
      "download_url": "https://mantis.example.com/file_download.php?file_id=23&type=bug"
    }
  ],
  "view_url": "https://mantis.example.com/view.php?id=1042"
}
```

> **Veraltet:** `list_issue_files` wird in 2.0.0 entfernt – stattdessen `get_issue` mit `select: "id,attachments"` wie oben gezeigt verwenden.

---

## Verknüpfungen

### Als Duplikat markieren

Verknüpft Issue A als Duplikat von Issue B.

**Tool:** `add_relationship`

**Parameter:**
- `issue_id` – ID des Duplikat-Issues (A)
- `target_id` – ID des ursprünglichen Issues (B)
- `type_name` – `"duplicate_of"`

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
- `issue_id` – numerische Issue-ID
- `target_id` – numerische ID des verwandten Issues
- `type_name` – `"related_to"`

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

Markiert Issue A als blockierend für Issue B (B kann nicht fortgeführt werden, bis A erledigt ist). Die Richtung ist entscheidend – sorgfältig lesen.

**Tool:** `add_relationship`

**Parameter:**
- `issue_id` – ID des blockierenden Issues (A)
- `target_id` – ID des blockierten Issues (B)
- `type_name` – `"parent_of"` (A blockiert B) oder `"child_of"` (A wird von B blockiert)

**Beispiel – A blockiert B:**

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

**Schritt 1 – Verknüpfungs-ID ermitteln:**

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

**Schritt 2 – Verknüpfung entfernen:**

**Tool:** `remove_relationship`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `relationship_id` – numerische Verknüpfungs-ID aus Schritt 1

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

> **Hinweis:** `relationship_id` ist die ID des Verknüpfungsdatensatzes selbst – nicht die Typ-ID und nicht die ID des Ziel-Issues.

---

## Tags

### Tags per Name anhängen

Hängt einen oder mehrere Tags per Name an ein Issue an. Unbekannte Tag-Namen werden automatisch angelegt.

**Tool:** `attach_tags`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `tags` – Array von Tag-Objekten; `{name: "..."}` für Referenz per Name oder `{id: N}` für Referenz per ID

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

**Schritt 1 – Tag-ID ermitteln:**

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

**Schritt 2 – Tag entfernen:**

**Tool:** `detach_tag`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `tag_id` – numerische Tag-ID aus Schritt 1

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

> **Hinweis:** `detach_tag` erfordert eine numerische ID, keinen Tag-Namen. Es gibt keine Suche per Name – die ID muss immer zuerst über `get_issue` oder `list_tags` abgerufen werden.

---

## Monitore (Beobachter)

### Beobachter via update_issue ändern

Fügt Beobachter (Monitore) eines Issues hinzu und/oder entfernt sie in einem einzigen `update_issue`-Aufruf. `fields` darf entfallen – es genügt `add_monitors`, `remove_monitors` oder beides. Namen werden ohne Rücksicht auf Groß-/Kleinschreibung abgeglichen.

**Tool:** `update_issue`

**Parameter:**
- `id` – numerische Issue-ID
- `add_monitors` – _(optional)_ Array von MantisBT-Login-Namen, die als Beobachter eingetragen werden sollen
- `remove_monitors` – _(optional)_ Array von MantisBT-Login-Namen, die aus den Beobachtern entfernt werden sollen; Namen, die das Issue nicht beobachten, werden still übergangen
- Ein Name in beiden Arrays wird abgelehnt.

**Request:** _(einen Beobachter hinzufügen)_

```json
{
  "id": 1042,
  "add_monitors": ["jsmith"]
}
```

**Response:**

```json
{
  "id": 1042,
  "view_url": "https://mantis.example.com/view.php?id=1042",
  "monitors": {
    "added": ["jsmith"],
    "current": ["asmith", "jsmith"]
  }
}
```

**Request:** _(einen Beobachter entfernen)_

```json
{
  "id": 1042,
  "remove_monitors": ["jsmith"]
}
```

**Response:**

```json
{
  "id": 1042,
  "view_url": "https://mantis.example.com/view.php?id=1042",
  "monitors": {
    "removed": ["jsmith"],
    "not_monitoring": [],
    "current": ["asmith"]
  }
}
```

`monitors.current` listet stets alle verbleibenden Beobachter. `monitors.added` enthält erfolgreich hinzugefügte, `monitors.removed` erfolgreich entfernte Namen; `monitors.not_monitoring` enthält Namen, die das Issue nicht beobachtet haben und daher übersprungen wurden. Andere Benutzer hinzuzufügen oder zu entfernen erfordert die Zugriffsstufe `monitor_add_others_bug_threshold` bzw. `monitor_delete_others_bug_threshold`. Die Schritte laufen nacheinander – `fields`, Beobachter, `note`. Sobald einer davon geklappt hat, wird ein späterer Fehler in der Antwort als `monitors_error` bzw. `note_error` gemeldet (nichts wird zurückgenommen); nur wenn alle angeforderten Schritte fehlschlagen, liefert der Aufruf einen Fehler.

---

### Beobachter hinzufügen (veraltet)

> **Veraltet:** stattdessen `update_issue` mit `add_monitors` verwenden – `add_monitor` wird in 2.0.0 entfernt.

Abonniert einen Benutzer für Benachrichtigungen zu einem Issue.

**Tool:** `add_monitor`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `username` – MantisBT-Login-Name

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{
  "success": true,
  "monitors": ["asmith", "jsmith"]
}
```

`monitors` listet alle Benutzer, die das Issue jetzt beobachten. Ist der Benutzer bereits Beobachter, ändert sich nichts, und der Aufruf gelingt trotzdem. Andere Benutzer hinzuzufügen erfordert die Zugriffsstufe `monitor_add_others_bug_threshold`.

---

### Beobachter entfernen (veraltet)

> **Veraltet:** stattdessen `update_issue` mit `remove_monitors` verwenden – `remove_monitor` wird in 2.0.0 entfernt.

Deabonniert einen Benutzer von Benachrichtigungen zu einem Issue.

**Tool:** `remove_monitor`

**Parameter:**
- `issue_id` – numerische Issue-ID
- `username` – MantisBT-Login-Name (Groß-/Kleinschreibung egal)

**Request:**

```json
{
  "issue_id": 1042,
  "username": "jsmith"
}
```

**Response:**

```json
{
  "success": true,
  "removed": true,
  "monitors": ["asmith"]
}
```

`monitors` listet die Benutzer, die das Issue weiterhin beobachten. War `jsmith` gar kein Beobachter, ändert sich nichts, und die Antwort enthält `"removed": false` sowie eine `message`. Andere Benutzer zu entfernen erfordert die Zugriffsstufe `monitor_delete_others_bug_threshold`; fehlt sie, liefert das Tool einen Fehler.

---

## Semantische Suche

> **Hinweis:** Alle Tools in diesem Abschnitt erfordern `MANTIS_SEARCH_ENABLED=true` in der Server-Konfiguration.

### Initialen Index aufbauen

Baut den vollständigen Vektor-Suchindex von Grund auf neu auf. Einmalig nach der Aktivierung der semantischen Suche ausführen.

**Tool:** `rebuild_search_index`

**Parameter:**
- `full` – auf `true` setzen, um den bestehenden Index vor dem Aufbau zu leeren

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

Aktualisiert den Index mit Issues, die seit der letzten Synchronisation hinzugekommen oder geändert wurden. Schneller als ein vollständiger Neuaufbau: Nur die seitdem geänderten Issues werden abgerufen und neu eingebettet.

Es synchronisiert immer nur ein Serverprozess den gemeinsamen Index. Läuft bereits eine Synchronisation in einem anderen Prozess (etwa einer anderen Client-Sitzung), gibt das Tool einen Fehler zurück – nach deren Ende einfach erneut aufrufen. Eine auf `project_id` beschränkte Synchronisation verschiebt `last_synced_at` nicht, damit Änderungen in anderen Projekten beim nächsten Sync trotzdem erfasst werden.

**Tool:** `rebuild_search_index`

**Parameter:**
- `project_id` – _(optional)_ auf ein einzelnes Projekt beschränken
- `full` – weglassen oder auf `false` setzen für den inkrementellen Modus

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
  "skipped": 0,
  "total": 312,
  "duration_ms": 2104
}
```

---

### Index-Status prüfen

Gibt die Anzahl der indizierten Issues, die Gesamtanzahl der Issues und den Zeitstempel der letzten Synchronisation zurück. `last_synced_at` ist das jüngste `updated_at`, das der MantisBT-Server bei dieser Synchronisation gemeldet hat (Serverzeit), und kann daher vor dem tatsächlichen Zeitpunkt der Synchronisation liegen.

**Tool:** `get_metadata`

**Parameter:** _(keine)_

**Request:**

```json
{}
```

**Response (relevanter Ausschnitt):**

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": { "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 } },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800,
  "search_index": {
    "summary": "312/312 (100 %)",
    "indexed": 312,
    "total": 312,
    "percent": 100,
    "last_synced_at": "2024-11-05T14:00:00+01:00"
  }
}
```

> **Veraltet:** `get_search_index_status` wird in 2.0.0 entfernt – stattdessen `get_metadata` (Feld `search_index`) wie oben gezeigt verwenden.

---

### Nach Bedeutung suchen

Findet Issues, die einem natürlichsprachigen Suchbegriff semantisch ähnlich sind. Gibt Issue-IDs und Relevanz-Scores zurück.

**Tool:** `search_issues`

**Parameter:**
- `query` – Suchanfrage in natürlicher Sprache
- `top_n` – _(optional)_ Anzahl zurückzugebender Ergebnisse; Standard 10
- `highlight` – _(optional)_ bei `true` werden keyword-basierte Ausschnitte je Ergebnis ergänzt; Standard `false`

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

> **Hinweis:** Die semantische Suche gibt die top-N ähnlichsten Issues zurück – vollständige Treffergarantie besteht nicht. Sie eignet sich nicht für Abfragen wie »alle Issues zu Thema X auflisten«.

---

### Suche mit Felderweiterung

Reichert Suchergebnisse mit bestimmten Feldern aus MantisBT an. Ohne `select` werden nur `id` und Score zurückgegeben.

**Tool:** `search_issues`

**Parameter:**
- `query` – Suchanfrage in natürlicher Sprache
- `top_n` – _(optional)_ Anzahl der Ergebnisse
- `select` – kommagetrennte Feldnamen, die für jedes Ergebnis abgerufen werden
- `highlight` – _(optional)_ bei `true` werden keyword-basierte Ausschnitte je Ergebnis ergänzt; Standard `false`

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

Zeigt, welcher Teil eines Issues mit der Suchanfrage übereinstimmt. Jedes Ergebnis, das lexikalisch mit der Anfrage übereinstimmt, erhält ein `highlights`-Feld mit fett hervorgehobenen Ausschnitten. Highlights sind keyword-basiert (lexikalisch), nicht semantisch – Ergebnisse ohne lexikalische Übereinstimmung haben kein `highlights`-Feld.

**Tool:** `search_issues`

**Parameter:**
- `query` – Suchanfrage in natürlicher Sprache
- `top_n` – _(optional)_ Anzahl der Ergebnisse; Standard 10
- `highlight` – auf `true` setzen, um Highlights zu aktivieren

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
      "summary": "**Login** schlägt mit 401 fehl – Token ungültig"
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

### Projekt mit Kategorien, Nutzern und Versionen abrufen

Ruft die Stammdaten eines Projekts sowie beliebige Kombinationen von Kategorien, Nutzern und Versionen in einem Aufruf ab. Kategorienamen werden ohne das Prefix `[All Projects]` geliefert und können direkt in `create_issue` verwendet werden. `member_query` filtert Nutzer per Teilstring-Suche in Login-Name, Realname und E-Mail und liefert alle Treffer.

**Tool:** `get_project`

**Parameter:**
- `project_id` – numerische Projekt-ID (mit `list_projects` ermitteln)
- `include` – _(optional)_ Array aus `"categories"`, `"users"`, `"versions"` (beliebige Kombination)
- `access_level` – _(optional)_ nur Nutzer ab dieser Zugriffsstufe (10=Betrachter, 25=Reporter, 40=Bearbeiter, 55=Entwickler, 70=Manager, 90=Administrator); impliziert `"users"`
- `member_query` – _(optional)_ Teilstring für die Nutzersuche; impliziert `"users"`, liefert alle Treffer
- `obsolete` – _(optional)_ veraltete Versionen einschließen; impliziert `"versions"`
- `inherit` – _(optional)_ Versionen des Elternprojekts einschließen; impliziert `"versions"`

**Request:** _(Stammdaten + Kategorien + Nutzer + Versionen)_

```json
{
  "project_id": 3,
  "include": ["categories", "users", "versions"]
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "description": "Kundenportal",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "view_state": { "id": 10, "name": "public" },
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" },
    { "id": 3, "name": "Backend" }
  ],
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 7, "name": "jdoe", "real_name": "Jane Doe", "email": "jdoe@example.com", "access_level": { "id": 70, "name": "manager" } }
  ],
  "versions": [
    { "id": 42, "name": "1.2.0", "released": false, "obsolete": false, "timestamp": "2026-10-31T00:00:00+00:00" },
    { "id": 43, "name": "1.2.1", "released": false, "obsolete": false, "timestamp": "2026-10-31T00:00:00+00:00" }
  ]
}
```

**Request:** _(Mitgliedersuche)_

```json
{
  "project_id": 3,
  "member_query": "smith"
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "updater" } }
  ]
}
```

> **Hinweis:** `get_project_categories`, `get_project_users`, `get_project_versions` und `find_project_member` sind zugunsten von `get_project` mit `include` bzw. `member_query` veraltet und werden in 2.0.0 entfernt.

---

### Projektkategorien auflisten

Gibt alle verfügbaren Kategorien eines MantisBT-Projekts zurück. Die zurückgegebenen Namen können direkt beim Erstellen von Issues verwendet werden.

**Tool:** `get_project`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `include` – `["categories"]`

**Request:**

```json
{
  "project_id": 3,
  "include": ["categories"]
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "categories": [
    { "id": 1, "name": "General" },
    { "id": 2, "name": "UI" },
    { "id": 3, "name": "Backend" }
  ]
}
```

> **Hinweis:** Kategorienamen mit dem Prefix `[All Projects]` (aus dem globalen Projekt geerbt) werden in der Antwort automatisch ohne diesen Prefix zurückgegeben.

> **Veraltet:** `get_project_categories` wird in 2.0.0 entfernt – stattdessen `get_project` mit `include: ["categories"]` wie oben gezeigt verwenden.

---

### Projektmitglied suchen

Sucht Projektmitglieder nach Name, Realname oder E-Mail. Die Suche ist Groß-/Kleinschreibungsunabhängig und findet Teilstrings. Alle Treffer werden zurückgegeben – es gibt kein `limit`.

**Tool:** `get_project`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `member_query` – Suchbegriff für `name`, `real_name` oder `email`

**Request:**

```json
{
  "project_id": 3,
  "member_query": "smith"
}
```

**Response:**

```json
{
  "id": 3,
  "name": "Webshop",
  "status": { "id": 10, "name": "development" },
  "enabled": true,
  "users": [
    { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com", "access_level": { "id": 55, "name": "developer" } },
    { "id": 11, "name": "asmith", "real_name": "Alice Smith", "email": "asmith@example.com", "access_level": { "id": 40, "name": "updater" } }
  ]
}
```

> **Veraltet:** `find_project_member` wird in 2.0.0 entfernt – stattdessen `get_project` mit `member_query` wie oben gezeigt verwenden. Anders als `find_project_member` hat `get_project` kein `limit` und gibt alle Treffer zurück.

---

### Projektversion erstellen

Erstellt eine neue Version in einem MantisBT-Projekt. Ohne `timestamp` verwendet MantisBT das aktuelle Datum. Versionsnamen müssen innerhalb des Projekts eindeutig sein.

> **Berechtigung erforderlich:** `manage_project_threshold` (MantisBT-Standard: Manager).

**Tool:** `create_version`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `name` – Versionsname, z. B. `"2.0.0"`
- `description` – _(optional)_ Versionsbeschreibung
- `released` – _(optional)_ Version als veröffentlicht markieren; Standard `false`
- `obsolete` – _(optional)_ Version als veraltet markieren; Standard `false`
- `timestamp` – _(optional)_ Versionsdatum als ISO-8601-String, z. B. `"2026-09-27"`

**Request:**

```json
{
  "project_id": 3,
  "name": "2.0.0",
  "description": "Major rewrite"
}
```

**Response:**

```json
{
  "id": 50,
  "name": "2.0.0",
  "description": "Major rewrite",
  "released": false,
  "obsolete": false,
  "timestamp": "2026-09-27T00:00:00+00:00"
}
```

---

### Projektversion aktualisieren

Aktualisiert eine bestehende Version eines MantisBT-Projekts. Es werden nur die übergebenen Felder geändert; mindestens ein Feld ist erforderlich. Das Umbenennen einer Version schreibt auch die Felder `version`, `target_version` und `fixed_in_version` aller referenzierenden Issues neu (einschließlich Unterprojekte mit geerbten Versionen).

> **Berechtigung erforderlich:** `manage_project_threshold` (MantisBT-Standard: Manager). Vom Elternprojekt geerbte Versionen können nur über die `project_id` des Elternprojekts geändert werden.

**Tool:** `update_version`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `version_id` – numerische Versions-ID (mit `get_project` und `include: ["versions"]` ermittelbar)
- `name` – _(optional)_ neuer Versionsname (muss im Projekt eindeutig sein)
- `description` – _(optional)_ neue Versionsbeschreibung
- `released` – _(optional)_ Veröffentlichungs-Flag
- `obsolete` – _(optional)_ Veraltet-Flag
- `timestamp` – _(optional)_ Versionsdatum als ISO-8601-String
- `next_version` – _(optional, nur zusammen mit `released: true`)_ Name der Folgeversion, die als unveröffentlichter Platzhalter angelegt wird, z.B. `"1.2.1"`; wird unverändert übernommen – keine automatische Nummerierung

**Request:** _(Version als veraltet markieren)_

```json
{
  "project_id": 3,
  "version_id": 21,
  "obsolete": true
}
```

**Response:**

```json
{
  "id": 21,
  "name": "1.9.0",
  "released": true,
  "obsolete": true,
  "timestamp": "2025-06-01T00:00:00+00:00"
}
```

**Request:** _(Version freigeben und Folgeversion anlegen)_

```json
{
  "project_id": 3,
  "version_id": 42,
  "released": true,
  "timestamp": "2026-10-31",
  "next_version": "1.2.1"
}
```

**Response:**

```json
{
  "version": {
    "id": 42,
    "name": "1.2.0",
    "released": true,
    "obsolete": false,
    "timestamp": "2026-10-31T00:00:00+00:00"
  },
  "next_version": {
    "id": 43,
    "name": "1.2.1",
    "released": false,
    "obsolete": false,
    "timestamp": "2026-10-31T00:00:00+00:00"
  }
}
```

Das Setzen von `released=true` ändert das Versionsdatum nicht – `timestamp` mit dem Freigabedatum immer mitübergeben. Schlägt das Anlegen der Folgeversion fehl, bleibt der Update wirksam und der Fehler wird als `next_version_error` in der Antwort gemeldet.

---

### Version freigeben und nächsten Bugfix-Platzhalter erstellen (veraltet)

> **Veraltet:** stattdessen `update_version` mit `released: true`, `timestamp` und optional `next_version` verwenden – `release_version` wird in 2.0.0 entfernt. Das Ersatzrezept steht unter [Projektversion aktualisieren](#projektversion-aktualisieren).

Markiert eine Version als veröffentlicht (mit Datumsangabe) und erstellt im selben Aufruf optional eine Folgeversion als Platzhalter. Der Name der Folgeversion wird unverändert übernommen – keine automatische Nummerierung. Schlägt das Erstellen der Folgeversion fehl, bleibt die Freigabe wirksam und der Fehler wird in `next_version_error` gemeldet.

> **Berechtigung erforderlich:** `manage_project_threshold` (MantisBT-Standard: Manager). Vom Elternprojekt geerbte Versionen können nur über die `project_id` des Elternprojekts geändert werden.

**Tool:** `release_version`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `version_id` – numerische Versions-ID der freizugebenden Version
- `timestamp` – _(optional)_ Freigabedatum als ISO-8601-String; Standard: jetzt
- `next_version` – _(optional)_ Name der Folgeversion, die als unveröffentlichter Platzhalter angelegt wird

**Request:**

```json
{
  "project_id": 3,
  "version_id": 42,
  "timestamp": "2026-09-27",
  "next_version": "1.2.1"
}
```

**Response:**

```json
{
  "released": {
    "id": 42,
    "name": "1.2.0",
    "released": true,
    "obsolete": false,
    "timestamp": "2026-09-27T00:00:00+00:00"
  },
  "next_version": {
    "id": 43,
    "name": "1.2.1",
    "released": false,
    "obsolete": false,
    "timestamp": "2026-09-27T00:00:00+00:00"
  }
}
```

> **Hinweis:** Das Setzen von `released=true` via `update_version` ändert das Versionsdatum nicht – `timestamp` mit dem Freigabedatum immer mitübergeben. Mit `next_version` lässt sich die Folgeversion im selben Aufruf anlegen.

---

### Projektversion löschen

Löscht eine Version dauerhaft aus einem MantisBT-Projekt. Diese Aktion ist nicht umkehrbar. MantisBT leert die Felder `version`, `target_version` und `fixed_in_version` aller Issues, die auf die gelöschte Version verweisen. Um eine Version aus dem Umlauf zu nehmen, ohne Issues zu verändern, stattdessen `update_version` mit `obsolete=true` verwenden.

> **Berechtigung erforderlich:** `manage_project_threshold` (MantisBT-Standard: Manager). Vom Elternprojekt geerbte Versionen können nur über die `project_id` des Elternprojekts gelöscht werden.

**Tool:** `delete_version`

**Parameter:**
- `project_id` – numerische Projekt-ID
- `version_id` – numerische Versions-ID

**Request:**

```json
{
  "project_id": 3,
  "version_id": 7
}
```

**Response:**

```
Version 7 deleted successfully.
```

---

## Metadaten

### Metadaten-Zusammenfassung abrufen

Gibt eine kompakte Übersicht aller gecachten Metadaten zurück: Gesamtzahl der Projekte und Tags sowie die Anzahl von Benutzern, Versionen und Kategorien je Projekt. Nützlich für einen schnellen Überblick, ohne große Arrays zu übertragen.

**Tool:** `get_metadata`

**Parameter:**
- `detail` – _(optional)_ `"summary"` (Standard) für Zählwerte; `"full"` für den vollständigen rohen Cache
- `refresh` – _(optional)_ `true`, um alle Metadaten vor der Antwort von MantisBT neu zu laden; Standard `false`

**Request:** _(Zusammenfassung, aus Cache)_

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

Mit `MANTIS_SEARCH_ENABLED=true` enthält die Antwort zusätzlich einen `search_index`-Block:

```json
{
  "projects": 24,
  "tags": 15,
  "byProject": { "3": { "name": "Webshop", "users": 8, "versions": 12, "categories": 4 } },
  "cached_at": "2026-03-27T09:00:00.000Z",
  "ttl_seconds": 82800,
  "search_index": {
    "summary": "312/312 (100 %)",
    "indexed": 312,
    "total": 312,
    "percent": 100,
    "last_synced_at": "2026-03-27T08:55:00+01:00"
  }
}
```

> **Hinweis:** Für vollständige Listen `list_projects`, `get_project` (mit `include`) oder `list_tags` verwenden.

---

### Metadaten-Cache aktualisieren

Erzwingt einen Neu-Abruf aller Metadaten von MantisBT, bevor die Zusammenfassung zurückgegeben wird.

**Tool:** `get_metadata`

**Parameter:**
- `refresh` – `true`

**Request:**

```json
{ "refresh": true }
```

**Response:** gleiche Struktur wie die Zusammenfassung oben, mit aktualisiertem `cached_at`.

---

### Vollständigen Metadaten-Cache abrufen

Gibt den vollständigen rohen Metadaten-Cache als minifiziertes JSON zurück. Die Cache-Struktur lautet `{ timestamp, projects, byProject: {"<id>": { users, versions, categories }}, tags }`.

**Tool:** `get_metadata`

**Parameter:**
- `detail` – `"full"`

**Request:**

```json
{ "detail": "full" }
```

**Response:**

```json
{
  "timestamp": 1743066000000,
  "projects": [
    { "id": 3, "name": "Webshop", "status": { "id": 10, "name": "development" }, "enabled": true }
  ],
  "byProject": {
    "3": {
      "users": [
        { "id": 4, "name": "jsmith", "real_name": "John Smith", "email": "jsmith@example.com" }
      ],
      "versions": [
        { "id": 21, "name": "2.4.0", "released": false, "obsolete": false }
      ],
      "categories": [
        { "id": 1, "name": "General" },
        { "id": 2, "name": "UI" }
      ]
    }
  },
  "tags": [
    { "id": 1, "name": "regression" },
    { "id": 2, "name": "hotfix" }
  ]
}
```

> **Veraltet:** `get_metadata_full` wird in 2.0.0 entfernt – stattdessen `get_metadata` mit `detail: "full"` wie oben gezeigt verwenden.

---

## Version & Diagnose

### Versionen abrufen (MCP-Server und MantisBT)

Gibt die Version dieses mantisbt-mcp-servers und der verbundenen MantisBT-Installation in einer Antwort zurück. Mit `check_latest: true` (Standard) wird die MantisBT-Version mit dem neuesten Release auf GitHub verglichen (ausgehende HTTPS-Verbindung, max. 5 s). Ist MantisBT nicht erreichbar, enthält `mantis` ein `error`-Feld; die MCP-Server-Version wird trotzdem zurückgegeben.

**Tool:** `get_version`

**Parameter:**
- `check_latest` – _(optional)_ MantisBT gegen das neueste GitHub-Release vergleichen; Standard `true`

**Request:**

```json
{}
```

**Response:**

```json
{
  "mcp_server": { "version": "1.15.0" },
  "mantis": {
    "installed_version": "2.27.0",
    "latest_version": "2.27.1",
    "status": "update-available"
  }
}
```

Mögliche Werte für `status`: `up-to-date`, `update-available`, `newer-than-release`, `unknown`. Mit `check_latest: false` den GitHub-Vergleich überspringen.

> **Veraltet:** `get_mcp_version` und `get_mantis_version` werden in 2.0.0 entfernt – stattdessen `get_version` wie oben gezeigt verwenden.

---

### Aktuellen Benutzer abrufen

Gibt das Profil des Benutzers zurück, der dem konfigurierten API-Key zugeordnet ist. Nützlich, um die Verbindung zu prüfen und das verwendete Konto zu bestätigen. Das Feld `language` gibt die MantisBT-Sprache des Benutzers an – als Hinweis, in welcher Sprache Issue-Texte und Notizen verfasst werden sollten und welche Sprache die lokalisierten Enum-Bezeichnungen haben.

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
  "language": "german",
  "access_level": { "id": 55, "name": "developer" }
}
```

---

## Ressourcen

MCP-Ressourcen sind URI-adressierbare, schreibgeschützte Daten. Clients, die Ressourcen unterstützen, können sie direkt per URI abrufen – kein Tool-Aufruf nötig. Hinweis: Ressourcen werden von MCP-Clients weniger breit unterstützt als Tools; bitte die Dokumentation des jeweiligen Clients prüfen.

> **Hinweis:** Ressourcen sind schreibgeschützt. Schreiboperationen sind über das Ressourcen-Primitiv nicht möglich – für Änderungen das entsprechende Tool verwenden (`create_issue`, `update_issue` usw.).

### Eigenes Benutzerprofil lesen

Gibt das Profil des authentifizierten API-Benutzers zurück.

**Ressource-URI:** `mantis://me`

**Abrufverhalten:** Immer live – ruft bei jedem Zugriff `GET /users/me` auf.

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

**Abrufverhalten:** Wird aus dem MetadataCache bedient (Standard-TTL 24 h). Fällt auf einen Live-API-Aufruf zurück, wenn der Cache leer ist. `get_metadata` mit `refresh: true` aufrufen, um eine Aktualisierung zu erzwingen.

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

Gibt gültige ID/Name-Paare für alle Issue-Enum-Felder zurück (Severity, Priority, Status, Resolution, Reproducibility). Bei `create_issue` werden sowohl kanonische englische Namen als auch lokalisierte `name`/`label`-Werte akzeptiert – diese Ressource hilft, alle verfügbaren Werte zu ermitteln.

**Ressource-URI:** `mantis://enums`

**Abrufverhalten:** Immer live – ruft bei jedem Zugriff den MantisBT-Config-Endpoint auf.

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

> **Tipp:** Das Tool `get_issue_schema` liefert Enum-Werte für Clients ohne Ressourcen-Unterstützung (und gibt zusätzlich die gültigen `select`-Felder zurück).

---

## Prompts

MCP-Prompt-Templates starten eine geführte Unterhaltung – der Client sendet die Prompt-Argumente und der Server liefert eine vorgefertigte Nachricht, die den LLM anweist, die passenden Tools aufzurufen. Beispiele in natürlicher Sprache sind in [examples.de.md](examples.de.md) zu finden.

### Bug-Report erstellen

Sammelt strukturierte Bug-Daten und ruft `create_issue` auf.

**Prompt:** `create-bug-report`

**Pflichtargumente:**
- `project_id` – numerische Projekt-ID
- `category` – Kategoriename
- `summary` – Issue-Titel
- `description` – detaillierte Fehlerbeschreibung

**Optionale Argumente:**
- `steps_to_reproduce` – Schritte zur Reproduktion
- `expected` – erwartetes Verhalten
- `actual` – tatsächliches (beobachtetes) Verhalten
- `environment` – Umgebungsangaben (Betriebssystem, Browser, Version usw.)

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, zunächst `get_issue_schema` aufzurufen (um gültige Schweregrad- und Prioritätswerte zu ermitteln) und anschließend `create_issue` mit den übergebenen Daten auszuführen.

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
- `project_id` – numerische Projekt-ID
- `category` – Kategoriename
- `summary` – Feature-Titel
- `description` – detaillierte Beschreibung des Features

**Optionale Argumente:**
- `use_case` – konkreter Anwendungsfall oder Motivation für das Feature

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
- `issue_id` – numerische Issue-ID

**Ablauf:** Der Prompt liefert eine Nachricht, die den LLM anweist, `get_issue` aufzurufen und das Ergebnis zusammenzufassen – inklusive Status, Priorität, aktueller Notizen und empfohlener nächster Schritte.

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
- `project_id` – numerische Projekt-ID

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
- `id` – numerische Issue-ID

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
