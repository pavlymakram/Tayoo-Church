# Tayoo Church Platform

Next.js 15 / Prisma / PostgreSQL platform for church attendance, QR scans, Tayoo points, and tenant management.

## Setup and deployment

Follow the complete guide in [DEPLOYMENT.md](./DEPLOYMENT.md), located at `C:\Users\pavly\tayoo-church-platform\DEPLOYMENT.md`. It covers local setup, PostgreSQL initialization, secure environment variables, GitHub, Vercel Hobby, automatic HTTPS, updates and rollback.

**Important:** free plans have eligibility rules and quotas, not a permanent uptime guarantee. Vercel Hobby is for personal non-commercial use; confirm eligibility for an organization/church deployment. Supabase Free can pause inactive databases. Choose free plans directly rather than paid integrations or Pro trials.

## Checks

Run from `C:\Users\pavly\tayoo-church-platform` after configuring the ignored local environment file:

```powershell
npm ci
npx prisma validate
npm run lint
npm run build
```

Production uses external PostgreSQL; local SQLite files are not durable on Vercel. Database URLs and JWT secrets remain server-only environment variables. The default seed creates only the super-admin from supplied credentials; demo seeding is opt-in for local development and blocked in production mode.

The deployment guide includes remaining dependency audit findings and the distinction between successful builds and live database verification.

