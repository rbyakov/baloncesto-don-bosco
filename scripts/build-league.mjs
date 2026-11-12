// Builds league.json: player rankings by points in our group and across the whole level
// (all groups of the same phase/category). Node 20+, no dependencies.
//
//   node scripts/build-league.mjs          # skips if league.json is younger than 20 h
//   FORCE=1 node scripts/build-league.mjs  # always rebuild
//
// ~1 request per team (team-stats), so it runs once a day, not every 30 minutes.

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
const MAX_AGE_H = 20;
const TOP_N = 20;

const cfg = JSON.parse(await readFile(new URL("../config.json", import.meta.url), "utf8"));
let prev = null;
try { prev = JSON.parse(await readFile(new URL("../league.json", import.meta.url), "utf8")); } catch {}
if (prev?.updated && !process.env.FORCE) {
  const age = (Date.now() - Date.parse(prev.updated)) / 36e5;
  if (age < MAX_AGE_H) { console.log(`league.json is ${age.toFixed(1)} h old — skip (FORCE=1 to rebuild)`); process.exit(0); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const ACR = /\b(Cd|Cb|Cba|Nb|Nbp|Upb|Cde|Eb|Bc|Cbc|Cf|Scd|Imv|Tll|Emb|Cbi)\b/g;
const title = (s) =>
  String(s || "").toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
    .replace(ACR, (w) => w.toUpperCase());
const teamName = (s) => title(s).replace(/^C\.\s?B\.\s/i, "CB ").replace(/\s+-\s*$/, "").trim();
// Short public name: "MAKAR BIAKOV" -> "Makar B."; names FBCV already hides as initials ("G.O.S.M.") stay as they are
function shortName(n) {
  const s = String(n || "").trim();
  if (/^([A-ZÁÉÍÓÚÑÜ]\.){2,}/i.test(s.replace(/\s/g, ""))) return s.replace(/\s/g, "").toUpperCase();
  const [first, second] = s.split(/\s+/);
  return second ? `${title(first)} ${second.charAt(0).toUpperCase()}.` : title(first);
}
const isPlaceholder = (n) => /^JUGADOR(ES)?\/?AS?\s+INSCRIT/i.test(n || "");
function rank(list) {
  list.sort((a, b) => b.pts - a.pts || a.min - b.min);
  let rk = 0, prevPts = null;
  list.forEach((p, i) => { if (p.pts !== prevPts) { rk = i + 1; prevPts = p.pts; } p.rk = rk; });
  return list;
}

// ---- which category / phase are we in now? (follows the team into phase 2 automatically)
const card = await esb(`FCBQWeb/getTeamCard/${cfg.teamId}`);
const myGroups = card.team?.groups || [];
const myGroup = [...myGroups].reverse().find((g) => (g.standing || []).length) || myGroups[myGroups.length - 1]; // latest phase
if (!myGroup) throw new Error("team has no group");
const categoryId = Number(myGroup.idCategoryRegistred || myGroup.idCategoryRegistered || cfg.leagueCategory);
if (!categoryId) throw new Error("category id unknown — set leagueCategory in config.json");
const phase = myGroup.competitionName;
console.log(`category ${categoryId}, phase "${phase}", our group ${myGroup.nameGroup} (${myGroup.idGroup})`);

const groups = (await esb(`Competition/getCompetitionGroupVisibleWeb/${categoryId}/1`))
  .filter((g) => !phase || g.competitionName === phase);
console.log(`${groups.length} groups`);

const teams = [];
for (const g of groups) {
  const md = await esb(`FCBQWeb/resultats/${g.idGroup}`);
  for (const s of md.standing || []) teams.push({ id: Number(s.idTeam), name: s.teamName, group: g.grupName?.replace(/^Gr\s*/i, "") || g.nameGroup, gid: Number(g.idGroup) });
  await sleep(250);
}
console.log(`${teams.length} teams`);

const players = [];
let failed = 0;
for (const t of teams) {
  try {
    const j = await get(`${MS}team-stats/team/${t.id}/season/${cfg.season}`);
    for (const p of j.players || []) {
      if (isPlaceholder(p.name) || !Number(p.matchesPlayed)) continue;
      players.push({
        team: t, full: p.name, no: p.dorsal === "" || p.dorsal == null ? null : Number(p.dorsal),
        g: Number(p.matchesPlayed) || 0, pts: Number(p.totalScore) || 0, min: Number(p.timePlayed) || 0,
      });
    }
  } catch (e) { failed++; console.warn(`team ${t.id}:`, e.message); }
  await sleep(300);
}
if (failed > teams.length / 4) throw new Error(`too many failed teams (${failed}/${teams.length}) — keeping old league.json`);
console.log(`${players.length} players (${failed} teams failed)`);

const league = rank([...players]);
const lrk = new Map(league.map((p) => [p, p.rk]));
const ourGid = Number(myGroup.idGroup);
const group = rank(players.filter((p) => p.team.gid === ourGid));

const out = {
  level: myGroup.categoryRegisteredName || "",
  phase,
  groupName: myGroup.nameGroup?.replace(/^Gr\s*/i, "") || "",
  leagueTotal: league.length,
  groupTotal: group.length,
  top: league.slice(0, TOP_N).map((p) => ({ rk: lrk.get(p), name: shortName(p.full), team: teamName(p.team.name), group: p.team.group, g: p.g, pts: p.pts })),
  group: group.map((p) => {
    const us = p.team.id === cfg.teamId;
    return { name: shortName(p.full), team: teamName(p.team.name), no: us ? p.no : null, g: p.g, pts: p.pts, rk: p.rk, us };
  }),
  ours: group.filter((p) => p.team.id === cfg.teamId).map((p) => ({ no: p.no, lrk: lrk.get(p), grk: p.rk, g: p.g, pts: p.pts })),
};

const strip = (o) => JSON.stringify({ ...o, updated: undefined });
if (prev && strip(prev) === strip(out)) {
  // nothing changed: only bump the timestamp so the daily throttle keeps working
  prev.updated = new Date().toISOString();
  await writeFile(new URL("../league.json", import.meta.url), JSON.stringify(prev) + "\n");
  console.log("No ranking changes.");
} else {
  out.updated = new Date().toISOString();
  await writeFile(new URL("../league.json", import.meta.url), JSON.stringify(out) + "\n");
  console.log(`league.json written: league ${out.leagueTotal}, group ${out.groupTotal}, ours ${out.ours.length}`);
}
