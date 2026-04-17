#!/usr/bin/env node
/**
 * Local cron runner — hits /api/cron every 15 minutes while you're developing.
 * Run with: npm run cron:local
 *
 * In production, use Vercel Cron (vercel.json), Railway cron, or a GitHub Action.
 */

require("dotenv").config({ path: ".env.local" });

const INTERVAL_MINUTES = 15;
const URL = process.env.CRON_URL || "http://localhost:3000/api/cron";
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.warn("⚠️  CRON_SECRET not set — cron endpoint may reject requests.");
}

async function tick() {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] Triggering cron…`);
  try {
    const url = `${URL}?secret=${encodeURIComponent(SECRET || "")}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      console.error(`  ❌ ${res.status}:`, data.error);
      return;
    }
    console.log(
      `  ✓ Found ${data.opportunitiesFound} opps • ${data.highScore} high-score • ${data.newAlerted} alerted`
    );
    if (data.emailError) console.error(`  ⚠️  Email error: ${data.emailError}`);
  } catch (err) {
    console.error(`  ❌ Request failed:`, err.message);
    console.error(`     Is the dev server running? (npm run dev)`);
  }
}

console.log(`🤖 Local cron runner starting`);
console.log(`   URL: ${URL}`);
console.log(`   Interval: every ${INTERVAL_MINUTES} min`);
console.log(`   Press Ctrl+C to stop.\n`);

tick();
setInterval(tick, INTERVAL_MINUTES * 60 * 1000);
