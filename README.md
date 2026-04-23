# Option Oracle Arena

Option Oracle Arena is a multi-user options trading and learning cockpit where players train a personal oracle model, practice short-term call/put decisions in paper mode, compare progress on leaderboards, and route Tradier previews through a secure server-side broker bridge.

The current app is a Vite/TypeScript cockpit inspired by the `option-oracle/` prototype. The first screen is the trading desk: watchlist, synthetic paper option chain, equity curve, active model, paper trade journal, model lab, paper league, and broker vault. The fantasy layer is now flavor and progression, not the main interaction.

Live app: https://aetherforge-a5i.pages.dev

Public GitHub repo: https://github.com/mjfrieden/aetherforge

## What This Builds From

I evaluated the sibling projects and the later `option-oracle/` prototype:

- Orographic has the deployable Cloudflare Pages shell, Scout -> Forge -> Council engine, and server-side Tradier pattern.
- Cirrus has the stronger playbook/no-trade-gate discipline and live-versus-shadow research ledger.
- Option Oracle has the better product center: a serious options desk, model architect, paper P&L loop, and league framing.

The full write-up lives in [docs/project-evaluation.md](docs/project-evaluation.md).

## Security Model

- Multi-user accounts are stored in Cloudflare D1.
- Passwords use PBKDF2-SHA256 with per-user salts.
- Sessions are random server-side tokens stored as HttpOnly SameSite cookies.
- State-changing requests require a CSRF token.
- Tradier access tokens are encrypted with AES-GCM before storage.
- Every user connects their own Tradier token and account ID.
- The browser never sees Tradier tokens.
- Order placement is sandbox-first and limit-only.
- Live placement requires all of the following:
  - Cloudflare secret or variable `GLOBAL_LIVE_TRADING_ENABLED=true`
  - the user's Tradier connection set to `live`
  - the user's live trading flag armed
  - exact confirmation phrase `PLACE LIVE ORDER`

This is an educational simulation and control surface, not investment advice.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local secrets without committing them:

```bash
cp .dev.vars.example .dev.vars
```

Generate a 32-byte encryption key for `TOKEN_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
```

Create the D1 database and replace the placeholder `database_id` in `wrangler.jsonc`:

```bash
npx wrangler d1 create aetherforge-db
```

Run the local schema migration:

```bash
npm run migrate:local
```

Start the app:

```bash
npm run dev:pages
```

Open the local Pages URL shown by Wrangler.

## Main Screens

- `/login`: dedicated login screen
- `/register`: dedicated account creation screen
- `/game`: Option Oracle trading cockpit
- Trading Desk: watchlist, paper option chain, equity curve, active model, paper trades
- Model Lab: choose architecture, input dimensions, optimizer, and deploy the oracle
- Leagues: paper leaderboard and daily learning challenges
- Broker Vault: encrypted Tradier connection and gated single-leg order preview/placement

Run paper drills, train the oracle, scan a symbol, click contracts to simulate paper outcomes, then optionally preview a single-leg call/put order through the broker vault. Broker preview and placement controls are available after login and Tradier connection.

The oracle improves from labeled outcomes. In the current loop, players run paper drills, simulate contract decisions, and record later call/put results after a scan. A live historical market-data ingestion pass is still needed before treating predictions as research-grade trading signals.

## Deploy

Run the remote D1 migration after creating and binding the database:

```bash
npm run migrate:remote
```

Set production secrets in Cloudflare Pages:

```bash
npx wrangler pages secret put AUTH_SECRET --project-name aetherforge
npx wrangler pages secret put TOKEN_ENCRYPTION_KEY --project-name aetherforge
```

Deploy:

```bash
npm run deploy
```

## Tradier

Each user supplies their own Tradier access token and account ID in the app. Use sandbox mode first. The app sends order previews and gated order placements from Cloudflare Functions to Tradier's API. Do not put Tradier credentials into frontend code or the public repository.
