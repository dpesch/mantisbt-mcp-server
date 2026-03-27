# Anwendungsbeispiele

Praktische Beispiele für die Interaktion mit MantisBT über Claude, sobald der MCP-Server verbunden ist. Einfach in natürlicher Sprache fragen — keine Tool-Namen oder Parameter erforderlich. Für exakte Tool-Aufrufe und Parameter siehe das [Cookbook](cookbook.de.md).

---

## Alltägliche Anwendungsfälle

### Issues durchsuchen und filtern

> »Zeige mir alle offenen Issues im Projekt Webshop.«

> »Welche Bugs sind mir aktuell zugewiesen?«

> »Liste alle ungelösten Issues mit Priorität 'dringend' im Backend-Projekt.«

> »Was ist der Status von Issue #1042?«

> »Zeige mir alle Issues, die jsmith diesen Monat gemeldet hat.«

> »Welche Issues im Webshop-Projekt blockieren das Release 2.4.0?«

---

### Issues erstellen

> »Erstelle einen Bug-Report: Auf der Checkout-Seite wird die Bestellung doppelt abgeschickt, wenn man zweimal auf 'Bestellen' klickt. Kategorie: Shop, Schweregrad: schwerwiegend.«

> »Öffne ein neues Issue im API-Projekt — der Token-Refresh-Endpoint gibt 500 zurück, wenn das Refresh-Token abgelaufen ist. Dem Backend-Team zuweisen.«

> »Erstelle einen Feature-Request im Frontend-Projekt für einen Dunkelmodus in den Benutzereinstellungen. Niedrige Priorität, kein Fälligkeitsdatum.«

---

### Issues aktualisieren

> »Markiere Issue #1042 als gelöst.«

> »Weise Issue #887 an jdoe neu zu.«

> »Ändere den Schweregrad von #1099 auf 'schwerwiegend' und füge eine Notiz hinzu: auf Produktion reproduziert.«

> »Setze die Fix-Version von Issues #901 und #902 auf 2.4.1.«

---

### Notizen und Kommentare

> »Füge einen Kommentar zu #1042 hinzu: Fix auf Staging ausgerollt, warte auf QA-Freigabe.«

> »Zeige mir alle Notizen zu Issue #774.«

> »Füge eine private Notiz zu #512 hinzu: Kundenreferenz AC-2291, nicht weitergeben.«

---

### Anhänge

> »Hänge die Datei /tmp/error.log an Issue #1042 an.«

> »Welche Dateien sind an Issue #930 angehängt?«

---

### Beziehungen

> »Markiere Issue #1044 als Duplikat von #1042.«

> »Verknüpfe #901 und #902 als verwandte Issues.«

> »Issue #1100 blockiert #1101 — bitte diese Beziehung anlegen.« 
> *(Richtung ist entscheidend: #1100 ist das blockierende Issue)*

---

### Tags

> »Versehe Issue #1042 mit den Tags 'regression' und 'hotfix'.«

> »Entferne den Tag 'wontfix' von Issue #887.«

> »Welche Tags gibt es in dieser MantisBT-Instanz?«

---

### Projektmetadaten

> »Auf welche Projekte habe ich Zugriff?«

> »Welche Versionen sind im Webshop-Projekt definiert?«

> »Liste alle Kategorien im Backend-Projekt.«

> »Wer sind die Mitglieder des API-Projekts?«

> »Gibt es im Projekt 3 einen Benutzer namens 'schmidt'?«

> »Finde alle Mitglieder des Webshop-Projekts, deren E-Mail '@example.com' enthält.«

---

### Triage und Auswertung

> »Gib mir einen Überblick über alle kritischen und dringenden offenen Issues in allen Projekten.«

> »Welche Issues im Backend-Projekt sind seit mehr als 30 Tagen ohne Aktivität offen?«

> »Was sind die häufigsten Bug-Typen der letzten sechs Monate?«

> »Fasse die Notizen zu Issue #774 zusammen und schlage einen nächsten Schritt vor.«

> »Liste alle Issues mit dem Tag 'regression' und fasse zusammen, was schiefgelaufen ist.«

---

## Geführte Prompt-Workflows

Der Server enthält Prompt-Templates, die Claude durch strukturierte Arbeitsabläufe führen — Tool-Namen oder Parameter müssen nicht manuell angegeben werden. Die Prompts werden aus einem MCP-fähigen Client beim Namen aufgerufen.

### Issues über Prompt-Templates anlegen

> »Verwende den Prompt `create-bug-report` für das Safari-Login-Issue: Projekt 3, Kategorie UI, Titel 'Login-Button reagiert auf Mobile Safari nicht', Beschreibung 'Ein Tipp auf den Login-Button auf iPhone 14 / Safari 17 bewirkt nichts', Schritte: Login-Seite öffnen → Anmelden antippen → nichts passiert, Erwartet: Weiterleitung zum Dashboard, Tatsächlich: Formular bleibt geöffnet.«

> »Nutze `create-feature-request` für Projekt 5, Kategorie UX: Dunkelmodus-Schalter auf der Einstellungsseite hinzufügen.«

### Zusammenfassen und Berichten

> »Führe den Prompt `summarize-issue` für Issue #1042 aus.«

> »Verwende den Prompt `project-status` für Projekt 3, um einen Überblick über offene Issues nach Schweregrad zu erhalten.«

---

## Semantische Suche

Die semantische Suche versteht die *Bedeutung* deiner Frage — nicht nur einzelne Schlüsselwörter. Sie findet konzeptionell verwandte Issues, auch wenn die genaue Formulierung abweicht. Aktivierung mit `MANTIS_SEARCH_ENABLED=true`.

### Duplikaterkennung vor dem Anlegen

> »Bevor ich ein neues Issue anlege: Hat jemand schon ein Problem mit dem Login-Formular nach einem Passwort-Reset gemeldet?«

> »Gibt es bereits ein Ticket wegen langsamer PDF-Generierung bei großen Rechnungen?«

> »Suche nach Issues ähnlich wie: 'Die Benutzersitzung geht verloren, wenn man den Browser-Tab wechselt'.«

---

### Thematische Übersichten

> »Zeig mir relevante Issues rund um die Zahlungsabwicklung — projektübergreifend.«

> »Zeig mir Beispiele für gemeldete E-Mail-Zustellungsfehler.«

> »Welche Issues erwähnen Performance-Probleme auf Mobilgeräten?«

---

### Unscharfe / terminologieunabhängige Suche

> »Finde Issues zu 'doppelten Einträgen' — sie könnten auch als 'zweimal angezeigt', 'doppelte Datensätze' oder 'Phantom-Zeilen' beschrieben sein.«

> »Suche nach authentifizierungsbezogenen Issues — die Berichte verwenden möglicherweise 'Login', 'Anmeldung', 'Token', 'Session' oder 'Auth'.«

---

### Projektübergreifende Recherche

> »Wurde der Bild-Upload-Bug, den wir im Webshop behoben haben, auch im Mobile-Projekt gemeldet?«

> »Welche Projekte haben offene Issues zu DSGVO oder Datenexport?«

---

### Einarbeitung und Wissenstransfer

> »Zeig mir Tickets, die erklären warum der Authentifizierungsfluss so gebaut wurde wie er ist.«

> »Gibt es bekannte Fallstricke beim Einrichten der Deployment-Pipeline?«

> »Welche Issues beschreiben Probleme, die beim ersten Einrichten der Entwicklungsumgebung auftreten?«

---

## Ressourcen

MCP-Ressourcen sind URI-adressierbare, schreibgeschützte Daten, die Clients direkt per URI abrufen können — kein Tool-Aufruf nötig. Die Ressourcen-Unterstützung variiert je nach Client; wenn der verwendete Client keine Ressourcen unterstützt, das entsprechende Tool als Alternative verwenden.

### Server-Zustand über Ressourcen abrufen

> »Lese `mantis://me`, um zu sehen, welches Konto der MCP-Server verwendet.«

> »Rufe `mantis://projects` ab, um die Liste der verfügbaren Projekte zu erhalten.«

> »Lese `mantis://projects/3`, um alle Details des Webshop-Projekts zu sehen: Mitglieder, Versionen und Kategorien in einem Aufruf.«

> »Lade `mantis://enums`, um die gültigen Severity- und Priority-Werte einzusehen, bevor ein Issue erstellt wird.«

### Alternative Tools für Clients ohne Ressourcen-Unterstützung

Wenn der Client keine Ressourcen unterstützt, Claude einfach das entsprechende Tool verwenden lassen:

> »Zeig mir mein Benutzerprofil.« *(verwendet `get_current_user`)*

> »Welche Projekte sind verfügbar?« *(verwendet `list_projects`)*

> »Welche Prioritätswerte sind gültig?« *(verwendet `get_issue_enums`)*
