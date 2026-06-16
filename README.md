# Unify Ascend Task Hub

Internal web application for Unify Consulting's Ascend team: task intake and tracking, multi-contributor time logging, automated PM check-ins, and analytics.

Tasks are the unit of work — each carries the requesting leader, a bucket, an optional initiative, and a priority. Multiple people can contribute to the same task, each logging their own hours independently.

**Stack:** React (Vite) + TypeScript + Tailwind · Node/Express + TypeScript · PostgreSQL + Prisma · Nodemailer + Teams webhook · node-cron · Recharts

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop (for local Postgres)

## Local setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies (root, server, client)
npm install
npm run setup

# 3. Configure the server environment
cd server
copy .env.example .env        # macOS/Linux: cp .env.example .env
# The defaults match docker-compose.yml — no edits needed for local dev.

# 4. Create the schema and seed sample data
npm run db:migrate            # runs prisma migrate dev (also generates the client)
npm run db:seed

# 5. Run both apps (from the repo root)
cd ..
npm run dev
```

- Client: http://localhost:5173 (proxies `/api` to the server)
- Server: http://localhost:4000

### Seeding

`npm run db:seed` does a **full reset** (wipes users/tasks/assignments/check-ins, then repopulates) and loads its data from one of two files in `server/prisma/`:

- **`seed-data.json`** — the real roster + pipeline. It contains live client and leader names, so it is **gitignored and never committed** (this repo is public). Used automatically when present.
- **`seed-data.example.json`** — committed, fully synthetic demo data. Used as a fallback when `seed-data.json` is absent, so a fresh clone and CI boot with safe data.

The seed prints which file it loaded. A synthetic **Dev Admin** test account (`dev@ascendhub.test`) is always added on top so developers can exercise admin features without using a real account.

**Getting the real data (team developers):** the real `seed-data.json` is shared out-of-band over the team channel (Teams/OneDrive) — not through git. Drop it into `server/prisma/` and run `npm run db:seed`; it takes over automatically. It is regenerated from the team's source spreadsheets by `build-seed-data.py` (also gitignored, since it embeds real names); ask the repo owner for it if you need to regenerate from updated sheets.

### Seeded logins (example data)

When seeded from `seed-data.example.json`, all accounts use the password `ascend123`:

| User | Email | Role |
|---|---|---|
| Avery Chen | avery.chen@example.com | admin |
| Maya Castellanos | maya.castellanos@example.com | member |
| Derek Whitfield | derek.whitfield@example.com | member |
| Priya Raghunathan | priya.raghunathan@example.com | member |
| Jordan Okafor | jordan.okafor@example.com | member |
| Dev Admin | dev@ascendhub.test | admin |

Maya (07:30) and Priya (09:00) have custom ping times; the rest use the team default.

## Environment variables

All server configuration lives in `server/.env` (see `server/.env.example` for the authoritative list):

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | docker-compose local DB |
| `PORT` | API port | `4000` |
| `SESSION_SECRET` | Session cookie signing secret — change in production | dev placeholder |
| `APP_URL` | Client origin, used for links in check-in emails | `http://localhost:5173` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email fallbacks (Settings page values take precedence) | empty |
| `TEAMS_WEBHOOK_URL` | Power Automate Workflows channel webhook fallback (Settings page takes precedence) | empty |
| `SCHEDULER_TIMEZONE` | Timezone for ping/briefing schedule evaluation | `America/Los_Angeles` |

## Configuring email and Teams (from the app)

1. Sign in as an admin and open **Settings**.
2. **Email (SMTP):** enter host, port, username, password, and from address, then click **Send test email** (it sends to your own address).
3. **Teams webhook:** in the target Teams channel, choose **··· → Workflows** and add the _"Post to a channel when a webhook request is received"_ template (this replaces the retired Office 365 "Incoming Webhook" connector). Copy the generated URL, paste it here, and click **Send test message**. Then tick **Post the daily check-in digest to Teams** and/or **Post a card when a task is assigned** as desired.
4. **Briefing distribution list:** comma-separated emails that receive the weekly briefing.

Values saved in Settings are stored in the database (`AppSetting`) and take precedence over `.env` fallbacks. No restart is required.

## Roles

| Capability | Admin | Member |
|---|---|---|
| View all tasks, assignments, briefings | ✓ | ✓ |
| Create & edit tasks / update statuses | ✓ | ✓ |
| Log & edit **own** hours (any date, incl. backdated) | ✓ | ✓ |
| Edit/delete **anyone's** assignment | ✓ | — |
| Delete tasks | ✓ | — |
| User management, Settings | ✓ | — |
| Generate/send briefings, send manual pings | ✓ | — |

## PM automation

- **Daily check-in pings:** one cron tick every 15 minutes checks which active users have a ping time (personal `pingTime`, else team `defaultPingTime`) in the current window, and emails each a single consolidated list of their active in-progress tasks. When **daily check-in digest** is enabled in Settings, the same run also posts one consolidated digest card to the Teams channel. A user is never pinged twice within 20 hours. Admins can also click **Send pings now** on the Dashboard.
- **Teams notifications:** when enabled in Settings, the app posts Adaptive Cards to a Microsoft Teams channel through a Power Automate Workflows webhook — currently the daily check-in digest and a card when a task is assigned to an owner. Each is independently toggleable, and new event types are added in one place (`server/src/services/notifications.ts`).
- **Per-user ping times:** each user sets a preferred time on their **Profile** page; admins can set it in **Settings → User management**. Empty = team default.
- **Weekly briefing:** generated on the configured day/time (or via **Generate now** on the Briefings page) summarizing the last 7 days of logged work, then sent via email and/or Teams — each channel toggleable at send time.

## Deployment notes

- Build everything with `npm run build`; the server serves `client/dist` when `NODE_ENV=production`, so a single Node process (plus Postgres) is all Azure App Service or Render needs.
- Run `npm run db:deploy --prefix server` (Prisma `migrate deploy`) on release.
- Auth is session-based behind an interface that can be swapped for Azure AD/SSO later: the only integration points are `POST /api/auth/login` and the `requireAuth` middleware (`server/src/middleware/auth.ts`).
- The default in-memory session store is fine for a single instance; add a Postgres-backed store (e.g. `connect-pg-simple`) before scaling out.
