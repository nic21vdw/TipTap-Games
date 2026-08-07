// supabase/schema.sql, applied to a real Postgres and interrogated.
//
// The giveaway is decided by season_points(), so "it looks right" is not a
// standard this file can be held to. PGlite is Postgres compiled to wasm — no
// Docker, no server, no Supabase project — so the contest maths is checked the
// only way that means anything: by running it.
//
//   node tests/season.test.mjs
//
// The pieces Supabase itself provides (the auth schema, the anon/authenticated
// roles, auth.uid()) are stubbed below. Everything under test is the real file.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "supabase", "schema.sql"), "utf8");
const db = new PGlite();

// Stand-ins for the pieces Supabase provides: the auth schema, the roles the
// grants target, and auth.uid() reading the "session" user.
await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid;
  $$;
`);

await db.exec(schema);
console.log("schema applied");

const players = ["ada", "bo", "cy", "dee"];
const ids = {};
for (const name of players) {
  const res = await db.query(
    `insert into auth.users (email, raw_user_meta_data)
     values ($1::text, jsonb_build_object('name', $2::text)) returning id`,
    [`${name}@example.com`, name]
  );
  ids[name] = res.rows[0].id;
}
const handles = await db.query("select handle from public.profiles order by handle");
console.log("trigger made profiles:", handles.rows.map((r) => r.handle).join(", "));

await db.exec(`
  insert into public.games (slug, title, rule_text, intensity, luck, nostalgia,
                            session_length, max_score_per_second)
  values ('tap-rush','Tap Rush','tap',1,0,0,1,50),
         ('cube-dodge','Cube Dodge','dodge',1,0,0,1,50),
         ('one-lane','One Lane','steer',1,0,0,1,50);

  insert into public.seasons (slug, title, prize, starts_at, ends_at)
  values ('2026-05','May Cup','A keyboard',
          timestamptz '2026-05-01 00:00+00', timestamptz '2026-06-01 00:00+00');
`);

async function score(player, slug, value, at, verified = true) {
  await db.query(
    `insert into public.scores (player_id, game_slug, score, duration_ms, verified, created_at)
     values ($1, $2, $3, 1000, $4, $5)`,
    [ids[player], slug, value, verified, at]
  );
}

// Inside the season window.
await score("ada", "tap-rush", 900, "2026-05-05");
await score("ada", "tap-rush", 500, "2026-05-06");
await score("ada", "cube-dodge", 300, "2026-05-07");
await score("bo", "tap-rush", 800, "2026-05-05");
await score("bo", "cube-dodge", 400, "2026-05-06");
await score("bo", "one-lane", 100, "2026-05-06");
await score("cy", "tap-rush", 700, "2026-05-09");
// Outside the window — must not count towards the contest.
await score("dee", "tap-rush", 9999, "2026-04-20");
// Unverified (a guest import) — must not rank anywhere.
await score("dee", "cube-dodge", 9999, "2026-05-10", false);

const fail = [];
const show = (v) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));
function check(label, actual, expected) {
  const a = show(actual);
  const e = show(expected);
  const ok = a === e;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     got ${a}\n     want ${e}`}`);
  if (!ok) fail.push(label);
}

const allTime = await db.query("select handle, score from public.leaderboard('tap-rush', 10)");
check("all-time board counts the out-of-season run", allTime.rows, [
  { handle: "dee", score: 9999 },
  { handle: "ada", score: 900 },
  { handle: "bo", score: 800 },
  { handle: "cy", score: 700 },
]);

const monthly = await db.query(
  "select handle, score, rank from public.season_leaderboard('tap-rush', '2026-05', 10)"
);
check("season board is the window only", monthly.rows, [
  { handle: "ada", score: 900, rank: 1n },
  { handle: "bo", score: 800, rank: 2n },
  { handle: "cy", score: 700, rank: 3n },
]);

// ada: tap-rush #1 (25) + cube-dodge #2 (24) = 49
// bo:  tap-rush #2 (24) + cube-dodge #1 (25) + one-lane #1 (25) = 74
// cy:  tap-rush #3 (23)
const overall = await db.query(
  "select handle, points, games_played, rank from public.season_overall('2026-05', 50)"
);
check("contest board sums points across games", overall.rows, [
  { handle: "bo", points: 74n, games_played: 3n, rank: 1n },
  { handle: "ada", points: 49n, games_played: 2n, rank: 2n },
  { handle: "cy", points: 23n, games_played: 1n, rank: 3n },
]);

await db.exec(`set test.uid = '${ids.ada}'`);
const mine = await db.query("select * from public.my_season_standing('2026-05')");
check("my standing finds me mid-board", mine.rows, [
  { points: 49n, rank: 2n, games_played: 2n, total: 3n },
]);

await db.exec(`set test.uid = '${ids.dee}'`);
const unranked = await db.query("select * from public.my_season_standing('2026-05')");
check("an unranked player is rank 0, not last", unranked.rows, [
  { points: 0n, rank: 0n, games_played: 0n, total: 3n },
]);

// No named season: the one live right now. Nothing is live in this fixture.
const noneLive = await db.query("select * from public.current_season(null)");
check("no live season yields no rows", noneLive.rows, []);
const emptyBoard = await db.query(
  "select * from public.season_leaderboard('tap-rush', null, 10)"
);
check("season board with no season is empty, not everything", emptyBoard.rows, []);

// A season that is live right now resolves without being named.
await db.exec(`
  insert into public.seasons (slug, title, prize, starts_at, ends_at)
  values ('live','Live Cup','Now', now() - interval '1 day', now() + interval '1 day');
`);
const live = await db.query("select slug from public.current_season(null)");
check("the live season resolves by clock", live.rows, [{ slug: "live" }]);

await db.close();
if (fail.length) {
  console.error(`\n${fail.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
