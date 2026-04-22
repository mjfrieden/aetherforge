# Aetherforge Platform Roadmap

## Recommendation

Aetherforge should be a Phaser/Vite browser MMO-style game first. The game code is host-agnostic: Vite builds static files into `public/`, while secure server routes remain isolated from the browser.

The ideal long-term product stack is:

- Phaser 3 + TypeScript + Vite for the explorable game client.
- Dedicated `/login`, `/register`, and `/game` pages.
- Supabase Auth + Postgres for multi-user identity and game state.
- A real-time presence layer for true MMO behavior; Cloudflare Durable Objects or Supabase Realtime are both reasonable candidates.
- Server-side Tradier routes for broker previews and gated order placement.
- Vercel or another first-class Vite host for the frontend.

## Current Practical Boundary

This repo already had working Cloudflare Pages Functions for auth, encrypted per-user Tradier token storage, CSRF, sessions, D1 persistence, and order gating. Those security-sensitive routes were preserved during the game rebuild so trading protection did not regress.

Moving fully to Supabase requires creating a Supabase project, deciding auth policies, setting Row Level Security, and migrating existing D1 data. Until those credentials and ownership choices exist, the safe move is:

1. Ship the Phaser MMO-style game overhaul on the existing secure backend.
2. Keep the frontend build portable.
3. Migrate backend storage/auth to Supabase in a dedicated pass.

## Image Budget Discipline

Only two image-generation calls were used for the v2 art pass:

- A reusable battle arena background.
- A reusable four-creature sprite sheet.

The game reuses those assets with Phaser, DOM UI, tinting, motion, and state changes instead of generating images dynamically for users. No OpenAI key is exposed to the browser.
