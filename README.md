# Daily Dosh

A Monzo-connected budgeting app built around one idea: **how much can I spend today?**

Each financial month runs from one payday to the next (payday is nominally the
25th, but Monzo pays a day or two early). When new pay lands, you move money
into your Monzo Pots; whatever's left in your main account is your spending
money for the month. Daily Dosh divides that across the days until next payday
and tells you, every day, how far ahead or behind you are.

```
you can spend today = days since payday × (disposable pot ÷ days in month) − spent so far
```

## How it works

- **Payday detection** — finds the salary credit from your employer (matched by
  name) and uses its date as the start of the financial month.
- **Disposable pot** — when a new payday is detected, the app asks you to
  confirm you've swept money into your pots, then snapshots your main-account
  balance (Monzo's `balance` excludes pot money). That snapshot is the month's
  budget.
- **Spent so far** — derived live from your current balance, with an
  ad-hoc *ignore* toggle on any transaction to take it out of the calculation.
- The financial month is always ~30 days, well inside Monzo's 90-day API
  history limit, so no transaction history is stored server-side — only your
  refresh token and a few settings.

## Architecture

| Part | Tech |
| --- | --- |
| Frontend | Svelte + Vite, static, served from S3 + CloudFront |
| Backend | AWS Lambda (Node 20) behind a Function URL |
| Storage | DynamoDB (refresh token + per-month settings) |
| Infra | AWS SAM (`template.yaml`) |
| CI/CD | GitHub Actions — deploys on push to `master` |

The Monzo confidential-client secret lives only in the Lambda; the browser only
ever holds an unguessable storage key. All Monzo API calls happen server-side.

```
web/                Svelte frontend
api/                Lambda backend (index.mjs + src/)
template.yaml       SAM infrastructure
.github/workflows/  deploy pipeline
```

## One-time setup

### 1. Create a Monzo OAuth client
At <https://developers.monzo.com> create a client:
- **Confidential:** `Yes` (so it's issued refresh tokens)
- **Redirect URL:** you'll fill this in after the first deploy (step 4)

Note the **Client ID** and **Client secret**.

### 2. Add GitHub repository secrets
In **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | IAM user with permission to deploy the stack |
| `AWS_SECRET_ACCESS_KEY` | — |
| `MONZO_CLIENT_ID` | from step 1 |
| `MONZO_CLIENT_SECRET` | from step 1 |
| `AWS_REGION` | *(optional, defaults to `eu-west-2`)* |

### 3. First deploy
Push to `master` (or run the **Deploy** workflow manually). It builds and
deploys the backend, then the frontend, and prints the site URL in the run
summary.

### 4. Register the redirect URI
Take the `SiteUrl` from the deploy summary and add
**`<SiteUrl>/oauth/redirect`** as the redirect URL on your Monzo client.
Open the site, tap **Connect Monzo**, and approve access in your Monzo app.

The first time in, you'll set your employer name (the app suggests recent
income to pick from), then confirm your pots — and you're running.

## Local development

```bash
# Backend: deploy once with SAM (it needs DynamoDB + Monzo secrets),
# then run the frontend against it.
cd web
echo "VITE_API_BASE=https://<your-function-url>" > .env.local
npm install && npm run dev
```

## Notes

- The deploy IAM user needs access to CloudFormation, Lambda, DynamoDB, S3,
  CloudFront and IAM (to create the function's execution role). For tighter
  scoping, switch the workflow to OIDC role assumption.
- CloudFront distributions take ~10–15 minutes to finish provisioning on the
  very first deploy.
