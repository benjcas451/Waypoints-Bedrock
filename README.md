# Waypoints-Bedrock

Ein AddOn für **Minecraft Bedrock Edition**, das Wegpunkte und Teleportation zwischen ihnen bietet.
Es ist die Bedrock-Version des Paper-Plugins [WayPoints-Server-Paper](https://github.com/benjcas451/WayPoints-Server-Paper)
mit denselben Spielregeln, Texten und Einstellungen.

Es läuft überall, wo Bedrock-AddOns laufen: Einzelspieler-Welten, LAN, Realms und der Bedrock Dedicated Server (BDS).
Experimentelle Funktionen müssen **nicht** aktiviert werden.

Die Spielidee ist an [Waystones](https://github.com/TwelveIterations/Waystones) angelehnt. Der Code ist komplett
neu geschrieben, Waystones-Code wird weder kopiert noch eingebunden.

## Funktionen

- **Wegpunkt erstellen:** einen Magnetit (Lodestone) setzen und ein im Amboss umbenanntes **Namensschild** darauf benutzen.
  Das Namensschild wird dabei verbraucht (im Kreativmodus nicht).
- **Aktivieren:** Benutzen (Rechtsklick / Antippen) eines Wegpunkts schaltet ihn für den Spieler frei und öffnet das Menü.
- **Menü:** ein natives Bedrock-Formular mit einem Button pro bekanntem Wegpunkt (mit Kosten und Dimension).
  Ein Klick teleportiert dorthin. Ganz unten stehen die Verwaltungs-Buttons für den Wegpunkt, an dem man gerade steht
  (nur für Besitzer und Operatoren): **Sichtbarkeit ändern** und **Umbenennen**.
- **Kosten & Wartezeit:** Erfahrungslevel pro Teleport (eigener Wert für andere Dimensionen), Wartezeit zwischen Teleports.
- **Sichtbarkeit:** Jeder Wegpunkt ist entweder für **alle Spieler** sichtbar oder **nur für Besucher**, also Spieler,
  die ihn schon einmal benutzt haben. Besitzer können das im Menü umschalten, Operatoren auch per Befehl.
- **Schutz:** Nur Besitzer oder Operatoren dürfen einen Wegpunkt abbauen, umbenennen oder seine Sichtbarkeit ändern.
  Explosionen (Creeper, TNT …) lassen geschützte Wegpunkte stehen.
- **Schwebender Name** über jedem Wegpunkt (gold = für alle sichtbar, türkis = nur für Besucher).
- Kompasse lassen sich weiterhin an Magnetit binden, mit Schleichen + Block in der Hand baut man normal daran.
- Wird der Block auf anderem Weg zerstört (Kolben, Befehl …), räumt das AddOn den Wegpunkt beim nächsten Teleportversuch auf.
  Der Spieler zahlt dann nichts und landet wieder dort, wo er losgegangen ist.
- **Sprache:** Deutsch und Englisch. Jeder Spieler sieht die Texte in der Sprache seines eigenen Spiels.

## Installation

Die fertige Datei `WayPoints-<version>.mcaddon` gibt es unter *Releases* (oder unter *Actions → Lauf → Artifacts*).
Sie enthält zwei Pakete, die zusammengehören: das **Verhaltenspaket** (`WayPoints_BP`, die Spiellogik) und das
**Ressourcenpaket** (`WayPoints_RP`, Texte und die Namensanzeige).

### Einzelspieler, LAN, Realms

1. `WayPoints-<version>.mcaddon` öffnen (Doppelklick unter Windows, „Öffnen mit Minecraft“ auf Mobilgeräten).
   Minecraft importiert beide Pakete.
2. Welt bearbeiten → **Verhaltenspakete** → *WayPoints* aktivieren. Das Ressourcenpaket wird automatisch mit aktiviert.
3. Für Realms: die Welt mit aktiviertem AddOn auf das Realm hochladen (oder das AddOn in den Realm-Einstellungen aktivieren).

### Bedrock Dedicated Server

1. Die `.mcaddon` ist eine Zip-Datei. Entpacken und
   - `WayPoints_BP` nach `behavior_packs/`,
   - `WayPoints_RP` nach `resource_packs/` kopieren.
2. In `worlds/<Weltname>/world_behavior_packs.json` eintragen:

   ```json
   [{ "pack_id": "fbb2331f-abe9-4518-a57a-6aadd29ed970", "version": [0, 1, 0] }]
   ```

   und in `worlds/<Weltname>/world_resource_packs.json`:

   ```json
   [{ "pack_id": "a8d983f8-a67c-47bc-b58c-7f24d70b0c20", "version": [0, 1, 0] }]
   ```

   Die Version muss zur heruntergeladenen Version passen (`0.2.0` → `[0, 2, 0]`).
3. In `server.properties` `texturepack-required=true` setzen, damit alle Spieler die Texte und Namensanzeigen bekommen.
4. Server neu starten. Im Log steht `[WayPoints] Loaded … waypoints`.

Mindestversion: **Minecraft Bedrock 1.21.100** (Script-API `@minecraft/server` 2.1.0, `@minecraft/server-ui` 2.0.0).

## Befehle

Wegpunkt-Namen mit Leerzeichen in Anführungszeichen setzen, z.B. `/waypoints tp "Mein Haus"`.
Statt `/waypoints` geht auch kurz `/wp`.

| Befehl | Wer | Beschreibung |
|---|---|---|
| `/waypoints list` | alle | Bekannte Wegpunkte auflisten (Operatoren sehen alle) |
| `/waypoints menu` | Tag `waypoints.menu` oder `allowMenuCommand` | Menü überall öffnen |
| `/waypoints tp <name>` | Operatoren | Kostenlos zu einem Wegpunkt teleportieren |
| `/waypoints public <name>` | Operatoren | Wegpunkt für alle Spieler sichtbar machen |
| `/waypoints private <name>` | Operatoren | Wegpunkt nur für Besucher sichtbar machen |
| `/waypoints rename <name> <neuer Name>` | Operatoren | Wegpunkt umbenennen |
| `/waypoints remove <name>` | Operatoren | Wegpunkt löschen |
| `/waypoints settings` | Operatoren | Einstellungen im Formular ändern |

Sollte ein anderes AddOn ebenfalls `/waypoints` oder `/wp` anbieten, funktioniert der Befehl mit Namensraum:
`/waypoints:waypoints …` bzw. `/waypoints:wp …`. Die Befehle brauchen **keine** aktivierten Cheats.

## Berechtigungen

Bedrock kennt keine Berechtigungs-Plugins. Stattdessen gilt:

| Wer | Darf |
|---|---|
| **Operatoren** (Berechtigungsstufe „Operator“) oder Spieler mit dem Tag `waypoints.admin` | Alle Wegpunkte verwalten (abbauen, umbenennen, Sichtbarkeit), die Admin-Befehle, die Einstellungen, Erstellen trotz `creationRequiresOp` und `maxWaypointsPerPlayer` |
| Spieler mit dem Tag `waypoints.menu` | `/waypoints menu` |

Tags vergibt ein Operator mit `/tag <Spieler> add waypoints.admin` bzw. `/tag <Spieler> remove waypoints.admin`.

## Einstellungen (`/waypoints settings`)

Bedrock-AddOns haben keine Konfigurationsdatei. Die Einstellungen stehen in der Welt und werden von Operatoren mit
`/waypoints settings` in einem Formular geändert. Sie gelten sofort.

| Option | Standard | Beschreibung |
|---|---|---|
| `waypointBlock` | `minecraft:lodestone` | Block, der als Wegpunkt dient. Bestehende Wegpunkte aus einem anderen Block verschwinden beim nächsten Teleport! |
| `requireNameTag` | an | Erstellen nur mit Namensschild (sonst auch Schleichen + Benutzen mit leerer Hand) |
| `creationRequiresOp` | aus | Nur Operatoren dürfen Wegpunkte erstellen |
| `maxWaypointsPerPlayer` | `0` | Maximale Anzahl eigener Wegpunkte pro Spieler (0 = unbegrenzt) |
| `protectWaypoints` | an | Nur Besitzer/Ops dürfen abbauen und umbenennen, Explosionen verschonen Wegpunkte |
| `ownersCanChangeVisibility` | an | Besitzer dürfen die Sichtbarkeit ihrer Wegpunkte umschalten (Operatoren immer) |
| `showLabels` | an | Namen über dem Wegpunkt anzeigen |
| `xpCostLevels` | `1` | Kosten in Leveln innerhalb einer Dimension |
| `xpCostCrossDimensionLevels` | `3` | Kosten in Leveln in eine andere Dimension |
| `allowCrossDimension` | an | Teleport zwischen Dimensionen erlauben |
| `cooldownSeconds` | `10` | Wartezeit zwischen Teleports |
| `creativeIgnoresCost` | an | Kreativmodus zahlt nichts und hat keine Wartezeit |
| `allowMenuCommand` | aus | Alle Spieler dürfen `/waypoints menu` benutzen |

## Unterschiede zum Paper-Plugin

- **Keine Übernahme von Java-Welten:** Bedrock speichert Welten in einem anderen Format. Die Wegpunkte einer
  Paper-/Fabric-Welt (`waypoints.dat`) und die Waystones-Migration lassen sich deshalb nicht übernehmen.
  Wer Java- und Bedrock-Spieler auf **einem** Server haben will, nimmt weiterhin das Paper-Plugin mit GeyserMC.
- **Kein Truhen-Menü und keine Seiten:** Das Bedrock-Formular ist scrollbar, alle Wegpunkte stehen auf einer Seite.
- **Keine Farm-Welten (`adminOnlyWorlds`):** Bedrock hat nur Oberwelt, Nether und End, ein Multiverse gibt es nicht.
- **Berechtigungen** über Operator-Status und Tags statt über Berechtigungs-Plugins (siehe oben).
- **Sprache** pro Spieler statt einer festen Sprache für den Server.
- **Ziel in nicht geladenem Gebiet:** Der Spieler wird zuerst hingebracht, damit das Spiel das Gebiet lädt. Fehlt der
  Wegpunkt-Block dort, geht es kostenlos zurück zum Ausgangspunkt.

## Technisches

- Die Wegpunkte stehen als *Dynamic Properties* in der Welt (`waypoints:wp:<id>`, je Spieler `waypoints:known:<id>`
  für freigeschaltete Wegpunkte, `waypoints:config` für die Einstellungen). Sie wandern mit jeder Welt-Kopie und jedem Backup mit.
- Die Namen über den Wegpunkten sind unsichtbare Entities (`waypoints:label`). Wurden sie entfernt (z.B. mit `/kill @e`),
  setzt das AddOn sie beim nächsten Benutzen des Wegpunkts wieder.
- Wird das AddOn entfernt, bleiben die Magnetit-Blöcke als normale Blöcke stehen. Die Namens-Entities verschwinden
  mit dem Ressourcen-/Verhaltenspaket.

## Entwicklung

Voraussetzung: Node.js 22.

```sh
npm install
npm run check   # Typprüfung der Skripte gegen die Script-API (TypeScript, checkJs)
npm test        # Tests für Speicher, Einstellungen, Namen, Übersetzungen und Manifeste
npm run build   # baut dist/WayPoints-<version>.mcaddon
```

Aufbau:

```
packs/behavior_pack/   Verhaltenspaket: manifest.json, entities/label.json, scripts/
  scripts/main.js      Einstieg: Events (Benutzen, Abbauen, Explosionen)
  scripts/manager.js   Erstellen, Umbenennen, Entfernen, Namensanzeigen, Teleport
  scripts/menu.js      Wegpunkt-Menü und Umbenennen (Formulare)
  scripts/settings.js  Einstellungs-Formular
  scripts/commands.js  /waypoints
  scripts/lib/         reine Logik ohne Minecraft-Abhängigkeit (Speicher, Einstellungen, Namen), getestet mit Node
packs/resource_pack/   Ressourcenpaket: Texte (texts/*.lang) und die unsichtbare Namens-Entity
tools/build.mjs        packt beide Pakete in eine .mcaddon
```

Zum Ausprobieren ohne Build die Ordner `packs/behavior_pack` und `packs/resource_pack` in die `development_behavior_packs`
bzw. `development_resource_packs` von Minecraft kopieren (oder verlinken). Änderungen an Skripten lädt `/reload` neu.

### Automatische Builds & Releases

Der Workflow `.github/workflows/build.yml` prüft, testet und baut das AddOn bei jedem Push und Pull Request.
Die `.mcaddon` liegt danach unter *Actions → Lauf → Artifacts*.

Bei einem Push auf `main` erstellt er außerdem ein GitHub-Release `v<version>` mit der `.mcaddon`, sofern es dieses
Release noch nicht gibt. Die Version steht in `package.json` (`"version": "0.1.0"`) und wird beim Bauen in beide
Manifeste geschrieben. Für ein neues Release also die Version erhöhen und auf `main` pushen. Versionen mit Bindestrich
(z.B. `0.2.0-beta.1`) werden als Pre-Release markiert.
