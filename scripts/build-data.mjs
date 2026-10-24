// Builds data.json for the site from the FBCV results platform (OW Basket).
// Runs in GitHub Actions (Node 20+). No dependencies.
//
//   node scripts/build-data.mjs
//
// Only what the page needs is written: names (shortened per config), shirt
// numbers and box scores. Personal fields that the API returns (birth date,
// address, IDs...) are never read or stored.

import { readFile, writeFile } from "node:fs/promises";

const KEY = "btz38ZsZlAdaODiH2fGsnJC9mZgSNPeR"; // public key used by fbcv.es itself
const ESB = `https://esb.optimalwayconsulting.com/fbcv/1/${KEY}/`;
const MS = "https://msstats.optimalwayconsulting.com/v1/fbcv/";
const HEADERS = {
  Referer: "https://www.fbcv.es/",
  Origin: "https://www.fbcv.es",
  "User-Agent": "baloncesto-don-bosco/1.0 (+https://github.com/rbyakov/baloncesto-don-bosco)",
  Accept: "application/json, text/plain, */*",
};
const SEASON_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

const cfg = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));
let prev = null;
try { prev = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8")); } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// esb answers either plain JSON or base64-encoded JSON
function decode(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  return JSON.parse(Buffer.from(t, "base64").toString("utf8"));
}

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return decode(await r.text());
    } catch (e) {
      if (i >= tries) throw new Error(`${url.replace(KEY, "KEY")}: ${e.message}`);
      await sleep(1500 * i);
    }
  }
}
const esb = async (path) => {
  const j = await get(ESB + path);
  if (j.result && j.result !== "OK") throw new Error(`${path}: ${j.message || j.result}`);
  return j.messageData;
};

// ---------- names ----------
const norm = (s) => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
const title = (s) =>
  String(s || "").toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(Cd|Cb|Cba|Nb|Nbp|Upb|Cde|Eb|Bc|Cbc|Cf|Scd|Imv|Ii|Iii)\b/g, (w) => w.toUpperCase()); // club acronyms: CD, CB, NB...

function hash(s) { // FNV-1a, short stable id that does not reveal the name
  let h = 0x811c9dc5;
  for (const ch of norm(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

function displayNames(people, style) {
  // people: [{full, first, last}]  -> Map(full -> display)
  const out = new Map();
  const make = (p, lvl) => {
    const first = title(p.first), last = title(p.last);
    if (style === "full" || lvl === 2) return `${first} ${last}`.trim();
    if (style === "first") return lvl === 0 ? first : `${first} ${last.split(" ")[0].charAt(0)}.`;
    // "initial" (default): first name + first surname initial; on clash, full first surname
    return lvl === 0 ? `${first} ${last.charAt(0)}.`.trim() : `${first} ${last.split(" ")[0]}`;
  };
  for (let lvl = 0; lvl <= 2; lvl++) {
    const counts = {};
    for (const p of people) if (!out.has(p.full)) { const d = make(p, lvl); counts[d] = (counts[d] || 0) + 1; }
    for (const p of people) if (!out.has(p.full)) { const d = make(p, lvl); if (counts[d] === 1 || lvl === 2) out.set(p.full, d); }
  }
  return out;
}

// ---------- fetch ----------
const teamId = cfg.teamId;
console.log(`Team ${teamId}, season ${cfg.season}`);

const card = await esb(`FCBQWeb/getTeamCard/${teamId}`);
// players only (licenseTypeId 1 = JUGADOR/A; 2 = coach, 3 = team delegate)
const rosterRaw = (card.players || []).filter((p) => String(p.licenseTypeId) === "1" || /JUGADOR/i.test(p.licenseTypeName || "")).map((p) => ({
  first: (p.name || "").trim(),
  last: (p.surname || "").trim(),
})).filter((p) => p.first || p.last);

// Match-sheet names may carry a second surname the roster omits (or vice versa): map them to the roster name
const rosterFulls = rosterRaw.map((p) => norm(`${p.first} ${p.last}`));
const plain = (s) => norm(s).normalize("NFD").replace(/\p{M}/gu, "");
function canon(name) {
  const n = norm(name), pn = plain(name);
  return rosterFulls.find((r) => plain(r) === pn)
    || rosterFulls.find((r) => pn.startsWith(plain(r) + " ") || plain(r).startsWith(pn + " "))
    || n;
}

const groups = (card.team?.groups || []).map((g) => ({
  id: Number(g.idGroup),
  name: g.nameGroup,
  phase: g.competitionName,
  category: g.categoryRegisteredName,
  standing: (g.standing || [])
    .map((s) => ({
      pos: Number(s.position), teamId: Number(s.idTeam), team: title(s.teamName),
      g: Number(s.matchPlayed), w: Number(s.matchWin), l: Number(s.matchLost),
      pf: Number(s.matchScoreFavour), pa: Number(s.matchScoreAgainst), pts: Number(s.standingScore),
    }))
    .sort((a, b) => a.pos - b.pos),
}));

const seen = new Map();
for (const m of SEASON_MONTHS) {
  let list = [];
  try { list = await esb(`Match/getByTeamAndMonth/${teamId}/${m}`); } catch (e) { console.warn("month", m, e.message); }
  for (const x of Array.isArray(list) ? list : Object.values(list || {})) if (!seen.has(x.idMatch)) seen.set(x.idMatch, x);
  await sleep(250);
}
const rawMatches = [...seen.values()].sort((a, b) => String(a.matchDay).localeCompare(String(b.matchDay)));
console.log(`${rawMatches.length} matches in calendar`);

// Box scores never change once published, so earlier ones are reused from data.json (rows keyed by player id)
const prevBox = new Map((prev?.matches || []).filter((m) => m.box).map((m) => [m.id, m.box]));
const prevPlayers = new Map((prev?.players || []).map((p) => [p.id, p]));
const fullById = new Map(); // player id -> official full name (in memory only)
const matches = [];
for (const x of rawMatches) {
  const played = x.localScore !== null && x.localScore !== "" && x.localScore !== undefined;
  const m = {
    id: Number(x.idMatch),
    round: Number(x.numMatchDay) || null,
    date: x.matchDay, // "YYYY-MM-DD HH:MM:SS" local time
    home: title(x.nameLocalTeam), away: title(x.nameVisitorTeam),
    homeId: Number(x.idLocalTeam), awayId: Number(x.idVisitorTeam),
    homeScore: played ? Number(x.localScore) : null, awayScore: played ? Number(x.visitorScore) : null,
    venue: title(x.nameField || ""), groupId: Number(x.idGroup) || null,
    box: null,
  };
  if (played) {
    m.box = prevBox.get(m.id) || null;
    if (!m.box && x.universallyid) {
      try {
        const s = await get(`${MS}getJsonWithMatchStats/${x.universallyid}?currentSeason=true`);
        const t = (s.teams || []).find((tt) => Number(tt.teamIdExtern) === teamId);
        if (t) m.box = (t.players || []).map((p) => {
          const d = p.data || {}, full = canon(p.name), id = hash(full);
          fullById.set(id, full);
          return {
            p: id, no: p.dorsal === "" || p.dorsal == null ? null : Number(p.dorsal),
            min: Number(p.timePlayed) || 0, pts: Number(d.score) || 0,
            p2: Number(d.shotsOfTwoSuccessful) || 0,
            p3: Number(d.shotsOfThreeSuccessful) || 0, p3a: Number(d.shotsOfThreeAttempted) || 0,
            ft: Number(d.shotsOfOneSuccessful) || 0, fta: Number(d.shotsOfOneAttempted) || 0,
            pf: Number(d.personal ?? d.faults) || 0,
          };
        });
        console.log(`box ${m.id}: ${m.box ? m.box.length + " players" : "not published yet"}`);
      } catch (e) { console.warn(`box ${m.id}:`, e.message); }
      await sleep(400);
    }
  }
  matches.push(m);
}

// ---------- players ----------
const people = new Map(); // full -> {first,last}
for (const p of rosterRaw) people.set(norm(`${p.first} ${p.last}`), { first: p.first, last: p.last });
for (const full of fullById.values()) if (!people.has(full)) {
  const [first, ...rest] = full.split(" ");
  people.set(full, { first, last: rest.join(" ") });
}
const names = displayNames([...people].map(([full, p]) => ({ full, ...p })), cfg.nameStyle || "initial");
const inRoster = new Set(rosterRaw.map((p) => norm(`${p.first} ${p.last}`)));

const latestNo = (id) => {
  let no = null;
  for (const m of matches) for (const b of m.box || []) if (b.p === id && b.no != null) no = b.no; // latest shirt
  return no;
};
const players = [...people.keys()].map((full) => {
  const id = hash(full);
  return { id, name: names.get(full), no: latestNo(id), registered: inRoster.has(full) };
});
// players known only from cached box scores (e.g. left the team since)
const ids = new Set(players.map((p) => p.id));
for (const m of matches) for (const b of m.box || []) if (!ids.has(b.p)) {
  const old = prevPlayers.get(b.p);
  players.push({ id: b.p, name: old?.name || `#${b.no ?? "?"}`, no: latestNo(b.p), registered: false });
  ids.add(b.p);
}
// Squad members the coach lists who are not registered with FBCV yet
for (const n of cfg.extraPlayers || []) {
  const taken = players.some((p) => norm(p.name).startsWith(norm(n)));
  if (!taken) players.push({ id: hash("extra:" + n), name: n, no: null, registered: false, pending: true });
}
players.sort((a, b) => (a.no ?? 999) - (b.no ?? 999) || a.name.localeCompare(b.name));

const out = {
  team: { id: teamId, name: cfg.teamName, club: cfg.clubName },
  season: cfg.season,
  defaultPlayer: cfg.defaultPlayer || null,
  players,
  groups,
  matches,
};

const before = prev ? JSON.stringify({ ...prev, updated: undefined }) : "";
const after = JSON.stringify({ ...out, updated: undefined });
if (before === after) { console.log("No changes."); process.exit(0); }
out.updated = new Date().toISOString();
await writeFile(new URL("../data.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`data.json written: ${players.length} players, ${matches.filter((m) => m.box).length} box scores`);
