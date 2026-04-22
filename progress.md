Original prompt: Please evaluate our current Orographic project and Cirrus projects. Please create a multi user video game where people can train their own AI to predict stock options and trade stocks. Make sure it has proper security for multiple users to log in and trade through tradier separately. Give it a Legend of Zelda breath of the wild meets clouds and greek gods theme for user experience / interface. Host it in a public github and host the game on a cloudflare page or acceptable free alternative.

## 2026-04-21

- Evaluated Orographic and Cirrus as sibling projects.
- Created Aetherforge as a new Cloudflare Pages app in the empty Cumulonimbus folder.
- Added D1 schema for users, sessions, per-user Tradier accounts, models, game state, audit events, rate limits, and trade intents.
- Added secure auth routes with PBKDF2 password hashing, HttpOnly session cookies, CSRF tokens, rate limiting, and audit logging.
- Added AES-GCM encrypted per-user Tradier token storage and sandbox-first broker routes.
- Added model training/prediction endpoints using a small per-user logistic model.
- Added a themed canvas game with deterministic `window.advanceTime(ms)` and `window.render_game_to_text`.
- Added project evaluation documentation and local/deploy instructions.
- Patched session creation to return the generated CSRF token to login/register callers.
- Installed dependencies and passed the initial Node unit tests.
- Created Cloudflare D1 database `aetherforge-db` with id `3e6dcb20-9d4f-47ca-b249-f9215748cd1f` and bound it as `DB`.
- Ran local signed-out and authenticated Playwright smoke tests. Tightened the first pickup placement and HUD refresh after verifying the first authenticated run.
- Ran desktop and mobile Playwright checks with zero console errors.
- Created public GitHub repo: https://github.com/mjfrieden/aetherforge
- Created Cloudflare Pages project `aetherforge`, set generated production `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY`, deployed, and smoke-tested production at https://aetherforge-a5i.pages.dev
- Production smoke test passed registration, model training, and broker preview gating. Broker preview correctly returns `Tradier is not connected for this user` until a user stores their own Tradier account.

TODO:

- Optional: connect the Cloudflare Pages project to the GitHub repo in the Cloudflare dashboard if continuous deployment from `main` is desired instead of direct Wrangler uploads.
- Optional: add Tradier OAuth/partner flow if Tradier grants the app a multi-user OAuth integration. Current implementation supports per-user personal/sandbox token storage.
- Optional: add richer historical data import for user-trained models beyond game-collected sample rows.

## 2026-04-22

- User rejected the first canvas game direction and asked for a Pokemon-like stock-options game.
- User also requested a dedicated login page separate from the main game UI and asked whether there is a better platform direction than Cloudflare.
- Decision: rebuild the frontend as a Phaser 3 + Vite + TypeScript browser game, with standalone `/login`, `/register`, and `/game` pages.
- Preserved the existing secure Cloudflare Pages Functions backend for this pass so auth/session/CSRF/encrypted Tradier-token protections do not regress while the game is overhauled.
- Used two image-generation calls only: one reusable cloud-colosseum battle background and one reusable four-creature sprite sheet. Copied both into `src/client/assets/generated/`.
- Added `docs/platform-roadmap.md` to document the recommended Vercel/Supabase future path and the practical current boundary.
