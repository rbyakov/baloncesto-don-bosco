# CLAUDE.md — baloncesto-don-bosco

Static site with stats for **CD Don Bosco B** (Infantil Masculino IR, Nivel 1ª Zonal, Grupo C, FBCV, season 2026/27).
Owner: Roman (rbyakov). His son **Makar Biakov, #7**, plays in this team. UI languages: ES / RU / EN (Roman talks in Russian).

Repo: `git@github.com:rbyakov/baloncesto-don-bosco.git` · Pages: `https://rbyakov.github.io/baloncesto-don-bosco/`

## Status (2026-10-24)
- Pushed to GitHub (public), Pages live from main / root.
- "Update data" Action verified from GitHub runners: msstats box scores fetch fine (forced full refetch reproduced data.json byte-for-byte except `updated`).
- A previous version lives as a Claude artifact (static, manually updated) — superseded by this repo.

## Files
- `index.html` — whole site (vanilla JS, no build). Dark "arena scoreboard" design, fonts Big Shoulders Display + Manrope.
  Tabs: Player / Team (sortable leaderboard: 2PT, 3PT, FT, total, minutes) / Group (standings + path to Preferente).
  Player picker on first visit, choice saved in `localStorage.player`; language in `localStorage.lang` (only saved on explicit click; default = browser language, ca/va→es, else en). Deep links: `#p7` (player by shirt number), `#team`, `#group`.
- `data.json` — built by the script; committed. Initial version hand-verified against live API (checksum-matched).
- `scripts/build-data.mjs` — Node 20, no deps. Fetches roster, standings, calendar, box scores → `data.json`. Reuses already-published box scores from previous `data.json` (no refetch). Writes only if content changed.
- `config.json` — `teamId` 12981, `nameStyle` (`initial` → "Makar B." default, public site with minors; `first`, `full`), `defaultPlayer` "Makar", `extraPlayers` ["Yehor"] (squad member not yet registered in FBCV; auto-hidden once a roster name starts with it).
- `.github/workflows/update-data.yml` — cron: weekends every 30 min 06–20 UTC, weekdays 4×/day; commits `data.json` with GITHUB_TOKEN (`contents: write`).

## Data source: FBCV results platform (OW Basket / Optimal Way Consulting) — unofficial use
Public key embedded in fbcv.es itself: `btz38ZsZlAdaODiH2fGsnJC9mZgSNPeR`.
`ESB = https://esb.optimalwayconsulting.com/fbcv/1/<KEY>/` — responses are JSON **or base64-encoded JSON** (decode both). `Access-Control-Allow-Origin: *` → browser can call it directly.
- `FCBQWeb/getTeamCard/{teamId}` → `messageData.players[]` (name, surname, licenseTypeId: 1 player / 2 coach / 3 delegate; contains personal fields — never store them) and `messageData.team.groups[].standing[]` (position, idTeam, teamName, matchPlayed/Win/Lost, matchScoreFavour/Against, standingScore).
- `Match/getByTeamAndMonth/{teamId}/{month}` → that month's matches (idMatch, universallyid, matchDay "YYYY-MM-DD HH:MM:SS", nameLocalTeam/VisitorTeam, idLocalTeam/VisitorTeam, localScore/visitorScore (null if not played), nameField, numMatchDay, idGroup). Month only, season implied.
- `FCBQWeb/resultats/{groupId}` → group rounds (only recent/current rounds' matches), `standing`, `playoffs`.
- `CategoryRegistered/getVisibleWeb/{season}/1/`, `Competition/getCompetitionGroupVisibleWeb/{catId}/1` → categories / groups (used for research, e.g. last season).
`MS = https://msstats.optimalwayconsulting.com/v1/fbcv/` — **CORS restricted to fbcv.es** → only server-side (Action):
- `getJsonWithMatchStats/{universallyid}?currentSeason=true` → `teams[]` (match by `teamIdExtern` == teamId) → `players[]`: name, dorsal, timePlayed, data.{score, shotsOfTwoSuccessful, shotsOfThreeSuccessful/Attempted, shotsOfOneSuccessful/Attempted (free throws), personal}. 2-pt attempts are not really recorded (only makes are reliable).
- `team-stats/team/{teamId}/season/{season}` → season totals per player (not used yet).
FBCV human pages: `fbcv.es/competiciones/equipo?id=12981`, `.../competicion?id=2826` (group), `.../partido?id={idMatch}`.
BasketCV (basketcv.com) was the first source but went down / robots-blocked — don't depend on it.

## IDs
Team Don Bosco B = 12981, group = 2826, category (Inf Masc IR N 1ª Zonal) = 452. Rivals: Jesuitas M Blanco 10520, Arte Láctico CB Chiva 13583, Picanya Futurpiso 13 10689, Ferriemoción Claret Azul 13015, CB Aldaia B 11581.
Player ids in data.json = FNV-1a hash (base36) of normalized roster full name; match-sheet names are mapped to roster names (`canon()`, handles extra/missing second surname).

## Competition rules 2026/27 (FBCV IR Infantil Masculino)
Phase 1 (Oct–Dec): 6-team groups, double round robin = 10 rounds. 1ª Zonal actually has 8 groups (A–H, ~46 teams; regulation planned 12).
→ Cto 1ª Zonal: 1st of each group + best 2nds (regulation: 8 best 2nds for 12 groups; exact number for 8 groups not announced). Others → Cto 2ª Zonal.
Phase 2 (Jan–May): Cto 1ª Zonal groups of 8, double round robin; **top 4 of each group earn a place in Preferente next season**; also cup playoffs (1/8 … final end of May).
Source: https://www.fbcv.es/documentacion/sistema-competicion-ir/#sec-3

## Results so far
R1 17 Oct: Don Bosco B 38–61 Jesuitas M Blanco (home). R2 24 Oct: Chiva 63–53 Don Bosco B. Makar: R1 0 pts 18 min (FT 0/4); R2 5 pts 14 min (2×2PT, FT 1/2, 3 PF).
Next: R3 Sat 31 Oct 16:00 vs Claret Azul, Pab Salesianos (home).
Last season (2025/26) Don Bosco B: Nivel 1ª Zonal 3rd/6, then Cto 1ª Zonal 6th/8. Rivals mostly came from 2ª Zonal; Claret Azul was 2nd in 1ª Zonal (strongest), Picanya "13" is a pure 2013 squad.

## Ideas discussed / possible next steps
- Verify the Action works from GitHub (msstats might need Referer/Origin; script already sends them).
- Live layer in page refreshes scores/standings/calendar from ESB on every open; could also refresh roster live.
- Phase 2 in January: new group id; page picks group of next/last match automatically — check it.
- Maybe use `team-stats` endpoint, add fouls column, per-game detail view, other Don Bosco teams via config.

## Conventions
- Keep it dependency-free, single `index.html`. All UI strings in the `T` object (ru/es/en) — add all three when adding text.
- Never store personal data from getTeamCard beyond first name + surname (and output only per `nameStyle`).
- Be polite to the API: low frequency, reuse cached box scores.
