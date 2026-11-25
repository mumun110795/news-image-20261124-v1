// The Monday Ledger — a one-image broadsheet summing up Monday 24 November 2026.
// Pure Node standard library: we rasterise into an RGB pixel buffer with our
// own tiny bitmap typeface, draw every illustration from primitives, then
// encode a deterministic PNG with node:zlib. No network, no dependencies.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [243, 236, 216];
const PAPER_DARK: RGB = [232, 221, 192];
const INK: RGB = [26, 24, 20];
const RED: RGB = [164, 32, 28];
const NAVY: RGB = [24, 42, 74];
const GOLD: RGB = [176, 132, 40];
const TEAL: RGB = [28, 96, 92];
const SKY: RGB = [168, 198, 214];
const SEA: RGB = [44, 92, 128];
const SAND: RGB = [206, 178, 120];
const GREEN: RGB = [62, 110, 58];
const GREY: RGB = [110, 104, 94];
const WHITE: RGB = [250, 247, 238];
const ORANGE: RGB = [206, 110, 36];
const PURPLE: RGB = [92, 62, 120];

// ---------------------------------------------------------------- canvas
const buf = new Uint8Array(W * H * 3);
function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) setPx(xx, yy, c);
}
function frameRect(x: number, y: number, w: number, h: number, c: RGB, t = 2): void {
  fillRect(x, y, w, t, c); fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c); fillRect(x + w - t, y, t, h, c);
}
function hLine(x: number, y: number, w: number, c: RGB, t = 1): void { fillRect(x, y, w, t, c); }
function vLine(x: number, y: number, h: number, c: RGB, t = 1): void { fillRect(x, y, t, h, c); }
function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++)
    for (let xx = cx - r; xx <= cx + r; xx++)
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) setPx(xx, yy, c);
}
function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let yy = cy - r - t; yy <= cy + r + t; yy++)
    for (let xx = cx - r - t; xx <= cx + r + t; xx++) {
      const d = Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy));
      if (d <= r && d > r - t) setPx(xx, yy, c);
    }
}
function tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: RGB): void {
  const minX = Math.min(x1, x2, x3), maxX = Math.max(x1, x2, x3);
  const minY = Math.min(y1, y2, y3), maxY = Math.max(y1, y2, y3);
  const area = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
  for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
    const a = ((x2 - xx) * (y3 - yy) - (y2 - yy) * (x3 - xx)) / area;
    const b = ((x3 - xx) * (y1 - yy) - (y3 - yy) * (x1 - xx)) / area;
    const g = 1 - a - b;
    if (a >= 0 && b >= 0 && g >= 0) setPx(xx, yy, c);
  }
}
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 2): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps);
    const y = Math.round(y0 + ((y1 - y0) * s) / steps);
    fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
  }
}
// Deterministic pseudo-random dots (fixed seed) for texture / star fields.
function sprinkle(x: number, y: number, w: number, h: number, n: number, c: RGB, seed: number): void {
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    const dx = s % w; s = (s * 1103515245 + 12345) >>> 0;
    setPx(x + dx, y + (s % h), c);
  }
}

// ---------------------------------------------------------------- typeface
// A hand-drawn 5x7 bitmap face. Each glyph is seven rows of five pixels.
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".####", "#....", "#....", "#....", "#....", "#....", ".####"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".####", "#....", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", ".#.#.", "..#..", "..#..", "..#..", ".#.#.", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#..##", "#.#.#", "##..#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
  ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
  ",": [".....", ".....", ".....", ".....", ".##..", ".##..", ".#..."],
  "'": [".##..", ".##..", ".#...", ".....", ".....", ".....", "....."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  ":": [".....", ".##..", ".##..", ".....", ".##..", ".##..", "....."],
  ";": [".....", ".##..", ".##..", ".....", ".##..", ".##..", ".#..."],
  "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "$": ["..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "(": ["...##", "..#..", ".#...", ".#...", ".#...", "..#..", "...##"],
  ")": ["##...", "..#..", "...#.", "...#.", "...#.", "..#..", "##..."],
  "%": ["##..#", "##.#.", "....#", "...#.", "..#..", ".#.##", "#..##"],
  "&": [".##..", "#..#.", "#.#..", ".#...", "#.#.#", "#..#.", ".##.#"],
  "*": [".....", "#.#.#", ".###.", "#####", ".###.", "#.#.#", "....."],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};
function textW(s: string, scale: number): number {
  return s.length === 0 ? 0 : s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  const up = s.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    const g = GLYPHS[up[i]] ?? GLYPHS[" "];
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === "#") fillRect(x + i * 6 * scale + col * scale, y + r * scale, scale, scale, c);
  }
}
function drawTextC(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(Math.round(cx - textW(s, scale) / 2), y, s, scale, c);
}
function drawTextR(rx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(rx - textW(s, scale), y, s, scale, c);
}
// Greedy word wrap against the bitmap face metrics.
function wrap(s: string, scale: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textW(trial, scale) <= maxW || cur === "") cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function drawWrapped(x: number, y: number, s: string, scale: number, c: RGB, maxW: number, lineH: number, maxLines: number): number {
  const ls = wrap(s, scale, maxW).slice(0, maxLines);
  ls.forEach((l, i) => drawText(x, y + i * lineH, l, scale, c));
  return y + ls.length * lineH;
}

// ---------------------------------------------------------------- story data
interface Story { region: string; head: string; body: string; art: string; }
const HEROES: Story[] = [
  { region: "MARKETS / TECH", art: "chip",
    head: "HUANG BACK AT NVIDIA HELM",
    body: "JENSEN HUANG IS REINSTATED AS NVIDIA CEO AND BOARD CHAIR, UNDER TWO WEEKS AFTER HE RESIGNED. TRUMP INTERVENED WITH THE BOARD — AND MARKETS SURGED ON THE NEWS." },
  { region: "MIDDLE EAST / AFRICA", art: "ship",
    head: "UKRAINE SINKS RUSSIAN WARSHIP OFF LIBYA",
    body: "A UKRAINIAN DRONE ATTACK SINKS A RUSSIAN WARSHIP IN BENGHAZI PORT. THE UN MISSION URGES A PROBE AND LIBYA DEMANDS EXPLANATIONS FROM KYIV." },
  { region: "CLIMATE", art: "summit",
    head: "COP31 ENDS WITH NO DEAL",
    body: "THE COP31 CLIMATE SUMMIT CLOSES WITHOUT AN AGREEMENT AFTER A DEEP SPLIT OVER FOSSIL FUELS AND CLIMATE FINANCE. DELEGATES LEAVE WITH THE FIGHT UNFINISHED." },
];
const CARDS: Story[] = [
  { region: "ASIA", art: "scales", head: "ICJ RULING: GENERALS SANCTIONED",
    body: "BRITAIN SANCTIONS FIVE MYANMAR GENERALS; 14 COUNTRIES AFFIRM THE ICJ ROHINGYA RULING." },
  { region: "MIDDLE EAST", art: "dome", head: "GAZA: SECURITY CHIEF KILLED",
    body: "STRIKE KILLS HAMAS CHIEF ABU NAHEL AND SIX OTHERS. UN: WAR UNDID 77 YEARS OF DEVELOPMENT." },
  { region: "EUROPE", art: "tower", head: "ZAPORIZHZHIA HIT OVERNIGHT",
    body: "RUSSIAN ATTACK ON AN APARTMENT BLOCK KILLS 2 AND WOUNDS 40, AMONG THEM FOUR CHILDREN." },
  { region: "MIDDLE EAST", art: "flag", head: "IRAN VOWS TO FIGHT BLOCKADE",
    body: "VANCE, RUBIO MEET QATAR'S PM. TEHRAN VOWS ALL TOOLS VS THE BLOCKADE; SETS 7 TALKS TERMS." },
  { region: "ASIA", art: "gavel", head: "SHANGHAI CHIEF UNDER PROBE",
    body: "CHINA PROBES POLITBURO MEMBER CHEN JINING, THE FOURTH TOP-LEADERSHIP CASE SINCE 2025." },
  { region: "ASIA", art: "rocket", head: "TIANGONG OPENS TO PAKISTAN",
    body: "FIRST FOREIGN ASTRONAUT AT CHINA'S STATION: PAKISTAN'S ZEESHAN ALI, UP ON SHENZHOU-24." },
  { region: "ASIA", art: "quake", head: "M5.6 QUAKE SHAKES NEPAL",
    body: "A 5.6-MAGNITUDE EARTHQUAKE STRIKES KOSHI PROVINCE, NEAR THE BORDER WITH CHINA." },
  { region: "MARKETS", art: "pill", head: "SANOFI BUYS INSMED FOR $41BN",
    body: "THE FRENCH GIANT AGREES THE LARGEST BIOTECH DEAL IN NEARLY THREE YEARS FOR THE US FIRM." },
  { region: "NORTH AMERICA", art: "cross", head: "US LOSES MEASLES-FREE STATUS",
    body: "PENNSYLVANIA RECORDS A 9TH MEASLES DEATH; US LOSES STATUS HELD FOR 25+ YEARS." },
  { region: "AFRICA", art: "boat", head: "974 RESCUED, 175 MISSING AT SEA",
    body: "SENEGAL'S NAVY RESCUES 974 FROM FIVE PIROGUES; 175 FROM ANOTHER BOAT ARE MISSING." },
];
interface Compact { region: string; head: string; body: string; }
const COMPACT: Compact[] = [
  { region: "EUROPE", head: "MOSCOW WARNS ESTONIA; NATO EYES SPACE", body: "RUSSIA: ESTONIA 'ON THE VERGE OF OPEN WAR'; MEDVEDEV FLOATS A NUCLEAR STRIKE. NATO VOWS SPACE DEFENCE; RUSSIAN DEAD PUT AT 700,000+." },
  { region: "N. AMERICA", head: "GIULIANI MEDAL; DEATH DIRECTIVE", body: "TRUMP AWARDS GIULIANI THE MEDAL OF FREEDOM IN A PRIVATE OVAL OFFICE CEREMONY, AND WILL SIGN A DIRECTIVE EXPEDITING DEATH SENTENCES." },
  { region: "N. AMERICA", head: "CHIP FIRMS BLACKLISTED; IOWA BLAST OK'D", body: "US BLACKLISTS MEGASPEED AND AN ALIBABA UNIT OVER CHIP DIVERSION. A COURT CLEARS THE ARMY TO DETONATE A TOXIC STOCKPILE IN IOWA." },
  { region: "AFRICA", head: "FIGHTING TRAPS EBOLA TEAMS", body: "HEAVY FIGHTING IN ITURI, DR CONGO, TRAPS EBOLA RESPONDERS FOR OVER 24 HOURS, THE WHO SAYS." },
  { region: "MIDDLE EAST", head: "HOUTHI FIGURES SANCTIONED", body: "BRITAIN SANCTIONS A HOUTHI ENTITY AND FOUR SENIOR FIGURES. A RIYADH FINANCE TOWER IS HIT; HOUTHIS REPORT DOZENS DEAD IN AIRSTRIKES." },
  { region: "ASIA", head: "$375K BOUNTY FOR AI EXAM CHEATS", body: "SOUTH KOREA OFFERS REWARDS OF UP TO $375,000 TO CATCH STUDENTS USING AI TO CHEAT IN THE COLLEGE ENTRANCE EXAM." },
  { region: "N. AMERICA", head: "STATES SUE SPACEX OVER GROK", body: "OREGON AND VIRGINIA SUE SPACEX OVER ALLEGED GROK-GENERATED CHILD-ABUSE IMAGES." },
  { region: "EUROPE", head: "LUKASHENKO OFFERS JOINT FLIGHT", body: "BELARUS'S LEADER PROPOSES THAT HE AND ZELENSKY FLY TOGETHER TO MOSCOW FOR TALKS." },
  { region: "MIDDLE EAST", head: "EISENKOT CLINCHES FIRST DEAL", body: "ISRAEL'S EISENKOT SEALS A FIRST COALITION DEAL WITH LIEBERMAN; HE HAS UNTIL 6 DECEMBER TO FORM A GOVERNMENT." },
  { region: "MIDDLE EAST", head: "IRAQ MOVES ON KURDISH OIL", body: "IRAQ'S PM ORDERS THE FEDERAL OIL MINISTRY TO MANAGE OILFIELDS UNDER KURDISH CONTROL AND TAKE OVER BORDER CROSSINGS." },
  { region: "LATIN AMERICA", head: "CAR BOMB ROCKS VILLAVICENCIO", body: "A CAR BOMB DESTROYS BUILDINGS IN THE COLOMBIAN CITY; NO VICTIMS ARE YET CONFIRMED." },
  { region: "WORLD", head: "UN CHIEF SEEKS AI-RISK PACT", body: "GUTERRES CALLS FOR A MULTILATERAL AI-RISK FRAMEWORK WITHIN A YEAR." },
  { region: "LATIN AMERICA", head: "MEXICO TO TRY 'EL CHAPO ISIDRO'", body: "MEXICO WILL TRY THE DRUG LORD ITSELF DESPITE A US EXTRADITION REQUEST." },
  { region: "N. AMERICA", head: "NEW US TARIFFS LOOM", body: "THE TRUMP ADMINISTRATION IS SET TO UNVEIL TARIFFS AFTER A SECTION 301 PROBE INTO EXCESS FACTORY CAPACITY IN 16 PARTNERS." },
  { region: "N. AMERICA", head: "ABREGO GARCIA TO LEAVE US", body: "KILMAR ABREGO GARCIA WILL LEAVE THE US VOLUNTARILY AND FLY TO EUROPE." },
  { region: "EUROPE", head: "NUCLEAR TEST INQUIRY OPENS", body: "BRITAIN LAUNCHES AN INQUIRY INTO THE IMPACT OF NUCLEAR TESTS ON VETERANS." },
  { region: "LATIN AMERICA", head: "WHO CHIEF VISITS CUBA", body: "THE WHO CHIEF TOURS CUBA'S DETERIORATING HEALTH SYSTEM." },
  { region: "AFRICA", head: "TIGRAY STRIKES 'WAR CRIMES?'", body: "AMNESTY SAYS ETHIOPIAN ARTILLERY STRIKES ON TIGRAY TOWNS SHOULD BE PROBED AS POSSIBLE WAR CRIMES." },
  { region: "ASIA", head: "HASINA VOWS 16 DEC RETURN", body: "SHEIKH HASINA PLANS TO RETURN TO BANGLADESH; DHAKA SAYS SHE WILL BE 'BROUGHT BACK IN HANDCUFFS'." },
  { region: "ASIA", head: "RUSSIAN JETS ENTER SK ZONE", body: "RUSSIAN MILITARY AIRCRAFT ENTERED SOUTH KOREA'S AIR DEFENCE IDENTIFICATION ZONE OVER THE EAST SEA, SEOUL SAYS." },
];
const STATS: Array<[string, string]> = [
  ["$41BN", "SANOFI-INSMED DEAL"],
  ["700,000+", "RUSSIAN DEAD - ANALYSIS"],
  ["974", "MIGRANTS RESCUED OFF SENEGAL"],
  ["175", "MISSING AT SEA"],
  ["40", "WOUNDED IN ZAPORIZHZHIA"],
  ["$375,000", "AI-CHEAT REWARD - SEOUL"],
  ["M5.6", "NEPAL EARTHQUAKE"],
  ["77 YRS", "GAZA DEVELOPMENT UNDONE"],
];

// ---------------------------------------------------------------- scenes
// Every illustration is drawn from primitives inside a clipped box.
function sceneChip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, NAVY);
  sprinkle(x, y, w, h, 60, GOLD, 7);
  const cw = 74, chh = 52, cx = x + (w - cw) / 2, cy = y + (h - chh) / 2;
  for (let i = 0; i < 5; i++) { fillRect(cx - 12, cy + 6 + i * 10, 12, 3, GOLD); fillRect(cx + cw, cy + 6 + i * 10, 12, 3, GOLD); }
  for (let i = 0; i < 4; i++) { fillRect(cx + 8 + i * 16, cy - 10, 3, 10, GOLD); fillRect(cx + 8 + i * 16, cy + chh, 3, 10, GOLD); }
  fillRect(cx, cy, cw, chh, TEAL); frameRect(cx, cy, cw, chh, GOLD, 2);
  fillRect(cx + 10, cy + 10, 24, 18, GOLD); frameRect(cx + 10, cy + 10, 24, 18, NAVY, 1);
  line(cx + 44, cy + 10, cx + 64, cy + 10, GOLD, 2); line(cx + 44, cy + 20, cx + 64, cy + 20, GOLD, 2);
  line(cx + 44, cy + 30, cx + 64, cy + 30, GOLD, 2); line(cx + 10, cy + 40, cx + 64, cy + 40, GOLD, 2);
  // rising market arrow
  line(x + 14, y + h - 16, x + 52, y + h - 34, GREEN, 3); line(x + 52, y + h - 34, x + 84, y + h - 26, GREEN, 3);
  line(x + 84, y + h - 26, x + 118, y + h - 48, GREEN, 3); tri(x + 118, y + h - 56, x + 106, y + h - 46, x + 120, y + h - 40, GREEN);
  // crown of the returning chief
  tri(x + w - 66, y + 22, x + w - 54, y + 8, x + w - 44, y + 22, GOLD);
  tri(x + w - 44, y + 22, x + w - 32, y + 8, x + w - 22, y + 22, GOLD);
  fillRect(x + w - 66, y + 22, 44, 6, GOLD);
}
function sceneShip(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY); fillRect(x, y + h - 34, w, 34, SEA);
  for (let i = 0; i < 6; i++) { const wx = x + 12 + i * 46; tri(wx, y + h - 26, wx + 12, y + h - 34, wx + 24, y + h - 26, WHITE); }
  circle(x + w - 34, y + 18, 11, GOLD);
  // warship hull and superstructure
  const hy = y + h - 52;
  fillRect(x + 52, hy, 168, 14, INK); tri(x + 220, hy, x + 244, hy + 14, x + 220, hy + 14, INK); tri(x + 28, hy, x + 52, hy, x + 52, hy + 14, INK);
  fillRect(x + 92, hy - 16, 54, 16, GREY); fillRect(x + 108, hy - 28, 22, 12, GREY);
  line(x + 119, hy - 28, x + 119, hy - 44, INK, 2); line(x + 119, hy - 44, x + 142, hy - 38, INK, 2);
  fillRect(x + 160, hy - 12, 30, 12, GREY);
  // smoke and fire after the strike
  circle(x + 176, hy - 22, 10, ORANGE); circle(x + 184, hy - 30, 8, RED); circle(x + 168, hy - 32, 7, GREY); circle(x + 182, hy - 44, 9, GREY);
  // drone overhead
  const dx = x + 62, dy = y + 20;
  fillRect(dx, dy, 26, 6, INK); circle(dx + 2, dy + 3, 5, INK); circle(dx + 28, dy + 3, 5, INK);
  fillRect(dx + 11, dy + 6, 4, 8, INK);
}
function sceneSummit(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, [58, 74, 66]);
  // conference table with two blocs pulling apart
  fillRect(x + 20, y + h - 40, w - 40, 12, SAND);
  for (let i = 0; i < 4; i++) { circle(x + 44 + i * 22, y + h - 52, 7, NAVY); fillRect(x + 38 + i * 22, y + h - 46, 13, 8, NAVY); }
  for (let i = 0; i < 4; i++) { circle(x + w - 108 + i * 22, y + h - 52, 7, RED); fillRect(x + w - 114 + i * 22, y + h - 46, 13, 8, RED); }
  // cracked globe in the middle
  circle(x + w / 2, y + 44, 30, TEAL); ring(x + w / 2, y + 44, 30, INK, 2);
  line(x + w / 2 - 30, y + 44, x + w / 2 + 30, y + 44, INK, 1); line(x + w / 2, y + 14, x + w / 2, y + 74, INK, 1);
  line(x + w / 2, y + 16, x + w / 2 - 8, y + 34, INK, 2); line(x + w / 2 - 8, y + 34, x + w / 2 + 6, y + 48, INK, 2); line(x + w / 2 + 6, y + 48, x + w / 2 - 4, y + 70, INK, 2);
  // factory smoke vs green shoot
  fillRect(x + 18, y + 16, 20, 26, GREY); tri(x + 14, y + 16, x + 42, y + 16, x + 28, y + 4, GREY);
  circle(x + 30, y + 2 + 6, 6, GREY); circle(x + 40, y + 2, 5, GREY);
  line(x + w - 30, y + 42, x + w - 30, y + 20, GREEN, 3); circle(x + w - 36, y + 18, 6, GREEN); circle(x + w - 24, y + 14, 6, GREEN);
  drawTextC(x + w / 2, y + h - 22, "NO DEAL", 2, WHITE);
}
function sceneIcon(kind: string, x: number, y: number, w: number, h: number): void {
  const cx = x + w / 2, cy = y + h / 2;
  if (kind === "scales") { fillRect(x, y, w, h, PAPER_DARK); line(cx, cy - 24, cx, cy + 20, INK, 3); line(cx - 26, cy - 16, cx + 26, cy - 16, INK, 3); tri(cx - 26, cy - 16, cx - 38, cy + 4, cx - 14, cy + 4, GOLD); tri(cx + 26, cy - 16, cx + 14, cy + 4, cx + 38, cy + 4, GOLD); fillRect(cx - 16, cy + 22, 32, 4, INK); circle(cx, cy - 24, 4, RED); }
  else if (kind === "dome") { fillRect(x, y, w, h, SKY); fillRect(x, y + h - 14, w, 14, SAND); tri(cx, cy - 30, cx - 30, cy + 8, cx + 30, cy + 8, GOLD); fillRect(cx - 34, cy + 8, 68, 10, WHITE); fillRect(cx - 3, cy - 40, 6, 12, GOLD); circle(cx, cy - 44, 4, GOLD); fillRect(x + 8, y + 10, 16, 22, GREY); fillRect(x + w - 26, y + 16, 18, 16, GREY); }
  else if (kind === "tower") { fillRect(x, y, w, h, [70, 76, 92]); fillRect(cx - 15, y + 4, 30, h - 10, GREY); for (let r = 0; r < 3; r++) for (let cix = 0; cix < 3; cix++) fillRect(cx - 11 + cix * 9, y + 8 + r * 10, 6, 6, (r === 1 && cix === 1) ? ORANGE : SKY); fillRect(x, y + h - 6, w, 6, INK); fillRect(cx - 44, y + h - 16, 22, 10, PAPER_DARK); fillRect(cx + 24, y + h - 13, 18, 7, PAPER_DARK); circle(x + 24, y + 12, 5, RED); circle(x + w - 24, y + 10, 4, ORANGE); }
  else if (kind === "flag") { fillRect(x, y, w, h, [40, 84, 60]); fillRect(x, y + h / 3, w, h / 3, WHITE); fillRect(x, y + (2 * h) / 3, w, h / 3, INK); tri(x, y, x, y + h, x + 18, cy, RED); line(cx + 30, cy - 18, cx + 30, cy + 18, INK, 3); fillRect(cx + 30, cy - 18, 24, 12, NAVY); }
  else if (kind === "gavel") { fillRect(x, y, w, h, PAPER_DARK); line(cx - 22, cy - 18, cx + 14, cy + 16, INK, 5); fillRect(cx + 8, cy - 26, 22, 12, GOLD); fillRect(cx - 26, cy + 20, 52, 5, INK); circle(cx - 30, cy - 24, 8, RED); drawText(cx - 38, cy - 32, "", 1, INK); }
  else if (kind === "rocket") { fillRect(x, y, w, h, NAVY); sprinkle(x, y, w, h, 46, WHITE, 31); tri(cx, cy - 32, cx - 12, cy - 8, cx + 12, cy - 8, WHITE); fillRect(cx - 12, cy - 8, 24, 30, WHITE); circle(cx, cy + 2, 5, SEA); tri(cx - 12, cy + 22, cx - 24, cy + 34, cx - 12, cy + 34, RED); tri(cx + 12, cy + 22, cx + 24, cy + 34, cx + 12, cy + 34, RED); tri(cx, cy + 40, cx - 6, cy + 24, cx + 6, cy + 24, ORANGE); ring(x + 26, cy - 18, 10, TEAL, 2); }
  else if (kind === "quake") { fillRect(x, y, w, h, SAND); tri(x + 10, y + h - 16, x + 44, y + 14, x + 78, y + h - 16, GREY); tri(x + 52, y + h - 16, x + 82, y + 22, x + w - 8, y + h - 16, GREY); fillRect(x + 34, y + 8, 20, 12, WHITE); line(x + 8, y + h - 12, x + 34, y + h - 22, RED, 3); line(x + 34, y + h - 22, x + 52, y + h - 10, RED, 3); line(x + 52, y + h - 10, x + 74, y + h - 24, RED, 3); line(x + 74, y + h - 24, x + w - 8, y + h - 12, RED, 3); }
  else if (kind === "pill") { fillRect(x, y, w, h, TEAL); circle(cx - 14, cy, 15, WHITE); circle(cx + 14, cy, 15, RED); fillRect(cx - 14, cy - 2, 28, 4, INK); drawTextC(cx, y + 8, "$41BN", 2, WHITE); }
  else if (kind === "cross") { fillRect(x, y, w, h, WHITE); fillRect(cx - 6, cy - 26, 12, 52, RED); fillRect(cx - 24, cy - 8, 48, 12, RED); sprinkle(x, y, w, h, 26, ORANGE, 53); }
  else if (kind === "boat") { fillRect(x, y, w, h, SEA); for (let i = 0; i < 6; i++) tri(x + 8 + i * 30, y + h - 8, x + 16 + i * 30, y + h - 14, x + 24 + i * 30, y + h - 8, WHITE); fillRect(cx - 34, cy + 0, 68, 9, SAND); tri(cx + 34, cy + 0, cx + 46, cy + 9, cx + 34, cy + 9, SAND); for (let i = 0; i < 5; i++) circle(cx - 24 + i * 12, cy - 4, 4, INK); line(cx - 40, cy - 20, cx - 40, cy + 0, INK, 2); tri(cx - 40, cy - 20, cx - 40, cy - 9, cx - 29, cy - 14, GOLD); }
  else { fillRect(x, y, w, h, PAPER_DARK); circle(cx, cy, 18, GOLD); }
}
function drawArt(kind: string, x: number, y: number, w: number, h: number): void {
  if (kind === "chip") sceneChip(x, y, w, h);
  else if (kind === "ship") sceneShip(x, y, w, h);
  else if (kind === "summit") sceneSummit(x, y, w, h);
  else sceneIcon(kind, x, y, w, h);
  frameRect(x, y, w, h, INK, 2);
}

// ---------------------------------------------------------------- layout
function chip(x: number, y: number, label: string, c: RGB): number {
  const w = textW(label, 1) + 12;
  fillRect(x, y, w, 13, c);
  drawText(x + 6, y + 3, label, 1, WHITE);
  return w;
}
function stamp(x: number, y: number, label: string, c: RGB): void {
  const w = textW(label, 1) + 16;
  frameRect(x, y, w, 24, c, 2); frameRect(x + 3, y + 3, w - 6, 18, c, 1);
  drawText(x + 8, y + 9, label, 1, c);
}
function worldMap(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, NAVY);
  // Stylised dotted continents: blobs of land dots on a fixed grid pattern.
  const blobs: Array<[number, number, number, number]> = [
    [0.06, 0.16, 0.16, 0.30], [0.24, 0.52, 0.09, 0.34], [0.44, 0.10, 0.20, 0.26],
    [0.47, 0.40, 0.13, 0.36], [0.66, 0.14, 0.24, 0.30], [0.78, 0.52, 0.10, 0.20], [0.86, 0.72, 0.09, 0.14],
  ];
  for (const [fx, fy, fw, fh] of blobs) {
    const bx = x + fx * w, by = y + fy * h, bw = fw * w, bh = fh * h;
    for (let yy = 0; yy < bh; yy += 4) for (let xx = 0; xx < bw; xx += 4) {
      const nx = (xx - bw / 2) / (bw / 2), ny = (yy - bh / 2) / (bh / 2);
      if (nx * nx + ny * ny < 0.85) fillRect(Math.round(bx + xx), Math.round(by + yy), 3, 3, GOLD);
    }
  }
  // pins on the day's hotspots
  circle(x + w * 0.52, y + h * 0.30, 3, RED); circle(x + w * 0.70, y + h * 0.34, 3, RED);
  circle(x + w * 0.16, y + h * 0.30, 3, RED); circle(x + w * 0.84, y + h * 0.58, 3, RED);
}

function render(): void {
  fillRect(0, 0, W, H, PAPER);
  sprinkle(0, 0, W, H, 500, PAPER_DARK, 99);
  frameRect(6, 6, W - 12, H - 12, INK, 3);

  // ---- masthead
  drawText(18, 16, "VOL. CXII", 1, GREY); drawText(18, 27, "NO. 328", 1, GREY);
  drawTextR(W - 18, 16, "EST. 1913", 1, GREY); drawTextR(W - 18, 27, "ONE PAGE, ONE DAY", 1, GREY);
  circle(52, 58, 17, TEAL); ring(52, 58, 17, INK, 1);
  line(35, 58, 69, 58, INK, 1); line(52, 41, 52, 75, INK, 1);
  circle(W - 52, 58, 17, GOLD); ring(W - 52, 58, 17, INK, 1);
  drawTextC(W / 2, 14, "THE MONDAY LEDGER", 7, INK);
  drawTextC(W / 2, 70, "THE WORLD IN ONE PAGE - ALL THE NEWS OF A SINGLE DAY, DRAWN AND SET BY PROGRAM", 1, NAVY);
  hLine(18, 84, W - 36, RED, 4);
  hLine(18, 91, W - 36, INK, 1);
  drawText(18, 97, "MONDAY, 24 NOVEMBER 2026", 2, RED);
  drawTextR(W - 18, 97, "33 STORIES - EVERY REGION", 2, INK);
  drawTextC(W / 2, 97 + 22, "", 1, INK);

  // ---- stat band
  const sbY = 124, sbH = 70;
  fillRect(14, sbY, W - 28, sbH, NAVY);
  frameRect(14, sbY, W - 28, sbH, GOLD, 2);
  const shortCaps = ["SANOFI-INSMED DEAL", "RUSSIAN DEAD - ANALYSIS", "RESCUED OFF SENEGAL", "MISSING AT SEA",
    "WOUNDED IN ZAPORIZHZHIA", "AI-CHEAT REWARD", "NEPAL EARTHQUAKE", "GAZA DEVELOPMENT UNDONE"];
  for (let i = 0; i < 8; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const cx0 = 14 + col * ((W - 28) / 4), cy0 = sbY + row * (sbH / 2);
    if (col > 0) vLine(Math.round(cx0), sbY + 5, sbH - 10, GOLD, 1);
    if (row > 0) hLine(19, Math.round(cy0), W - 38, GOLD, 1);
    drawTextC(cx0 + (W - 28) / 8, cy0 + 4, STATS[i][0], 2, GOLD);
    drawTextC(cx0 + (W - 28) / 8, cy0 + 23, shortCaps[i], 1, WHITE);
  }

  // ---- heroes
  const hy = 202, hh = 212;
  HEROES.forEach((s, i) => {
    const x = 14 + i * 334, w = 326;
    fillRect(x, hy, w, hh, WHITE); frameRect(x, hy, w, hh, INK, 2);
    chip(x + 8, hy + 7, s.region, RED);
    drawTextR(x + w - 8, hy + 10, "LEAD " + (i + 1), 1, GREY);
    drawArt(s.art, x + 8, hy + 26, w - 16, 90);
    let yy = drawWrapped(x + 8, hy + 122, s.head, 2, INK, w - 16, 17, 2);
    hLine(x + 8, yy + 1, w - 16, GOLD, 2);
    drawWrapped(x + 8, yy + 6, s.body, 1, INK, w - 16, 10, 5);
  });

  // ---- illustrated cards
  const cy0 = 422, cardH = 112;
  CARDS.forEach((s, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const x = 14 + col * 201, y = cy0 + row * (cardH + 6), w = 193;
    fillRect(x, y, w, cardH, WHITE); frameRect(x, y, w, cardH, INK, 1);
    drawArt(s.art, x + 5, y + 5, w - 10, 42);
    chip(x + 5, y + 50, s.region, TEAL);
    let yy = drawWrapped(x + 5, y + 66, s.head, 1, INK, w - 10, 9, 2);
    drawWrapped(x + 5, yy + 1, s.body, 1, GREY, w - 10, 8, 3);
  });

  // ---- compact briefs, grouped with region chips
  const by = 660;
  hLine(14, by, W - 28, INK, 2);
  drawText(14, by + 5, "AROUND THE WORLD IN BRIEF", 2, INK);
  let chipX = 330;
  for (const r of ["EUROPE", "N. AMERICA", "MIDDLE EAST", "AFRICA", "LATIN AMERICA", "ASIA"]) {
    chipX += chip(chipX, by + 6, r, NAVY) + 6;
  }
  stamp(W - 150, by + 2, "WIRE COPY", PURPLE);
  const iy = by + 28;
  COMPACT.forEach((s, i) => {
    const col = Math.floor(i / 10), row = i % 10;
    const x = 14 + col * 501, y = iy + row * 27, w = 493;
    if (row > 0) hLine(x, y - 3, w, PAPER_DARK, 1);
    drawText(x, y, s.region + " -", 1, RED);
    const hw = textW(s.region + " - ", 1);
    const headLines = wrap(s.head, 1, w - hw);
    drawText(x + hw, y, headLines[0], 1, INK);
    let usedHead = headLines.slice(1);
    let bodyText = (usedHead.length ? usedHead.join(" ") + " " : "") + s.body;
    drawWrapped(x, y + 9, bodyText, 1, GREY, w, 8, 2);
  });

  // ---- footer: map, date check, stamps
  const fy = 966;
  hLine(14, fy - 5, W - 28, INK, 2);
  worldMap(14, fy, 300, 50);
  const dcX = 326, dcW = 400;
  frameRect(dcX, fy, dcW, 50, RED, 2);
  drawTextC(dcX + dcW / 2, fy + 4, "DATE CHECK", 2, RED);
  drawTextC(dcX + dcW / 2, fy + 21, "EVERY STORY DATED MON 24 NOV 2026", 1, INK);
  drawTextC(dcX + dcW / 2, fy + 30, "FROM THE DAY'S WIRES - 33 STORIES, ONE DAY ONLY", 1, INK);
  drawTextC(dcX + dcW / 2, fy + 39, "SET BY PROGRAM - NO PHOTOGRAPHS", 1, GREY);
  stamp(742, fy + 1, "VERIFIED", RED);
  stamp(742, fy + 27, "ONE DAY ONLY", TEAL);
  drawText(880, fy + 3, "THE MONDAY", 1, INK); drawText(880, fy + 12, "LEDGER -", 1, INK);
  drawText(880, fy + 23, "TOMORROW:", 1, GREY); drawText(880, fy + 32, "A NEW DAY,", 1, GREY); drawText(880, fy + 41, "A NEW PAGE", 1, GREY);
}

// ---------------------------------------------------------------- PNG out
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    Buffer.from(buf.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

render();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePng());
