# Contributing

This document describes the branches, the release procedure, the rules for changes and the local tests.

## Branches and addresses

| Branch | Deployed to | Address |
|---|---|---|
| `main` | Production (Cloudflare Workers) | <https://cfmoto-web-coding.untiring1337.workers.dev/> |
| `dev` | Preview (GitHub Pages) | <https://untiring1337.github.io/cfmoto-web-coding/> |

The workflow `.github/workflows/ci.yml` deploys each branch after the browser simulations and the site checks pass. Only the newest commit on the branch is deployed. A run for an older commit, also a re-run of an older run, does not deploy.

The preview shows a banner with the build ID (`dev` and the short commit ID). The banner tells users not to use the preview on a motorcycle. On the production address, the banner is hidden. The preview has its own risk acknowledgement: an acknowledgement given to the released tool does not enable *Connect* in the preview.

The preview uses the address of the first release. For this reason, the preview deploy starts only when the production address serves the released tool.

Only the files in `site/` are served.

## Release procedure

1. Create a branch from `dev`.
2. Open a pull request into `dev`. CI runs the browser simulations and the site checks.
3. Merge the pull request. CI deploys the preview.
4. Test the preview on a motorcycle. Do a dry run as a minimum. If the change has an effect on a write, also do a write and a restore.
5. Open a release pull request from `dev` into `main`. Merge it with a **merge commit**. Do not use squash or rebase, because then `dev` and `main` get different histories.
6. CI deploys production and checks the responses from the production address. If a step fails or the run is cancelled, CI sets production back to the version from before the deploy.

The check *Release source* (`.github/workflows/release-checks.yml`) fails for a pull request into `main` from a branch other than `dev`. It runs again when the base branch of a pull request changes. It also fails while the GitHub Pages source is not *GitHub Actions*.

## Rules for changes

- **Do not change the production address.** The browser keeps its storage (for example the saved original F010 value) for each address. If the address changes, users cannot see their saved original value at the new address.
- **Keep the storage keys and the stored formats compatible.** The preview uses the address of the first release (`untiring1337.github.io`). Users of the first release have their saved original F010 value at that address. The preview code must read this data correctly and must not change it.
- **Use relative URLs in `site/`.** The preview serves the site below `/cfmoto-web-coding/`, production serves it at `/`. The site checks reject URLs that start with `/`.
- **Keep one production origin.** `PRODUCTION_ORIGIN` in `site/index.html` is the reference. The canonical link, the banner, `site/404.html`, `README.md` and this document use the same origin. The site checks compare them.
- **Write all user-facing text in ASD-STE100 Simplified Technical English.**
- **Update the golden snapshots only for an intended change.** Refer to [tests/README.md](tests/README.md).

## HTTP headers

`site/_headers` sets the security headers (Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, Cross-Origin-Opener-Policy) for all production responses. GitHub Pages cannot set headers, so the preview deploy does not include this file.

The browser simulations apply the same headers to every response. A blocked script, style or browser feature fails the simulation. The site checks also start `wrangler dev`, which uses the Cloudflare asset server, and compare the real responses with `site/_headers`.

## Local development

Requirements: Node.js 26 (the version in `.nvmrc`) and npm 11 or later.

```sh
npm ci                                  # installs wrangler at the exact version from package-lock.json
npm run dev                             # serves site/ at http://localhost:8787 with the production headers
node tests/site-check.mjs static        # file checks
node tests/site-check.mjs local         # response checks against wrangler dev
npm run check                           # validates the Worker configuration (no upload)
```

wrangler sends usage metrics to Cloudflare by default, and `send_metrics` in `wrangler.jsonc` does not stop all of them. To stop them, set the environment variable `WRANGLER_SEND_METRICS=false`. CI sets this variable.

For the browser simulations, refer to [tests/README.md](tests/README.md).

`package.json` denies the install scripts of `esbuild` and `workerd` (`allowScripts`). wrangler does not need them, because npm installs the platform binaries as optional dependencies. If a dependency update adds a package with an install script, npm shows it. Examine the script before you approve it with `npm install-scripts approve`.

## Rollback

**Production:**

1. Roll back in the Cloudflare dashboard (Workers & Pages, `cfmoto-web-coding`, Deployments), or run `npx wrangler rollback` with the Cloudflare credentials.
2. Revert the change on `dev`. Then do a release (steps 5 and 6 of the release procedure).

Until the revert is released, do not merge into `main` and do not start the workflow on `main`. A deploy from `main` replaces the rollback.

**Preview:** Revert the change on `dev`.

## Repository configuration

These settings are necessary for the deploys. Only the repository owner can change them.

- Environment `production`: deployment branch `main` only. Secrets `CLOUDFLARE_API_TOKEN` (token from the "Edit Cloudflare Workers" template, for this account only) and `CLOUDFLARE_ACCOUNT_ID`.
- Environment `github-pages`: deployment branch `dev` only.
- Pages source: *GitHub Actions*. The check *Release source* fails for other settings.
- Rulesets: `main` and `dev` require a pull request and the checks *Browser simulations* and *Site checks*. `main` also requires *Release source* and allows merge commits only. `dev` cannot be deleted.
