# Ecuador Trivia Journey (GitHub Pages ready)

Single-page, Jeopardy-style Ecuador game. Runs directly from `index.html` with no build step and persists progress in `localStorage`. Theme blends Andes/Amazon visuals, SVG map nodes (Quito → Baños → Cuenca), AI turns, keyboard accessibility, and sound effects only (no narration).

## Quick start & deploy
- Open `index.html` in a browser, or serve locally (`python -m http.server 8000`), or push the folder to GitHub and enable **GitHub Pages** (root, `/`).
- Audio: place your SFX in `assets/audio/` using the names in the manifest. Missing files simply mute that effect.
- Clear progress from the Start screen to reset `localStorage` (`hpbb-state-v1`).

## Config (edit `js/app.js`)
- `config.timerSeconds`: answer time limit (default 24s).
- `config.ai.successByLevel`: success probability per level (defaults `{1:0.78,2:0.6,3:0.45}`).
- `config.ai.thinkMs`: AI thinking delay range in ms.
- `config.tileValues`: money per tile (default `[200,400,600]`).
- `config.audioFiles`: filenames to load from `assets/audio/`.
- AI determinism: nickname seeds the AI PRNG. Same nickname → same AI choices. For a fixed seed, set `state.aiSeed` in `localStorage` before playing.

## Data set (verbatim from user)
Single source: `data/questions.json` with fields `category`, `question`, `answer`, `value`, `level`, plus `fallbacks` and `gaps`. Strings are unchanged from the supplied image/audio.

**Información General**
- (600 lvl 1) ¿Es ecuador un pais barato o caro? — Ecuador es un país muy barato.
- (400 lvl 2) ¿Qué dinero tiene Ecuador? — Ecuador usa el dólar Americano.
- (600 lvl 3) ¿Qué río famoso está en Ecuador? — El Rio Amazones
- (400 lvl 1) ¿Qué significa "Ecuador" en inglés? — Equator
- (600 lvl 2) ¿Qué fronteras comparte Ecuador? — Ecuador comparte fronteras con Colombia y Perú.
- (200 lvl 2) ¿Ecuador está en qué continente? — Sudamerica
- (200 lvl 3) Ecuador es un pais pequeno o es un pais grande? — Ecuador es un país pequeño.
- (400 lvl 1) ¿Ecuador tiene estaciones? — No, Ecuador solo tiene una temporada seca y una temporada mojada.
- (200 lvl 1) ¿Cuál es la capital de Ecuador? — Quito

**Lugares**
- (400 lvl 1) ¿Dónde está Quito en Ecuador? — En las montañas y en el medio de Ecuador.
- (200 lvl 3) ¿Cómo se llama el volcán de Quito? — Cotopaxi
- (200 lvl 1) ¿Cómo se llaman las islas famosas en Ecuador? — Las Islas Galapagos
- (600 lvl 2) ¿Cómo se llama el lugar que tiene un río hermoso, es muy antiguo y es muy barato? — Cuenca
- (400 lvl 2) ¿Qué puedes tomar cuando tomas un tram en Cotopaxi? — Puedes tomar fotos.
- (600 lvl 1) ¿Qué lugar turístico está en el centro de Ecuador? — Baños
- (200 lvl 2) ¿Qué significa agua termales en inglés? — Hot Springs
- (600 lvl 3) ¿Cómo se llama la ciudad en Ecuador que está enfrente de la playa y tiene tiendas pequeñas? — Montanita
- (400 lvl 3) ¿Qué lugar tiene muchos deportes exóticos? — Baños

**La Cultura y los Animales**
- (200 lvl 3) ¿Qué es una chiva? — A local party bus
- (600 lvl 2) ¿Cómo son especiales de los animales en las Islas Galápagos? — Los animales son exóticos y no tienen miedo de las personas.
- (600 lvl 3) ¿Qué parte de Quito tiene más fiestas y música, La Parte Vieja o La Parte Musical? — La Parte Mursical
- (200 lvl 1) ¿Las escuelas en Ecuador son más estrictas de los de Estados Unidos? — Si
- (200 lvl 2) ¿Los estudiantes pueden tener chicha en sus bocas en Ecuador? — No
- (400 lvl 1) ¿Qué ropa tienen que los estudiantes en Ecuador? — Uniformes
- (400 lvl 2) ¿Tienen electivos en las escuelas de Ecuador? — A veces, pero normalmente: no.
- (600 lvl 1) ¿Hay un lugar en Ecuador que tiene muchos animales muy diversos? — Si, la selva Amazónica (o las islas Galápagos).
- (400 lvl 1) ¿Hay perezosos en Ecuador? — Si, hay perezosos en la selva Amazónica.

**Data verification & gaps**
- No low-confidence strings; punctuation/capitalization kept verbatim.
- Missing `$400` for level 3 in Información General and La Cultura y los Animales are logged in `gaps`; `fallbacks` reuse provided level-1 `$400` entries so each category still shows $200/$400/$600. Replace these when true level-3 `$400` items exist.

## Update the question set
1) Edit only `data/questions.json`.  
2) Keep fields `category`, `question`, `answer`, `value`, `level`. Ensure each category/level has $200/$400/$600. If not, map `"<Category>|<Level>|<Value>"` to an existing `id` in `fallbacks`.  
3) Reload the page; a friendly message appears if JSON fails.  
4) Update this README section if strings change.

## Accessibility & UX
- Keyboard: map nodes, tiles, modal controls, and inputs are tabbable; Enter triggers actions; Esc closes the question modal.
- ARIA: live regions for HUD/feedback, `role="dialog"` on the modal, labels on map nodes and buttons.
- Toggles: high contrast, reduced motion, light/dark theme, SFX/music.
- Responsive layout for phones/tablets/desktops; HUD and timer stay visible.

## Persistence & resilience
- Progress, scores, settings, unlocked cities, and answered tiles persist in `localStorage` (`hpbb-state-v1`).
- Clear progress button wipes storage and restores defaults.
- If `data/questions.json` fails to load, the board shows a gentle error instead of crashing.

## Audio
- Only SFX are used; no narration. Expected filenames in `assets/audio/`: `select.mp3`, `correct.mp3`, `incorrect.mp3`, `end.mp3`, `ui.mp3`.
- Audio respects the SFX toggle, resets `currentTime` to avoid overlap, and starts after a user gesture for mobile compatibility.

## Assets manifest
- Third-party: `canvas-confetti@1.6.0` (celebration), Google Fonts (`Manrope`, `DM Serif Display`).
- Local: `assets/audio/*` (user-supplied SFX). Inline SVG map in `index.html`.

## Test plan (matches acceptance criteria)
1. Load & deploy: open `index.html` locally and via GitHub Pages; verify no console errors.  
2. Start screen: enter nickname ≤20 chars; toggle sound/theme/contrast/motion; Play; refresh to confirm settings persist.  
3. Intro: step through cards, practice question, confirm auto-navigation to map.  
4. Map progression: Quito clickable, Baños/Cuenca locked; complete Quito to unlock Baños (solid line), repeat for Cuenca.  
5. Board: each city shows 3 categories with $200/$400/$600; tiles disable after play.  
6. Questions integrity: displayed strings match the Data section verbatim; fallback tiles noted for level-3 $400 gaps.  
7. Answer modes & timer: text and multiple-choice both work; timeout counts incorrect; money updates immediately.  
8. AI determinism: with the same nickname, AI picks identical tiles and outcomes after refresh.  
9. Persistence: refresh mid-level; scores/unlocked cities/disabled tiles remain. Clear progress resets all.  
10. End game: after all cities, see confetti, stats (money, correct/incorrect, biggest tile, fastest answer, time), and working Play Again/Restart/Share/Download.
