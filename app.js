// GZW Lamang map viewer. Loaded by index.html after OpenSeadragon and data.js.
// ---- Geometry: base image is 12022 x 7168 px; map area starts at (OX, OY) px, RES metres per px. ----
const W = 12022, H = 7168, OX = 150, OY = 320;
const RES = (2 * 20037508.342789244 / 2 ** 17) / 256;
const G = window.GZW;

// ---- Style ----
// Every kind of map text: its size at 1x zoom (the full-map view) and the smallest it may get (J's minimums).
// Each kind shrinks by TEXT_SHRINK.perZoom px per doubling of zoom until it reaches its minimum.
// Danger-zone text is different (J): it follows a table of px sizes by zoom (1x, 2x, 3x, 4x+), straight lines in between,
// and stays at the last size when zooming in further.
const TEXT_SHRINK = { perZoom: 2.5 };
const TEXT = {   // J's chosen sizes (2026-10-30)
  region:   { name: "Region names",    at1x: 16,   min: 15 },
  base:     { name: "Bases",           at1x: 15,   min: 14.5 },
  cop:      { name: "COPs",            at1x: 12,   min: 12 },
  camp1:    { name: "Camp 1st line",   at1x: 13,   min: 13 },
  camp2:    { name: "Camp 2nd line",   at1x: 12,   min: 12 },
  lz:       { name: "Landing zones",   at1x: 12,   min: 12 },
  route:    { name: "Route notes",     at1x: 20,   min: 11 },
  distance: { name: "Route distances", at1x: 17,   min: 9.4 },
  zone:     { name: "Danger zones",    stops: [[1, 6], [2, 7], [3, 9], [4, 10]] },
};
function textPx(kind) {
  const t = TEXT[kind];
  if (t.stops) {
    const z = 2 ** view.k, s = t.stops;
    if (z <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++)
      if (z <= s[i][0]) return s[i - 1][1] + (s[i][1] - s[i - 1][1]) * (z - s[i - 1][0]) / (s[i][0] - s[i - 1][0]);
    return s[s.length - 1][1];
  }
  return Math.max(t.min, t.at1x - TEXT_SHRINK.perZoom * view.k);
}
const COLORS = {
  trashed: "#ff4d2e", campsite: "#00c8ff", remote: "#be78ff", crate: "#3884ff", cache: "#a64dff", lz: "#fdf535", lzOther: "#9a8a3a", star: "#ff2dbe", cacheNotFound: "#6b5a7d",
  cop: "#f5f5f5", base: "#2ecc71", heli: "#ff3d00", toolbox: "#ff9f1a",
  good: "#5ae678", "good?": "#ffb000", bad: "#ff5a5a", unknown: "#bec4cc",
};
// Extra hover line for a camp status.
const STATUS_NOTE = { "good?": "Not sure if spawns hideout loot" };
// Playable factions (full names split over three lines on the map) and their logos.
const FACTIONS = {
  LRI: { name: "Lamang Recovery Initiative", logo: "factions/LRI.png", labelPos: "above" },
  MSS: { name: "Mithras Security Systems", logo: "factions/MSS.png", labelPos: "below" },
  CSI: { name: "Crimson Shield International", logo: "factions/CSI.png", labelPos: "above" },
};
for (const f of Object.values(FACTIONS)) { f.img = new Image(); f.img.onload = () => redraw(); f.img.src = f.logo; }
const CAMP_TEXT = { "Trashed Campsite": "#a0e8ff", "Campsite": "#a0e8ff", "Remote Campsite": "#dcbeff" };
const RUN_COLORS = ["#00e5ff", "#ff4081", "#76ff03", "#ffab00", "#d500f9", "#ffffff", "#00e676"];

// ---- Persistent viewer state (per browser) ----
// Escape text before it goes into innerHTML (marker names come from third-party data).
const esc = v => String(v).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
// Statuses are read-only and come from campsite_status.json (via data.js); clear any old click overrides.
try { localStorage.removeItem("gzw-camp-status"); } catch {}
const layers = { locations: true, camps: true, crates: true, caches: true, toolboxes: false, lzs: true, cops: true, bases: true, route: false };
const savedLayers = load("gzw-layers", {});
for (const k of Object.keys(layers)) if (typeof savedLayers?.[k] === "boolean") layers[k] = savedLayers[k];
const campStatus = c => c.status || "unknown";
// The faction you play: its LZs and the shared ones are normal, the other factions' LZs are dimmed.
const savedFaction = load("gzw-faction", "LRI");
let faction = Object.hasOwn(FACTIONS, savedFaction) ? savedFaction : "LRI";
const BASE_LOGO = r => 2 * (r + 3);   // half-size of a base logo: twice the old base square (J)
const lzOpen = l => !l.faction || l.faction === faction;
const savedRoute = load("gzw-route", "all");
let routeMode = Object.hasOwn(G.routes, savedRoute) ? savedRoute : "all";
const R = () => G.routes[routeMode];

// ---- Viewer ----
const viewer = OpenSeadragon({
  id: "map",
  prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/",
  tileSources: { Image: { xmlns: "http://schemas.microsoft.com/deepzoom/2008", Url: "base_files/", Format: "jpg",
                          Overlap: "1", TileSize: "254", Size: { Width: String(W), Height: String(H) } } },
  maxZoomPixelRatio: 3, zoomPerScroll: 1.4, animationTime: 0.6,
  showNavigator: true, navigatorPosition: "TOP_RIGHT",
  gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
});

// ---- Overlay canvas ----
const canvas = document.getElementById("overlay");
viewer.canvas.appendChild(canvas);   // inside the drawing area, so the overview map stays on top
const ctx = canvas.getContext("2d");
let view = null;   // { ax, ay, s, k } : screen = a + imagePx * s ; k = log2(zoom / home zoom)
let hits = [];     // hover / click targets drawn this frame

function sizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = innerWidth + "px"; canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function toScreen(X, Y) {
  return [view.ax + (OX + X / RES) * view.s, view.ay + (OY + (8000 - Y) / RES) * view.s];
}

function computeView() {
  if (!viewer.world.getItemAt(0)) return false;
  const vp = viewer.viewport;
  const p0 = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(0, 0));
  const p1 = vp.imageToViewerElementCoordinates(new OpenSeadragon.Point(1000, 0));
  view = { ax: p0.x, ay: p0.y, s: (p1.x - p0.x) / 1000, k: Math.max(0, Math.log2(vp.getZoom(true) / vp.getHomeZoom())) };
  return true;
}

// Label collision: keep a list of placed label boxes; a label is drawn only if it doesn't overlap one.
let placed = [];
function free(r) {
  for (const p of placed) if (r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y) return false;
  return true;
}
function onScreen(x, y, pad = 60) { return x > -pad && y > -pad && x < innerWidth + pad && y < innerHeight + pad; }

const MAX_LINE_M = 0;   // 1 km line cap: off for now (J, 2026-10-30); set to 1000 to bring it back
function textBox(lines, x, y, anchor) {
  // lines: [{ parts: [[text, color]], px, bold }]; returns box for the block positioned at x,y.
  // If any line would be wider than MAX_LINE_M at this zoom, the whole block shrinks (line sizes keep their ratio).
  const measure = L => {
    ctx.font = `${L.bold ? 700 : 400} ${L.px}px "Segoe UI", sans-serif`;
    return L.parts.reduce((s, [t]) => s + ctx.measureText(t).width, 0);
  };
  lines = lines.map(L => ({ ...L }));
  const maxW = MAX_LINE_M / RES * view.s, widest = Math.max(...lines.map(measure));
  if (MAX_LINE_M && widest > maxW) for (const L of lines) L.px *= maxW / widest;
  let w = 0, h = 0;
  for (const L of lines) {
    L.width = measure(L);
    w = Math.max(w, L.width); h += L.px * 1.2;
  }
  // anchor: "left" (starts at x, centred on y), "center" (centred on x,y), "above"/"below" (centred on x, ending/starting at y).
  const bx = anchor === "left" ? x : x - w / 2;
  const top = anchor === "above" ? y - h : anchor === "below" ? y : y - h / 2;
  return { x: bx - 2, y: top - 2, w: w + 4, h: h + 4, lines, left: bx, top };
}
function drawText(box, center = false) {
  let ty = box.top;
  for (const L of box.lines) {
    ctx.font = `${L.bold ? 700 : 400} ${L.px}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, L.px / 5); ctx.strokeStyle = "rgba(0,0,0,0.92)";
    let tx = center ? box.left + (box.w - 4 - L.width) / 2 : box.left;
    const cy = ty + L.px * 0.6;
    for (const [t, col] of L.parts) {
      ctx.strokeText(t, tx, cy); ctx.fillStyle = col; ctx.fillText(t, tx, cy);
      tx += ctx.measureText(t).width;
    }
    ty += L.px * 1.2;
  }
}
function label(lines, x, y, anchor = "left", fallback = null) {
  let box = textBox(lines, x, y, anchor);
  if (!free(box)) {
    if (!fallback) return false;
    box = textBox(fallback, x, y, anchor);
    if (!free(box)) return false;
  }
  placed.push(box); drawText(box, anchor !== "left");
  return true;
}

// ---- Icons ----
function outlined(path, fill, edge = 2.5) {
  ctx.lineJoin = "round";
  ctx.lineWidth = edge * 2; ctx.strokeStyle = "#000"; path(); ctx.stroke();
  ctx.fillStyle = fill; path(); ctx.fill();
}
// Open-ended spanner, drawn as strokes in a unit frame rotated 45 degrees (size s = about the icon's radius).
function spannerPath(s) {
  ctx.beginPath();
  ctx.arc(0, -0.42 * s, 0.34 * s, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75 + 2 * Math.PI);
  ctx.moveTo(0, -0.1 * s); ctx.lineTo(0, 0.82 * s);
}
const icon = {
  spanner: (x, y, r, color) => {
    const s = r * 1.25;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.lineCap = "round";
    ctx.strokeStyle = "#000"; ctx.lineWidth = 0.34 * s + 2.4; spannerPath(s); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 0.34 * s; spannerPath(s); ctx.stroke();
    ctx.restore();
  },
  circle: (x, y, r, fill) => outlined(() => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }, fill, 1.5),
  square: (x, y, r, fill) => outlined(() => { ctx.beginPath(); ctx.rect(x - r, y - r, 2 * r, 2 * r); }, fill, 1.5),
  diamond: (x, y, r, fill) => outlined(() => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }, fill),
  // Faction logo (white artwork) the size of a 2r square, with a dark halo so it reads on any terrain.
  logo: (x, y, r, f) => {
    if (!f.img.complete || !f.img.naturalWidth) { icon.square(x, y, r, COLORS.base); return; }
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 4;
    ctx.drawImage(f.img, x - r, y - r, 2 * r, 2 * r); ctx.drawImage(f.img, x - r, y - r, 2 * r, 2 * r);
    ctx.restore();
  },
  triangle: (x, y, r, fill) => outlined(() => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }, fill),
};
// J's LZ icon: 20x20 pixel art ("#" = black, "." = fill), a top-down helicopter in the GZW Tac Map yellow.
// Drawn as a sprite at its native 20 px, scaled with nearest-neighbour so the pixels stay sharp.
const LZ_PIXELS = [
  "####################",
  "####################",
  "##................##",
  "##.##....##....##.##",
  "##..##..####..##..##",
  "##...##.####.##...##",
  "##....########....##",
  "##.....######.....##",
  "##......####......##",
  "##.....######.....##",
  "##....########....##",
  "##...##..##..##...##",
  "##..##...##...##..##",
  "##.##....##....##.##",
  "##.......##.......##",
  "##.......##.......##",
  "##......####......##",
  "##................##",
  "####################",
  "####################",
];
const LZ_N = LZ_PIXELS.length;
function lzSprite(fill) {
  const c = document.createElement("canvas"); c.width = c.height = LZ_N;
  const g = c.getContext("2d");
  LZ_PIXELS.forEach((row, y) => [...row].forEach((ch, x) => { g.fillStyle = ch === "#" ? "#000" : fill; g.fillRect(x, y, 1, 1); }));
  return c;
}
const LZ_SPRITE = { open: lzSprite(COLORS.lz), other: lzSprite(COLORS.lzOther) };
// Pink star (J's option B at 60%): pink glow, black outline.
function starPath(x, y, R, r = R * 0.45) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? r : R; ctx.lineTo(x + d * Math.cos(a), y + d * Math.sin(a)); }
  ctx.closePath();
}
icon.star = (x, y) => {
  const R = 11 * 0.6;
  ctx.save(); ctx.shadowColor = COLORS.star; ctx.shadowBlur = 6; starPath(x, y, R); ctx.fillStyle = COLORS.star; ctx.fill(); ctx.restore();
  starPath(x, y, R); ctx.lineJoin = "round"; ctx.lineWidth = 1.5; ctx.strokeStyle = "#000"; ctx.stroke(); ctx.fillStyle = COLORS.star; ctx.fill();
};
icon.lz = (x, y, r, open) => {
  const s = LZ_N;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(open ? LZ_SPRITE.open : LZ_SPRITE.other, Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  ctx.imageSmoothingEnabled = true;
};
// Same pixels as an SVG, for the layer button.
const LZ_SVG = `<svg width="14" height="14" viewBox="0 0 ${LZ_N} ${LZ_N}" shape-rendering="crispEdges"><rect width="${LZ_N}" height="${LZ_N}" fill="${COLORS.lz}"/>` +
  `<path d="${LZ_PIXELS.flatMap((row, y) => [...row].map((ch, x) => ch === "#" ? `M${x} ${y}h1v1h-1z` : "")).join("")}"/></svg>`;
const campColor = () => COLORS.campsite;   // every camp icon is blue (J); the type shows in the label

// ---- Route ----
function dashedLine(a, b, color, width, dash) {
  ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke(); ctx.restore();
}
function solidLine(a, b, color) {
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
}
function legNote(a, b) {
  if (!a || !b || !a.letter || !b.letter) return null;
  return (G.legNotes || []).find(n => n.between.includes(a.letter) && n.between.includes(b.letter) && a.letter !== b.letter) || null;
}
function drawRouteLines() {
  const steps = R().steps;
  let prev = null;
  const runCol = r => RUN_COLORS[(r - 1) % RUN_COLORS.length];
  for (const st of steps) {
    if (!st.kind) continue;
    const p = toScreen(st.X, st.Y);
    if (st.arrive === "heli") {
      if (prev && st.from_lz_xy) {
        const a = toScreen(...st.from_lz_xy), b = toScreen(...st.to_lz_xy);
        dashedLine(toScreen(prev.X, prev.Y), a, runCol(prev.run), 2.5, [4, 4]);
        dashedLine(a, b, COLORS.heli, 4, [12, 8]);
      }
      if (st.to_lz_xy) dashedLine(toScreen(...st.to_lz_xy), p, runCol(st.run), 2.5, [4, 4]);
    } else if (prev) {
      const note = legNote(prev, st);
      solidLine(toScreen(prev.X, prev.Y), p, note ? note.color : runCol(st.run));
    }
    prev = st;
  }
  const end = steps[steps.length - 1];
  if (end.lz_xy && prev) dashedLine(toScreen(prev.X, prev.Y), toScreen(...end.lz_xy), runCol(prev.run), 2.5, [4, 4]);
}
// Unload stops and stop numbers: drawn after the map icons so they sit on top.
function drawRouteMarks(px) {
  const steps = R().steps;
  let before = null;
  for (const st of steps) {
    if (!st.kind) continue;
    const note = before && st.arrive !== "heli" ? legNote(before, st) : null;
    if (note) {
      const [ax, ay] = toScreen(before.X, before.Y), [bx, by] = toScreen(st.X, st.Y);
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      if (onScreen(mx, my, 40)) label([{ parts: [[note.text, note.color]], px, bold: true }], mx, my, "center");
    }
    before = st;
  }
  const runCol = r => RUN_COLORS[(r - 1) % RUN_COLORS.length];
  for (const st of steps) {
    if (!st.unload) continue;
    const [x, y] = toScreen(st.X, st.Y);
    if (!onScreen(x, y)) continue;
    if (st.detour > 30) {
      dashedLine(toScreen(...st.from_xy), [x, y], "#fff", 2, [3, 4]);
      dashedLine([x, y], toScreen(...st.to_xy), "#fff", 2, [3, 4]);
    }
    icon.square(x, y, 8, "#fff");
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 1); ctx.lineTo(x, y + 5); ctx.closePath(); ctx.fill();
    ctx.fillRect(x - 1.5, y - 6, 3, 6);
    hits.push({ x, y, r: 10, tip: `<b>Unload</b> at ${esc(st.unload.replace("Outpost ", "COP "))}<br><span class="muted">${esc(st.grid)} · ${st.detour > 30 ? esc(st.detour) + " m detour" : "on the way"}</span>` });
    label([{ parts: [["Unload @ " + st.unload.replace("Outpost ", "COP "), "#fff"]], px, bold: true }], x + 12, y);
  }
  // Stop numbers once zoomed in a little.
  if (view.k >= 1.2) {
    for (const st of steps) {
      if (!st.kind) continue;
      const [x, y] = toScreen(st.X, st.Y);
      if (!onScreen(x, y)) continue;
      const t = String(st.step), r = 9;
      const bx = x - 6 - 2 * r, by = y + 2;
      const box = { x: bx, y: by, w: 2 * r, h: 2 * r };
      if (!free(box)) continue;
      placed.push(box);
      ctx.fillStyle = "rgba(0,0,0,0.9)"; ctx.strokeStyle = runCol(st.run); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx + r, by + r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = `700 10px "Segoe UI", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t, bx + r, by + r + 0.5); ctx.textAlign = "left";
    }
  }
}

// 1x1 grid lines (100 m): faint in the base tiles, so strengthen them as you zoom in. 10x10 lines stay as baked.
function drawGrid() {
  const cell = 100 / RES * view.s;                        // screen px per grid square
  const a = Math.min(0.45, Math.max(0, (cell - 16) / 120));
  if (a <= 0) return;
  const [x0, y0] = toScreen(0, 8000), [x1, y1] = toScreen(14000, 0);
  const iMin = Math.max(1, Math.ceil(-x0 / cell)), iMax = Math.min(139, Math.floor((innerWidth - x0) / cell));
  const jMin = Math.max(1, Math.ceil(-y0 / cell)), jMax = Math.min(79, Math.floor((innerHeight - y0) / cell));
  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = iMin; i <= iMax; i++) if (i % 10) { const x = Math.round(x0 + i * cell) + 0.5; ctx.moveTo(x, Math.max(0, y0)); ctx.lineTo(x, Math.min(innerHeight, y1)); }
  for (let j = jMin; j <= jMax; j++) if (j % 10) { const y = Math.round(y0 + j * cell) + 0.5; ctx.moveTo(Math.max(0, x0), y); ctx.lineTo(Math.min(innerWidth, x1), y); }
  ctx.stroke();
  ctx.restore();
}

// Danger zones: a smooth closed curve (Catmull-Rom through J's points) filled with translucent colour.
// The curve is sampled once into a polyline in map metres; drawing and label fitting both use it.
function zoneOutline(z) {
  if (z.outline) return z.outline;
  const p = z.points, n = p.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(d => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2
                                      + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  return (z.outline = out);
}
function drawZones() {
  for (const z of G.zones || []) {
    ctx.beginPath();
    zoneOutline(z).forEach(([X, Y], i) => { const [x, y] = toScreen(X, Y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha = 0.2; ctx.fillStyle = z.color; ctx.fill();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = z.color; ctx.lineWidth = 2.5; ctx.lineJoin = "round"; ctx.stroke();
    ctx.restore();
  }
}
// Middle of the zone along the horizontal line y (screen px), for the stretch that contains x; x if none.
function zoneMidX(pts, x, y) {
  const xs = [];
  pts.forEach(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) * (x2 - x1) / (y2 - y1));
  });
  xs.sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i] <= x && x <= xs[i + 1]) return (xs[i] + xs[i + 1]) / 2;
  return x;
}
// Zone labels sit at the area's centroid height, centred across the zone's width there (or just above
// the zone when labelPos is "above"), and always draw (placed before every other label).
// Their size comes from TEXT.zone, like every other label.
function drawZoneLabels() {
  for (const z of G.zones || []) {
    let a = 0, cx = 0, cy = 0;
    z.points.forEach(([x1, y1], i) => {
      const [x2, y2] = z.points[(i + 1) % z.points.length], f = x1 * y2 - x2 * y1;
      a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
    });
    const [x0, y] = toScreen(cx / (3 * a), cy / (3 * a));
    if (!onScreen(x0, y, 200)) continue;
    const pts = zoneOutline(z).map(([X, Y]) => toScreen(X, Y));
    const lines = size => z.label.map(t => ({ parts: [[t, "#fff"]], px: size, bold: true }));
    const size = textPx("zone");
    let box;
    if (z.labelPos === "above") {   // small zones: text block sits just above the top edge
      const top = Math.min(...pts.map(p => p[1])), h = textBox(lines(size), x0, 0, "center").h;
      box = textBox(lines(size), x0, top - 4 - h / 2, "center");
    } else {
      box = textBox(lines(size), zoneMidX(pts, x0, y), y, "center");
    }
    placed.push(box); drawText(box, true);
  }
}

// ---- Main draw ----
function draw() {
  if (!computeView()) return;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  placed = []; hits = [];
  const r = Math.min(9, 6 + view.k * 0.6);                            // icon radius grows slightly
  const vis = [];
  const campIcons = [];   // drawn last, on top of all text

  drawGrid();
  drawZones();
  if (layers.route) drawRouteLines();

  // Icons first (always drawn), labels afterwards in priority order.
  if (layers.crates) for (const c of G.crates) {
    const [x, y] = toScreen(c.X, c.Y); if (!onScreen(x, y)) continue;
    icon.square(x, y, r * 0.8, COLORS.crate);
    hits.push({ x, y, r: r + 4, tip: `<b>Building Material Crate</b><br><span class="muted">${esc(c.grid)}</span>` });
  }
  if (layers.caches) for (const c of G.caches) {
    const [x, y] = toScreen(c.X, c.Y); if (!onScreen(x, y)) continue;
    icon.square(x, y, r * 0.75, c.status === "not found" ? COLORS.cacheNotFound : COLORS.cache);
    hits.push({ x, y, r: r + 4, tip: `<b>Buried Cache</b> · tier ${esc(c.tier)}` +
      (c.tip ? `<br>${esc(c.tip)}` : c.status ? ` <span class="muted">(${esc(c.status)})</span>` : "") +
      `<br><span class="muted">${esc(c.grid)} · ${esc(c.area)}</span>` });
  }
  if (layers.toolboxes) for (const t of G.toolboxes) {
    const [x, y] = toScreen(t.X, t.Y); if (!onScreen(x, y)) continue;
    icon.spanner(x, y, r * 0.85, COLORS.toolbox);
    hits.push({ x, y, r: r + 4, tip: `<b>Tool Box</b><br><span class="muted">${esc(t.grid)} · ${esc(t.area)}</span>` });
  }
  if (layers.lzs) for (const l of G.lzs) {
    const [x, y] = toScreen(l.X, l.Y); if (!onScreen(x, y)) continue;
    icon.lz(x, y, r, lzOpen(l));
    hits.push({ x, y, r: r + 4, tip: `<b>LZ ${esc(l.name)}</b><br><span class="muted">${esc(l.grid)}${lzOpen(l) ? "" : " · other faction"}</span>` });
    vis.push(["lz", l, x, y]);
  }
  if (layers.cops) for (const c of G.cops) {
    const [x, y] = toScreen(c.X, c.Y); if (!onScreen(x, y)) continue;
    icon.triangle(x, y, r + 2, COLORS.cop);
    hits.push({ x, y, r: r + 5, tip: `<b>COP ${esc(c.name)}</b><br><span class="muted">${esc(c.grid)}</span>` });
    vis.push(["cop", c, x, y]);
  }
  if (layers.bases) for (const b of G.bases) {
    const [x, y] = toScreen(b.X, b.Y); if (!onScreen(x, y)) continue;
    icon.logo(x, y, BASE_LOGO(r), FACTIONS[b.faction]);
    hits.push({ x, y, r: BASE_LOGO(r) + 3, tip: `<b>${esc(FACTIONS[b.faction].name)}</b> · Operation Base<br><span class="muted">${esc(b.grid)}</span>` });
    vis.push(["base", b, x, y]);
  }
  if (layers.camps) for (const c of G.camps) {
    const [x, y] = toScreen(c.X, c.Y); if (!onScreen(x, y)) continue;
    const st = campStatus(c);
    campIcons.push([x, y, c, st]);
    hits.push({ x, y, r: r + 5, camp: c, tip: `<b>${esc(c.letter)}</b> · ${esc(c.type)} <span style="color:${esc(COLORS[st] || COLORS.unknown)}">(${esc(st)})</span>` +
      (STATUS_NOTE[st] ? `<br><span style="color:${esc(COLORS[st])}">${esc(STATUS_NOTE[st])}</span>` : "") +
      `<br><span class="muted">${esc(c.grid)} · ${esc(c.area)}</span>` });
    vis.push(["camp", c, x, y]);
  }

  if (layers.route) drawRouteMarks(textPx("route"));

  // Labels, highest priority first.
  drawZoneLabels();
  if (layers.locations) for (const L of G.locations) {
    const [x, y] = toScreen(L.X, L.Y); if (!onScreen(x, y, 200)) continue;
    label([{ parts: [[L.name.toUpperCase(), "#fff"]], px: textPx("region"), bold: true }], x, y, "center");
  }
  const order = { base: 0, camp: 1, cop: 2, lz: 3 };
  vis.sort((a, b) => order[a[0]] - order[b[0]]);
  for (const [kind, o, x, y] of vis) {
    const lx = x + r + 6;
    if (kind === "camp") {
      const st = campStatus(o);
      const line1 = { parts: [[o.letter + " ", "#fff"], [`(${st})`, COLORS[st]]], px: textPx("camp1"), bold: true };
      // Type and grid under the letter; "Trashed Campsite" goes over two lines ("Trashed" / "Campsite x,y").
      const words = o.type.split(" "), rest = words.length > 1 && words[0] === "Trashed" ? [words[0], words.slice(1).join(" ")] : [o.type];
      const more = rest.map((t, i) => ({ parts: [[i === rest.length - 1 ? `${t} ${o.grid}` : t, CAMP_TEXT[o.type]]], px: textPx("camp2"), bold: false }));
      label([line1, ...more], lx, y, "left", [line1]);
    } else if (kind === "base") {
      const f = FACTIONS[o.faction], gap = BASE_LOGO(r) + 3;   // name sits above or below the logo (J)
      label(f.name.split(" ").map(w => ({ parts: [[w, "#aaffc8"]], px: textPx("base"), bold: true })),
            x, f.labelPos === "below" ? y + gap : y - gap, f.labelPos);
    } else if (kind === "cop") {
      label([{ parts: [[o.name.toUpperCase(), "#f5f5f5"]], px: textPx("cop"), bold: true }], lx, y);   // the icon already says COP
    } else {
      label([{ parts: [[o.name.toUpperCase(), COLORS.lz]], px: textPx("lz"), bold: true }], lx, y);   // the icon already says LZ
    }
  }
  if (layers.route) drawDistances(textPx("distance"));
  for (const [x, y, c, st] of campIcons) {
    icon.circle(x, y, r, campColor(c.type));
    if (st !== "unknown") { ctx.lineWidth = 2.5; ctx.strokeStyle = COLORS[st]; ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke(); }
  }
  // J's pink lines (same pink as the stars), always shown. 1 px at every zoom, like the 100 m grid lines (J).
  for (const ln of G.lines || []) {
    const pts = ln.points.map(([X, Y]) => toScreen(X, Y));
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 1; ctx.strokeStyle = COLORS.star; ctx.stroke();
    const tip = `<b style="color:${COLORS.star}">${esc(ln.tip || "Marked line")}</b><br><span class="muted">${esc(ln.grid)}</span>`;
    for (let i = 1; i < pts.length; i++) hits.push({ x: pts[i][0], y: pts[i][1], seg: [...pts[i - 1], ...pts[i]], r: 6, tip });
  }
  // J's pink stars, always shown, on top of everything.
  for (const s of G.stars || []) {
    const [x, y] = toScreen(s.X, s.Y); if (!onScreen(x, y)) continue;
    icon.star(x, y);
    if (s.label) label([{ parts: [[s.label, COLORS.star]], px: textPx("camp1"), bold: true }], x + 12, y);
    hits.push({ x, y, r: 10, tip: `<b style="color:${COLORS.star}">★ ${esc(s.tip || s.label || "Marked spot")}</b><br><span class="muted">${esc(s.grid)}</span>` });
  }
}

// Distance labels: metres for each walking leg, at the leg's midpoint. Shown only where they fit.
function legLabel(a, b, metres, color, px) {
  const [ax, ay] = a, [bx, by] = b;
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  if (!onScreen(mx, my, 20)) return;
  const text = metres === null ? "heli" : `${Math.round(metres)} m`;
  ctx.font = `700 ${px}px "Segoe UI", sans-serif`;
  if (Math.hypot(bx - ax, by - ay) < ctx.measureText(text).width + 24) return;   // leg too short on screen
  label([{ parts: [[text, color]], px, bold: true }], mx, my, "center");
}
function drawDistances(px) {
  const steps = R().steps, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const runCol = r => RUN_COLORS[(r - 1) % RUN_COLORS.length];
  let prev = null;
  for (const st of steps) {
    if (!st.kind) continue;
    const here = [st.X, st.Y];
    if (st.arrive === "heli") {
      if (prev && st.from_lz_xy) {
        legLabel(toScreen(prev.X, prev.Y), toScreen(...st.from_lz_xy), d([prev.X, prev.Y], st.from_lz_xy), runCol(prev.run), px);
        legLabel(toScreen(...st.from_lz_xy), toScreen(...st.to_lz_xy), null, COLORS.heli, px);
      }
      if (st.to_lz_xy) legLabel(toScreen(...st.to_lz_xy), toScreen(...here), d(st.to_lz_xy, here), runCol(st.run), px);
    } else if (prev && !legNote(prev, st)) {
      legLabel(toScreen(prev.X, prev.Y), toScreen(...here), d([prev.X, prev.Y], here), runCol(st.run), px);
    }
    prev = st;
  }
  const end = steps[steps.length - 1];
  if (end.lz_xy && prev) legLabel(toScreen(prev.X, prev.Y), toScreen(...end.lz_xy), d([prev.X, prev.Y], end.lz_xy), runCol(prev.run), px);
}

let pending = false;
function redraw() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; draw(); }); } }
viewer.addHandler("update-viewport", redraw);

// Zoom readout in the mini-map's empty bottom band (inside the navigator, so it fades with it).
const zoomTag = document.createElement("div");
zoomTag.id = "zoomTag";
viewer.navigator.element.appendChild(zoomTag);
const showZoom = () => { zoomTag.textContent = `Zoom ${(viewer.viewport.getZoom(true) / viewer.viewport.getHomeZoom()).toFixed(1)}×`; };
viewer.addHandler("update-viewport", showZoom);
viewer.addHandler("open", showZoom);
viewer.addHandler("open", redraw);
addEventListener("resize", () => { sizeCanvas(); placeRuns(); redraw(); });
sizeCanvas();

// ---- Layer buttons ----
const SW = (inner) => `<svg width="14" height="14" viewBox="-7 -7 14 14">${inner}</svg>`;
const LAYER_DEFS = [
  ["locations", "Locations", SW(`<text x="0" y="4.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">A</text>`)],
  ["camps", "Campsites", SW(`<circle r="5" fill="${COLORS.campsite}" stroke="#000" stroke-width="1.5"/>`)],
  ["crates", "Material crates", SW(`<rect x="-4.5" y="-4.5" width="9" height="9" fill="${COLORS.crate}" stroke="#000" stroke-width="1.5"/>`)],
  ["caches", "Buried caches", SW(`<rect x="-4.5" y="-4.5" width="9" height="9" fill="${COLORS.cache}" stroke="#000" stroke-width="1.5"/>`)],
  ["toolboxes", "Tool boxes", SW(`<g transform="rotate(45)" fill="none" stroke-linecap="round"><path d="M1.9-5.1A2.9 2.9 0 1 1-1.9-5.1M0-.8V6.2" stroke="#000" stroke-width="4.6"/><path d="M1.9-5.1A2.9 2.9 0 1 1-1.9-5.1M0-.8V6.2" stroke="${COLORS.toolbox}" stroke-width="2.6"/></g>`)],
  ["lzs", "Landing zones", LZ_SVG],
  ["cops", "COPs", SW(`<path d="M0-6 6 5-6 5Z" fill="${COLORS.cop}" stroke="#000" stroke-width="1.5"/>`)],
  ["bases", "Bases", SW(`<rect x="-5" y="-5" width="10" height="10" fill="${COLORS.base}" stroke="#000" stroke-width="1.5"/>`)],
  ["route", `Loot route <span class="prealpha">PRE-<br>ALPHA</span>`, SW(`<path d="M-6 4 -1-2 2 2 6-5" fill="none" stroke="${RUN_COLORS[0]}" stroke-width="2.5"/>`)],
];
const layerBar = document.getElementById("layers");
for (const [key, name, svg] of LAYER_DEFS) {
  const b = document.createElement("button");
  b.innerHTML = svg + name; b.classList.toggle("on", layers[key]); b.dataset.layer = key;
  b.onclick = () => { layers[key] = !layers[key]; b.classList.toggle("on", layers[key]); save("gzw-layers", layers); updateRuns(); redraw(); };
  layerBar.appendChild(b);
}
// Faction picker, next to the Bases button.
const factionBox = document.createElement("label");
factionBox.id = "factionBox"; factionBox.title = "Your faction: its landing zones are shown normally, the others are dimmed";
factionBox.textContent = "Faction ";
const factionPick = document.createElement("select");
for (const [k, f] of Object.entries(FACTIONS)) factionPick.add(new Option(f.name, k));
factionPick.value = faction;
factionPick.onchange = () => { faction = factionPick.value; save("gzw-faction", faction); updateRuns(); redraw(); };
factionBox.appendChild(factionPick);
layerBar.insertBefore(factionBox, layerBar.querySelector("[data-layer=route]"));
const pick = document.createElement("select");
pick.id = "routePick";
for (const [m, r] of Object.entries(G.routes)) pick.add(new Option(`${r.name} (${r.summary.stops} stops, ${(r.summary.walk_m / 1000).toFixed(1)} km)`, m));
pick.value = routeMode;
pick.onchange = () => {
  routeMode = pick.value; save("gzw-route", routeMode);
  if (!layers.route) layerBar.querySelector("[data-layer=route]").click(); else { updateRuns(); redraw(); }
};
layerBar.appendChild(pick);

// About panel: full credits and disclaimer (the short version is the corner credit line).
const about = document.getElementById("about"), aboutBack = document.getElementById("aboutBack");
const showAbout = on => { about.style.display = aboutBack.style.display = on ? "block" : "none"; };
const aboutBtn = document.createElement("button");
// J's 16x16 pixel "i" icon ("#" = drawn in the button's text colour, "." = transparent).
const INFO_PIXELS = [
  "......####......",
  "....##....##....",
  "...#........#...",
  "..#....##....#..",
  ".#.....##.....#.",
  ".#............#.",
  "#......##......#",
  "#......##......#",
  "#......##......#",
  "#......##......#",
  ".#.....##.....#.",
  ".#.....##.....#.",
  "..#....##....#..",
  "...#........#...",
  "....##....##....",
  "......####......",
];
const INFO_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" shape-rendering="crispEdges" fill="currentColor">` +
  `<path d="${INFO_PIXELS.flatMap((row, y) => [...row].map((ch, x) => ch === "#" ? `M${x} ${y}h1v1h-1z` : "")).join("")}"/></svg>`;
aboutBtn.id = "aboutBtn"; aboutBtn.title = "About & credits"; aboutBtn.innerHTML = INFO_SVG + "About";
aboutBtn.onclick = () => showAbout(true);
layerBar.appendChild(aboutBtn);
aboutBack.onclick = about.querySelector(".close").onclick = () => showAbout(false);
for (const el of document.querySelectorAll(".updated")) el.textContent = G.updated || "—";

// Keep the run key just above the help box, whose height changes when it wraps.
function placeRuns() {
  document.getElementById("runs").style.bottom = (innerHeight - document.getElementById("help").getBoundingClientRect().top + 8) + "px";
}
function updateRuns() {
  const box = document.getElementById("runs");
  if (!layers.route) { box.style.display = "none"; return; }
  const runs = {};
  for (const st of R().steps) if (st.kind) { const r = runs[st.run] ||= { a: st.step, b: st.step, n: 0 }; r.b = st.step; r.n++; }
  const sm = R().summary;
  box.innerHTML = `<div><b>${esc(R().name)}</b>&nbsp;· ${esc(sm.stops)} stops · ${(sm.walk_m / 1000).toFixed(1)} km on foot</div>` +
    Object.entries(runs).map(([n, r]) =>
    `<div><i style="background:${RUN_COLORS[(n - 1) % RUN_COLORS.length]}"></i>Run ${n}: stops ${r.a}–${r.b}</div>`).join("") +
    `<div><i style="background:${COLORS.heli}"></i>Helicopter hop</div>` +
    (faction === "LRI" ? "" : `<div class="muted">Routes are planned with LRI landing zones</div>`);
  box.style.display = "block";
  placeRuns();
}
updateRuns();

// ---- Hover and coordinates (view-only: clicks never change data) ----
const coord = document.getElementById("coord"), tip = document.getElementById("tip");
// Distance from point (x, y) to the segment (ax, ay)-(bx, by).
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
function nearest(x, y) {
  let best = null, bd = Infinity;
  for (const h of hits) { const d = h.seg ? segDist(x, y, ...h.seg) : Math.hypot(h.x - x, h.y - y); if (d <= h.r && d < bd) { best = h; bd = d; } }
  return best;
}
// In-game grid at a screen point, to 1 m (truncated, so 197.99 is still in square 197); null when off the map.
function gridAt(sx, sy) {
  const ix = (sx - view.ax) / view.s, iy = (sy - view.ay) / view.s;
  const X = (ix - OX) * RES, Y = 8000 - (iy - OY) * RES;
  if (X < 0 || X >= 14000 || Y < 0 || Y >= 8000) return null;
  return `${(100 + Math.floor(X) / 100).toFixed(2)}, ${(100 + Math.floor(Y) / 100).toFixed(2)}`;
}

new OpenSeadragon.MouseTracker({
  element: viewer.container,
  moveHandler: e => {
    if (!view) return;
    coord.firstChild.nodeValue = gridAt(e.position.x, e.position.y) || "—";
    const h = nearest(e.position.x, e.position.y);
    if (h) { tip.innerHTML = h.tip; tip.style.display = "block"; tip.style.left = (e.position.x + 16) + "px"; tip.style.top = (e.position.y + 12) + "px"; }
    else tip.style.display = "none";
  },
  leaveHandler: () => { tip.style.display = "none"; },
}).setTracking(true);

// Right-click menu: copy the in-game coords under the cursor to the clipboard (reads only, changes nothing).
const ctxMenu = document.getElementById("ctx"), ctxCopy = document.getElementById("ctx-copy");
let ctxCoords = null;
const hideCtx = () => { ctxMenu.style.display = "none"; };
viewer.container.addEventListener("contextmenu", e => {
  e.preventDefault();
  const r = viewer.container.getBoundingClientRect();
  ctxCoords = view && gridAt(e.clientX - r.left, e.clientY - r.top);
  if (!ctxCoords) return hideCtx();
  ctxCopy.lastChild.textContent = ctxCoords;
  ctxCopy.firstChild.nodeValue = "Copy coords";
  ctxMenu.style.display = "block";
  ctxMenu.style.left = Math.min(e.clientX, innerWidth - ctxMenu.offsetWidth - 8) + "px";
  ctxMenu.style.top = Math.min(e.clientY, innerHeight - ctxMenu.offsetHeight - 8) + "px";
});
ctxCopy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(ctxCoords); }
  catch {   // fallback for browsers that block the async clipboard API
    const t = Object.assign(document.createElement("textarea"), { value: ctxCoords });
    document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
  }
  ctxCopy.firstChild.nodeValue = "Copied ✓";
  setTimeout(hideCtx, 600);
});
document.addEventListener("pointerdown", e => { if (!ctxMenu.contains(e.target)) hideCtx(); }, true);
viewer.addHandler("animation-start", hideCtx);

// Hand pointer while the left mouse button is held (capture phase, so the viewer's own handlers can't swallow it).
const lmbUp = () => document.documentElement.classList.remove("lmb-down");
document.addEventListener("pointerdown", e => { if (e.button === 0) document.documentElement.classList.add("lmb-down"); }, true);
for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, e => { if (e.button === 0 || e.buttons === 0) lmbUp(); }, true);
addEventListener("blur", lmbUp);

document.addEventListener("keydown", e => { if (e.target.closest("input, select, textarea")) return; if (e.key === "Escape") { hideCtx(); showAbout(false); } if (e.key === "0") viewer.viewport.goHome(); });
