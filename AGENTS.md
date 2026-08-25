# PoozzleWeb

Official website for **MatchFace (变脸大作战)**, a match-3 puzzle game by QZQ Studio.

## Stack

Pure static site — HTML, CSS, vanilla JS. **No package.json, no build, no tests, no linting.**

- `index.html` — main page with embedded playable match-3 demo, i18n, boss/blocker codex, screenshot gallery
- `gameplay.js` — `window.Match3Game` class (6×6 board, drag-to-swap, cascading clears, specials)
- `style.css` — all styling
- `poozzle.html`, `team.html`, `support.html` — sub-pages for Apple App Review (privacy, team, support)

## Dependencies

- **GSAP 3.12.5** (CDN) — used for ScrollTrigger on the main page
- Google Fonts (Oswald, Open Sans)
- All game assets (tiles, boss images, icons) served from `https://assets.poozzle.com/guis/` and `https://assets.poozzle.com/icons/`

## Development

No server required — open any `.html` file directly. The playable demo runs client-side in `index.html#gameplay`.

## i18n

Inline in `index.html` as a single `i18n` object with `en` / `zh` keys. Language is persisted to `localStorage` under `matchface_lang`.

## Related

Workspace file (`PoozzleWeb.code-workspace`) references a Unity project at `../Gemer` — that is the actual game repo. This website is a marketing/support companion.

## Support

Contact: `onebelief@gmail.com`
