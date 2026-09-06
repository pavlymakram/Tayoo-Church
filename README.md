# طايو — نظام إدارة الخدمة والنقاط

**Tayoo Church Platform** is a multi-tenant Progressive Web App for churches to manage student attendance, Tayoo spiritual points, QR scanning, visitations, and Excel exports.

## Stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS v4
- **Prisma** ORM (SQLite for local demo; PostgreSQL-ready)
- **JWT** httpOnly cookie sessions
- **html5-qrcode** + **qrcode.react**
- **ExcelJS** visitation export
- **Framer Motion** + **Lucide** + **Sonner**
- Arabic RTL + **Cairo** font
- PWA (`manifest.json` + service worker)

## Quick start

```bash
cd tayoo-church-platform
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts (from seed)

| Role | Phone | Password / PIN |
|------|-------|----------------|
| Super Admin | `01000000000` | `SuperAdmin@2026` |
| Church Admin | `01111111111` | `Admin@1234` |
| Servant | `01222222222` | `Servant@1234` |
| Student | `01555555551` | PIN `1234` |

The demo church **license key** is printed in the seed output (also visible in Church Admin → Settings / Super Admin portal).

After the included seed run:

`TAYOO-AC2E6377-0F063786`

## Multi-tenancy

Every business record is scoped by `church_id`. Staff APIs always filter by the session `churchId`. Churches cannot read or mutate each other’s data. Super Admin manages licenses only.

## Production PostgreSQL

1. Start Postgres: `docker compose up -d`
2. In `prisma/schema.prisma`, set `provider = "postgresql"`
3. Set `DATABASE_URL` in `.env` to your Postgres URL
4. Run `npx prisma migrate dev --name init` then `npm run db:seed`

## Main routes

- `/` — Landing
- `/auth/student` — Student register / login
- `/auth/staff` — Servant / admin login
- `/student` — Points + giant ID/QR button
- `/servant` — Staff dashboard
- `/servant/scan` — Camera QR + award points
- `/servant/students` — Visitation grid + Excel export
- `/servant/events` — Event types (admin)
- `/servant/settings` — License key + servants (admin)
- `/super-admin` — Master license portal

## License model

One-time license key per church, created in Super Admin. Students register with that key. Admins can deactivate a church license system-wide.
