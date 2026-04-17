# Micro-Contract Finder

A dashboard for finding sub-$15k federal web design contracts close to their response deadline — the opportunities big agencies ignore and small shops can actually win.

Built with Next.js 15, TypeScript, Prisma, Tailwind, and Resend.

## What it does

- Pulls open solicitations from **SAM.gov** filtered by NAICS codes, keywords, value ceiling, and deadline window
- Scores each opportunity 0–100 based on proxies for "low competition" (deadline proximity, micro-purchase value, set-aside type — since SAM.gov doesn't expose bidder counts)
- Enriches clicked opportunities with **USAspending.gov** agency intel (last 12 months of similar awards, top recipients, repeat-vendor warnings)
- Sends **email alerts** via Resend when new high-score opportunities appear
- Tracks your pipeline — mark opportunities as "pursuing" and they persist across sessions

## Setup (first time, ~10 minutes)

### 1. Install dependencies

```bash
npm install
```

### 2. Get a SAM.gov API key

Go to [sam.gov](https://sam.gov), sign in, then:
- Click your profile → **Account Details**
- Click **Request Public API Key**
- Approval usually takes 10–30 minutes (check your email)

Free tier: 1,000 requests/day.

### 3. Get a Resend API key (for email alerts)

Sign up at [resend.com](https://resend.com) — free tier is 100 emails/day, no credit card. Create an API key at **resend.com/api-keys**.

For testing, you can send from `onboarding@resend.dev` (Resend's built-in test sender). For production, [verify your own domain](https://resend.com/domains).

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in:
- `SAM_GOV_API_KEY` — from step 2
- `RESEND_API_KEY` — from step 3
- `ALERT_TO_EMAIL` — where alerts go (your email)
- `CRON_SECRET` — generate one with `openssl rand -hex 32`

### 5. Initialize the database

```bash
npx prisma db push
```

This creates `prisma/dev.db` (SQLite) with two tables: `SeenOpportunity` (tracks what's been alerted to prevent duplicates) and `PursuingOpportunity` (your pipeline).

### 6. Run it

```bash
npm run dev
```

Open http://localhost:3000. The dashboard fetches fresh data on page load and auto-refreshes every 5 minutes while the tab is open.

### 7. (Optional) Run the local cron worker

The cron endpoint (`/api/cron`) is what checks for new opportunities and sends alerts. In a second terminal:

```bash
npm run cron:local
```

This hits `/api/cron` every 15 minutes so you get alerts even when you don't have the dashboard open.

## How the scoring works

SAM.gov doesn't tell you how many bidders a solicitation has — so the score uses proxies that correlate with low competition:

| Signal | Points | Why |
|--------|--------|-----|
| Closing < 24 hours | +30 | Open contracts this close to deadline usually have few or no responses |
| Closing < 48 hours | +20 | Still very late in the cycle |
| Closing < 72 hours | +15 | Narrow remaining window |
| Value under $10k | +10 | True micro-purchase sweet spot — big firms skip these |
| Value $10k–$15k | +5 | Simplified acquisition range |
| Has set-aside (SBA/WOSB/etc) | +10 | Narrower eligible pool |
| Value unspecified | +5 | Often indicates small/simple scope |

Baseline is 50. Max is 100. Alert threshold is configurable (default 70).

## Deployment

### Vercel (easiest)

```bash
npm i -g vercel
vercel
```

Set your env vars in the Vercel dashboard. Edit `vercel.json` and replace `REPLACE_WITH_YOUR_CRON_SECRET` with your actual `CRON_SECRET` value. Vercel Cron will automatically run `/api/cron` every 30 minutes.

**Important:** For Vercel, switch the database from SQLite to Postgres (Vercel's filesystem is ephemeral). Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Then get a free Postgres instance from [Neon](https://neon.tech) or [Supabase](https://supabase.com) and set `DATABASE_URL` in Vercel.

### Railway / Render

Both support SQLite with persistent volumes. Set up a cron service that curls `/api/cron?secret=YOUR_SECRET` every 30 minutes.

### Self-hosted

`npm run build && npm start`, then add a system cron entry:

```
*/30 * * * * curl -s "https://yourdomain.com/api/cron?secret=YOUR_SECRET" > /dev/null
```

## Customization

### Change what it searches for

Edit the defaults in `.env.local`:

```env
DEFAULT_NAICS_CODES=541511,541512,541430,541810
DEFAULT_KEYWORDS=web design,website,web development,UX,WordPress
DEFAULT_MAX_VALUE=15000
DEFAULT_DEADLINE_DAYS=7
```

NAICS codes for related categories:
- `541511` Custom Computer Programming Services
- `541512` Computer Systems Design Services
- `541513` Computer Facilities Management Services
- `541519` Other Computer Related Services
- `541430` Graphic Design Services
- `541810` Advertising Agencies
- `541990` All Other Professional, Scientific, and Technical Services

### Adjust scoring

Edit `src/lib/sam-gov.ts` → `scoreOpportunity()`. The scoring is pure JavaScript — tweak the weights or add new signals (e.g., location-based bonuses if you want to prefer contracts in your state).

### Change the alert threshold

Set `ALERT_MIN_SCORE` in `.env.local` (default 70).

## Project structure

```
src/
  app/
    api/
      opportunities/route.ts   # GET /api/opportunities (dashboard data)
      cron/route.ts             # GET /api/cron (scheduled alert worker)
      enrichment/route.ts       # GET /api/enrichment (USAspending intel)
      pursuing/route.ts         # GET/POST/DELETE /api/pursuing (pipeline)
    page.tsx                    # Main dashboard (client component)
    layout.tsx
    globals.css
  lib/
    sam-gov.ts                  # SAM.gov client + scoring
    usa-spending.ts             # USAspending.gov enrichment
    email.ts                    # Resend email sending
    prisma.ts                   # Prisma client singleton
prisma/
  schema.prisma                 # Database schema
scripts/
  run-cron.js                   # Local cron for dev
vercel.json                     # Vercel cron config for prod
```

## Known limitations

- **SAM.gov doesn't expose bidder counts.** The "no bidders" heuristic is inferred from proxies — some high-score opportunities will have 10+ bidders anyway. Use the agency intel panel to sanity-check.
- **Free tier = 1,000 SAM requests/day.** With a 30-minute cron that's 48 calls/day, plus dashboard refreshes. You're fine unless you leave the dashboard open 24/7.
- **Descriptions are truncated** in some SAM.gov responses. For full detail, click through to SAM.gov.
- **SAM.gov search is imperfect** — keyword filters happen client-side after fetching by NAICS, so very rare niche terms may miss opportunities tagged under unexpected NAICS codes.

## Troubleshooting

**"SAM.gov auth failed (401/403)"** — Your API key is missing, invalid, or not yet approved. Check your email for the approval notice.

**"Rate limit hit"** — You exceeded 1,000 requests. Wait until midnight UTC.

**No opportunities showing up** — Widen your deadline window (default 7 days → try 30) or loosen keywords.

**Emails not sending** — Check the Resend dashboard for delivery status. If using `onboarding@resend.dev`, emails may go to spam; verify your own domain for production.

**Cron not triggering on Vercel** — Cron requires a Pro plan on Vercel. Alternative: use a free GitHub Action scheduled workflow that curls your endpoint.

## License

MIT. Build on it, ship it, bid on contracts, win some jobs.
