# Deploy Automation

Cumulonimbus production deploys should run from GitHub, not from a developer laptop. The repository now includes a GitHub Actions workflow at `.github/workflows/deploy-production.yml` that:

1. installs dependencies
2. verifies Cloudflare auth
3. runs `npm test`
4. runs `npm run build`
5. runs `npm run migrate:remote`
6. deploys `public/` to Cloudflare Pages

## Required Secret

Add this GitHub repository secret before relying on the workflow:

- `CLOUDFLARE_API_TOKEN`

The token should have access to the Cloudflare account `fb7bb10f51e3f6c0fe572d28a3a7e1f4` and enough permission to:

- edit Pages deployments for project `aetherforge`
- edit D1 database `aetherforge-db`

If you prefer to scope it more tightly, use the smallest token that can successfully complete:

- `npx wrangler whoami`
- `npm run migrate:remote`
- `npx wrangler pages deploy public --project-name aetherforge --branch main`

## Expected Flow

- Every push to `main` triggers a production deploy.
- You can also run the workflow manually with GitHub Actions `workflow_dispatch`.
- Cloudflare Pages project secrets such as `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` remain managed in Cloudflare, not GitHub.

## Setup Checklist

1. In GitHub, open the `mjfrieden/aetherforge` repository settings.
2. Add the `CLOUDFLARE_API_TOKEN` repository secret.
3. Push this workflow to `main`.
4. Confirm the first run succeeds in the Actions tab.

## Manual Fallback

If GitHub Actions is unavailable, the manual production path is still:

```bash
npx wrangler whoami
npm run migrate:remote
npm run deploy
```

That path still requires valid local Cloudflare auth.
