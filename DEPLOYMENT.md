# Tayoo Church Platform

Next.js 15 / Prisma / PostgreSQL platform for church attendance, QR scans, points, and tenant management.

## Free hosting: important limits

Vercel Hobby and Supabase Free offer a no-card starting path; choose the free plans, not a Pro trial or paid Marketplace integration. Use the included `vercel.app` domain to avoid domain purchase costs. If onboarding requests payment, stop and verify the selected plan.

**Free does not mean guaranteed permanent uptime.** Vercel Hobby is restricted to personal, non-commercial use. A church/organization deployment is not automatically eligible just because it is nonprofit; confirm eligibility with Vercel before relying on Hobby. Quotas can pause service. Supabase Free currently pauses projects after one week of inactivity and includes a 500 MB database limit. Neither this guide nor the code can guarantee that providers keep their free plans forever. Do not use artificial traffic to bypass inactivity policies. Maintain independent database backups.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase pricing](https://supabase.com/pricing).

## 1. Local setup and checks

Run commands from `C:\Users\pavly\tayoo-church-platform`. Use Node.js 24.x (the locally tested version) and npm.

1. Copy `C:\Users\pavly\tayoo-church-platform\.env.example` to `C:\Users\pavly\tayoo-church-platform\.env` if it does not already exist. Never overwrite existing secrets blindly.
2. Fill in database URLs, a random JWT secret, and unique bootstrap credentials (password at least 16 characters).
3. For local PostgreSQL only, run `docker compose up -d`. The compose credentials are development-only. Use `postgresql://tayoo:tayoo@localhost:5432/tayoo` for both local database URLs; do not use this URL on Vercel.
4. Run:

```powershell
npm ci
npx prisma validate
npm run lint
npm run build
```

Generate a JWT secret without an external service:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

JWT secrets must be at least 32 characters. Never prefix database credentials or signing secrets with `NEXT_PUBLIC_`: those variables are public. The current UI does not use `NEXT_PUBLIC_APP_NAME` or `NEXT_PUBLIC_APP_URL`, so neither is required.

## 2. Create and initialize the production database

1. Create a **Free** Supabase project directly at supabase.com. Choose a strong database password and a region close to your Vercel Functions region.
2. In **Connect**, copy the actual URLs (including the project-specific username):
   - `DATABASE_URL`: transaction pooler, port `6543`, with `pgbouncer=true&connection_limit=1&sslmode=require`.
   - `DIRECT_URL`: session pooler, port `5432`, with `sslmode=require`. This is IPv4-compatible for migrations; the direct host may require IPv6.
   - URL-encode special characters in passwords. Append parameters with `&` if the URL already contains `?`.
3. Put these values in the local ignored environment file for this initialization step. Keep `SEED_DEMO=false`; set the bootstrap phone, name and a unique password.
4. **Before exposing the first deployment**, run from your trusted machine:

```powershell
$env:NODE_ENV = 'production'
$env:SEED_DEMO = 'false'
npm run db:deploy
# Continue only if migration deployment succeeds.
npm run db:seed
Remove-Item Env:NODE_ENV
Remove-Item Env:SEED_DEMO
```

The seed command loads the environment through Prisma and creates only the super-admin by default. Existing credentials are not reset by re-seeding. Demo data requires explicit `SEED_DEMO=true` and is blocked when `NODE_ENV=production`; never enable it against a production database. Old demo accounts are not removed automatically: remove/rotate them if a previous seed created them.

These migrations initialize PostgreSQL, not an existing SQLite database. Back up and plan a separate data migration if you have existing records. Never run `db:push`, `migrate dev`, or reset commands against production. Do not seed or migrate automatically in Vercel builds: previews must not modify production data.

## 3. Push to GitHub

Create an empty repository in your **personal GitHub account** (no generated README). This workspace already has Git initialized and no remote configured. Review your existing uncommitted work before staging:

```powershell
git status --short
git check-ignore .env .env.local node_modules/package.json
git ls-files -- .env .env.local node_modules
```

The last command must output nothing. Only the credential-free example environment file should be committed. If real secrets were ever committed, untracking them is insufficient: rotate them and clean history before publishing.

```powershell
git add .
git diff --cached --stat
git commit -m "Prepare Vercel deployment"
git branch -M main
git remote add origin https://github.com/YOUR_ACCOUNT/tayoo-church-platform.git
git push -u origin main
```

Replace `YOUR_ACCOUNT` with your GitHub username. If a remote already exists, inspect `git remote -v` instead of adding it again. Commit the lockfile and migrations along with the application.

## 4. Deploy on Vercel

1. Sign up at vercel.com with GitHub and select **Hobby** (subject to the eligibility above); do not enter card details or enable paid add-ons.
2. Select **Add New → Project**, authorize access to your repository, and import it.
3. Keep **Next.js**, repository root, and default output directory. Select **Node.js 24.x** in project settings. `C:\Users\pavly\tayoo-church-platform\vercel.json` specifies `npm ci` and `npx prisma generate && npm run build`.
4. Under **Environment Variables**, add the following for **Production**, without surrounding quotes:

   | Variable | Purpose |
   |---|---|
   | `DATABASE_URL` | TLS transaction-pooler connection used by Prisma at runtime |
   | `DIRECT_URL` | TLS session-pooler connection required by the Prisma datasource configuration |
   | `JWT_SECRET` | Independently generated random signing secret, at least 32 characters |

   Prisma reads the two database variables with `env(...)` in its schema; application signing code reads `process.env.JWT_SECRET`. These are server-only. Bootstrap `SUPER_ADMIN_*` variables are needed only on the trusted machine running the seed, not in Vercel. Do not override `NODE_ENV` on Vercel.
5. Click **Deploy**. Wait for **Ready**, then open `https://YOUR_PROJECT.vercel.app`. Vercel automatically provisions HTTPS; no certificate setup or custom domain purchase is needed.
6. Test the home page, sign in at `/admin121210` using the existing super-admin identifier `SuperAdmin1010` and your newly seeded password, create a church, and verify authenticated database operations. The identifier and hidden URL are not security secrets; the password is what authenticates the account. Test QR camera access on an HTTPS mobile browser.
7. Inspect Vercel runtime logs if database operations fail. A successful build validates compilation, not live database connectivity. Confirm the database is unpaused, URLs are correct, and migrations completed.

## 5. Automatic updates, HTTPS and availability

- Pushes to `main` automatically build and deploy production. Vercel keeps the previous deployment serving while the new build runs, then switches the domain when ready. A failed build does not replace the active deployment.
- Other branches can receive preview deployments. Use a **separate test database and separate JWT secret** for Preview; never share production credentials with untrusted preview builds. Without preview database variables, database features will not work there.
- Change production environment variables under **Settings → Environment Variables**, then redeploy. Changes do not retroactively update an existing deployment.
- For schema changes, test first, back up, and apply backward-compatible additive migrations before deploying dependent code. Drop/rename old columns only in a later release after old code no longer needs them. Long locks and destructive migrations can cause downtime despite atomic app deployment.
- Roll back a bad app release through the Vercel deployment dashboard; database migrations are not rolled back with application code.
- Stay within both free plans' limits and monitor their usage dashboards. Inactivity pauses, quotas, cold starts and provider outages mean **zero downtime forever is not a free-tier guarantee**. Restore a paused Supabase project through its dashboard and maintain tested backups.

## Verification and remaining maintenance

Use `npm run lint`, `npm run build`, and `npx prisma validate` before each release. Build-time TypeScript and Next.js lint checks remain enabled; the explicit lint command rejects warnings too. No production database migration or authenticated end-to-end test is performed just by building.

The dependency audit performed during preparation reported advisories in the Prisma dependency chain, Next.js's bundled PostCSS, and ExcelJS's UUID dependency. Review `npm audit` before public release and test supported upgrades separately; do not blindly run `npm audit fix --force` (its suggested changes include breaking major-version changes). ESLint 8 and the Prisma package-based seed configuration also emit deprecation notices and should be migrated in a future tooling update.

