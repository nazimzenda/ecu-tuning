# GitHub Actions workflow

GitHub blocks pushes that create or update `.github/workflows/*` unless the
credential has the `workflow` scope. The workflow in this folder is ready to
use; install it after granting that scope:

```bash
gh auth refresh -s workflow
mkdir -p .github/workflows
cp ci/github-actions-deploy.yml .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "ci: install GitHub Actions workflow"
git push
```

The workflow runs syntax checks and the integration tests on every push/PR.
Deployment jobs are skipped automatically when Cloudflare secrets,
`CLIENT_API_BASE_URL`, or a D1 `database_id` are not configured.

Required for automatic Cloudflare deployment:

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Variable: `CLIENT_API_BASE_URL` (public API origin for the Pages UI)
- `workers/wrangler.toml`: a real D1 `database_id`
