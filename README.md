# Inspirationsfeed

Swipe-værktøj til designinspiration, trænet per kunde (Albatros og LokalBolig). Henter nye sites fra Siteinspire hver morgen og kan lade Claude tagge farve og stemning ud fra screenshottet.

## Sæt det op (ca. 15 minutter, på computeren)

1. **Opret et repo** på github.com: *New repository*, navn `inspirationsfeed`, vælg **Public**.
2. **Upload filerne.** Pak zip-filen ud. Tryk `Cmd + Shift + .` i Finder, så den skjulte mappe `.github` bliver synlig. Klik *uploading an existing file* i dit nye repo og træk **hele indholdet** af mappen ind (også `.github`). Tryk *Commit changes*.
3. **Slå GitHub Pages til:** *Settings → Pages → Source: Deploy from a branch → Branch: main, / (root) → Save*.
4. **Valgfrit: Claude-tagging.** Uden det virker alt, men farve og stemning tagges kun der, hvor Siteinspire selv har gjort det.
   *Settings → Secrets and variables → Actions → New repository secret*. Navn: `ANTHROPIC_API_KEY`, værdi: din nøgle fra console.anthropic.com.
5. **Kør første opdatering:** *Actions → Opdater feed → Run workflow*. Herefter kører den selv hver morgen.
6. **Åbn på mobilen:** `https://DIT-BRUGERNAVN.github.io/inspirationsfeed/`. I Safari: *Del → Føj til hjemmeskærm*.

## Godt at vide

- **Profilen gemmes i den browser, du swiper i.** Swipe primært på én enhed, så den lærer hurtigst.
- **Dine Ja'er** ligger under *Profil* med links, så du kan finde dem igen.
- **Filen virker ikke som lokal fil** (dobbeltklik). Den skal åbnes via GitHub-linket.
- **Flere kilder:** Tilføj RSS-feeds øverst i `scripts/fetch-feed.mjs` under `FEEDS`.
- **Pris for Claude-tagging:** maks. 40 billeder per dag med en lille model. Det er småpenge.

## Filer

- `index.html`: swiperen
- `feed.json`: sites og tags (opdateres automatisk)
- `scripts/fetch-feed.mjs`: henter feeds og tagger
- `.github/workflows/update.yml`: kører scriptet hver morgen
