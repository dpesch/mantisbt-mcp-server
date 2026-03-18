# Anwendungsbeispiele

Praktische Beispiele für die Interaktion mit MantisBT über Claude, sobald der MCP-Server verbunden ist. Einfach in natürlicher Sprache fragen — keine Tool-Namen oder Parameter erforderlich.

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

---

### Triage und Auswertung

> »Gib mir einen Überblick über alle kritischen und dringenden offenen Issues in allen Projekten.«

> »Welche Issues im Backend-Projekt sind seit mehr als 30 Tagen ohne Aktivität offen?«

> »Was sind die häufigsten Bug-Typen der letzten sechs Monate?«

> »Fasse die Notizen zu Issue #774 zusammen und schlage einen nächsten Schritt vor.«

> »Liste alle Issues mit dem Tag 'regression' und fasse zusammen, was schiefgelaufen ist.«

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
