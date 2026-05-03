# Cumulonimbus

Cumulonimbus is a multi-user options replay and learning cockpit where players capture timestamped option-chain snapshots, train a personal replay model on resolved outcomes, compare out-of-sample scores on leaderboards, and route Tradier previews through a secure server-side broker bridge.

The current app is a Vite/TypeScript cockpit with a replay-first workflow: watchlist refresh, server-stored option-chain snapshots, paper and shadow decisions, later outcome resolution, a walk-forward model lab, event overlays, and a broker vault. The game layer now lives in progression and challenges rather than synthetic market simulation.

Live app: https://aetherforge-a5i.pages.dev

Public GitHub repo: https://github.com/mjfrieden/aetherforge

## Project Notes

The lineage and earlier sibling-project evaluation live in [docs/project-evaluation.md](docs/project-evaluation.md). The user-facing product name is now simply Cumulonimbus.

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
- `/game`: Cumulonimbus replay cockpit
- Mission Control: watchlist, replay option chain, equity curve, active model, and recent paper positions
- Model Lab: choose feature inputs, train the replay model, inspect walk-forward metrics, and attach event overlays
- Arena: leaderboard, replay challenges, and shadow-mode comparisons
- Broker Vault: encrypted Tradier connection and gated single-leg order preview/placement

Connect Tradier, refresh the replay store, capture a paper or shadow scan, let a later market snapshot resolve the outcome, then train the replay model on those resolved decisions. Broker preview and placement controls are available after login and Tradier connection.

The model now improves from normalized replay outcomes instead of client-side self-labeling. Event overlays are stored only after snapshots exist, and leaderboard rank comes from out-of-sample decision scoring rather than XP alone.

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
