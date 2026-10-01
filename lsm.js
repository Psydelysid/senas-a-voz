// Abecedario de la Lengua de Señas Mexicana (LSM).
//
// Referencia: «Manos con voz. Diccionario de Lengua de Señas Mexicana»
// (CONAPRED / Libre Acceso A.C.), abecedario en las páginas 15-19.
// Las descripciones están redactadas con palabras propias.
//
// Cada letra se define con un modelo 3D simplificado de la mano. El mismo modelo sirve para
// dibujar la letra (Voz → Señas, Abecedario) y como plantilla para reconocerla con la cámara.
//
// Coordenadas del modelo ("marco de la mano"): x hacia el meñique, y hacia la punta de los dedos,
// z hacia afuera de la palma (los dedos se doblan hacia +z). La distancia muñeca–nudillo del
// dedo medio mide 1. Los índices de los 21 puntos son los mismos que usa MediaPipe.

// ---------- Vectores ----------
const v = (x, y, z) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, k) => v(a.x * k, a.y * k, a.z * k);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => mul(a, 1 / (len(a) || 1e-9));
const mid = (a, b) => mul(add(a, b), 0.5);
const rad = (deg) => (deg * Math.PI) / 180;

// ---------- Esqueleto ----------
const MCP = [v(-0.36, 0.93, 0), v(-0.1, 0.98, 0), v(0.15, 0.93, 0), v(0.38, 0.82, 0)];
const BONES = [
  [0.42, 0.25, 0.2], // índice
  [0.47, 0.29, 0.21], // medio
  [0.44, 0.27, 0.2], // anular
  [0.34, 0.2, 0.18], // meñique
];
const THUMB_CMC = v(-0.3, 0.22, 0.12);
const THUMB_BONES = [0.42, 0.33, 0.27];
const FAN = [-6, -1, 4, 10]; // abertura natural de cada dedo (grados, + hacia el meñique)

// Posturas de dedo: [flexión del nudillo, de la articulación media, de la punta]
const EXT = [0, 0, 0];
const FIST = [80, 100, 55];
const NAILS = [55, 105, 60]; // puño mostrando las uñas
const CLAW = [20, 80, 60];
const DRAPE = [70, 70, 30]; // dedos sobre el pulgar (M, N)

// Objetivos del pulgar, en función de los puntos de los dedos ya colocados.
const T = {
  overFingers: (p) => add(mid(p[6], p[10]), v(0, -0.02, 0.14)), // S, I…: sobre los dedos
  overRing: (p) => add(mid(p[14], p[18]), v(-0.05, 0, 0.13)), // U, V, R: sobre anular y meñique
  overPinky: (p) => add(p[18], v(-0.08, 0, 0.12)), // W
  between: (p) => add(mid(p[5], p[9]), v(0, 0.12, 0.1)), // T: asoma entre índice y medio
  betweenUp: (p) => add(mid(p[6], p[10]), v(0, -0.02, 0.1)), // P, K: yema entre índice y medio
  side: (p) => add(p[5], v(-0.3, 0.22, 0.04)), // A: estirado a un lado, junto al índice
  out: (p) => add(THUMB_CMC, v(-0.95, 0.35, 0.05)), // L, G, Y: estirado hacia afuera
  up: (p) => add(THUMB_CMC, v(-0.55, 0.85, 0.05)), // H: apunta hacia arriba (antes de girar)
  palm: (p) => add(mid(p[9], p[13]), v(0, -0.2, 0.16)), // B: doblado sobre la palma
};

/**
 * Letras. `shape` define la mano; `orient` cómo se ve de frente; `motion` la animación
 * de las letras con movimiento. `base` indica qué forma estática las inicia.
 */
export const SHAPES = {
  A: { f: [NAILS, NAILS, NAILS, NAILS], thumb: T.side },
  B: { f: [EXT, EXT, EXT, EXT], spread: [-1, 0, 1, 2], thumb: T.palm },
  C: { f: [[35, 50, 30], [35, 50, 30], [35, 50, 30], [35, 50, 30]], spread: [-1, 0, 1, 2], thumb: (p) => add(p[8], v(-0.05, -0.55, -0.05)), hint: v(-1, 0, 0.3) },
  D: { f: [EXT, [50, 75, 40], [55, 75, 40], [60, 75, 40]], thumb: (p) => p[12] },
  E: { f: [[30, 110, 70], [30, 110, 70], [30, 110, 70], [30, 110, 70]], spread: [-1, 0, 1, 2], thumb: (p) => add(mid(p[10], p[14]), v(0, -0.2, 0.02)) },
  F: { f: [[75, 45, 20], EXT, EXT, EXT], spread: [-1, 0, 1, 2], thumb: (p) => add(p[7], v(-0.06, 0, 0.04)) },
  G: { f: [EXT, FIST, FIST, FIST], thumb: T.out },
  H: { f: [EXT, EXT, FIST, FIST], spread: [2, -2, 4, 10], thumb: T.up },
  I: { f: [FIST, FIST, FIST, EXT], thumb: T.overFingers },
  L: { f: [EXT, FIST, FIST, FIST], thumb: T.out },
  M: { f: [DRAPE, DRAPE, DRAPE, FIST], thumb: (p) => add(mid(p[13], p[17]), v(0, 0.08, 0.2)) },
  N: { f: [DRAPE, DRAPE, FIST, FIST], thumb: (p) => add(mid(p[9], p[13]), v(0, 0.08, 0.2)) },
  O: { f: [[40, 60, 30], [40, 60, 30], [40, 60, 30], [40, 60, 30]], spread: [6, 0, -6, -12], thumb: (p) => mid(p[8], p[12]), hint: v(-1, 0, 0.3) },
  P: { f: [EXT, [10, 0, 0], FIST, FIST], spread: [-6, 6, 4, 10], thumb: T.betweenUp },
  R: { f: [EXT, [8, 0, 0], FIST, FIST], spread: [14, -12, 4, 10], thumb: T.overRing },
  S: { f: [FIST, FIST, FIST, FIST], thumb: T.overFingers },
  T: { f: [FIST, FIST, FIST, FIST], thumb: T.between },
  U: { f: [EXT, EXT, FIST, FIST], spread: [2, -2, 4, 10], thumb: T.overRing },
  V: { f: [EXT, EXT, FIST, FIST], spread: [-12, 10, 4, 10], thumb: T.overRing },
  W: { f: [EXT, EXT, EXT, FIST], spread: [-12, 0, 12, 10], thumb: T.overPinky },
  Y: { f: [FIST, FIST, FIST, EXT], spread: [-6, -1, 4, 18], thumb: T.out },
  Z0: { f: [EXT, FIST, FIST, FIST], thumb: (p) => add(mid(p[10], p[14]), v(0, 0, 0.14)) }, // índice solo
  GARRA: { f: [CLAW, FIST, FIST, FIST], thumb: (p) => add(p[8], v(-0.08, -0.32, 0)), hint: v(-1, 0, 0.3) },
};

// Formas que no son letra: así el reconocedor no fuerza una letra con la mano relajada.
const NONE_SHAPES = [
  { f: [EXT, EXT, EXT, EXT], spread: [-14, -4, 8, 20], thumb: T.out }, // mano abierta
  { f: [[20, 25, 10], [20, 30, 10], [25, 30, 10], [25, 30, 10]], spread: [-10, -2, 6, 14], thumb: (p) => add(THUMB_CMC, v(-0.6, 0.5, 0.25)) }, // relajada
];

export const LETTERS = [
  { key: "A", shape: "A", orient: "frente", desc: "Puño cerrado con las uñas hacia el frente y el pulgar estirado a un lado. Palma al frente." },
  { key: "B", shape: "B", orient: "frente", desc: "Índice, medio, anular y meñique estirados y juntos; el pulgar doblado hacia la palma. Palma al frente." },
  { key: "C", shape: "C", orient: "lado", desc: "Los cuatro dedos juntos y curvados, y el pulgar también curvado, formando una C. Palma hacia un lado." },
  { key: "D", shape: "D", orient: "frente", desc: "Índice estirado; las puntas del medio, anular y meñique se juntan con la del pulgar. Palma al frente." },
  { key: "E", shape: "E", orient: "frente", desc: "Todos los dedos doblados por completo, dejando ver las uñas. Palma al frente." },
  { key: "F", shape: "F", orient: "lado", desc: "Mano abierta con los dedos juntos; el índice se dobla hasta que su costado toca la yema del pulgar. Palma hacia un lado." },
  { key: "G", shape: "G", orient: "adentroH", desc: "Mano cerrada con índice y pulgar estirados. Palma hacia quien hace la seña." },
  { key: "H", shape: "H", orient: "adentroH", desc: "Mano cerrada con índice y medio estirados y juntos, y el pulgar apuntando hacia arriba. Palma hacia quien hace la seña." },
  { key: "I", shape: "I", orient: "lado", desc: "Mano cerrada con el meñique estirado hacia arriba. Palma de lado." },
  { key: "J", shape: "I", orient: "lado", motion: "j", desc: "Como la I (meñique estirado, palma de lado) y se dibuja una J en el aire." },
  { key: "K", shape: "P", orient: "frente", motion: "up", desc: "Índice, medio y pulgar estirados, con la yema del pulgar entre índice y medio; la muñeca sube." },
  { key: "L", shape: "L", orient: "frente", desc: "Mano cerrada con índice y pulgar estirados formando una L. Palma al frente." },
  { key: "LL", shape: "L", orient: "frente", motion: "sides", desc: "Como la L, moviendo la mano de un lado a otro." },
  { key: "M", shape: "M", orient: "frente", desc: "Mano cerrada con índice, medio y anular puestos sobre el pulgar." },
  { key: "N", shape: "N", orient: "frente", desc: "Mano cerrada con índice y medio puestos sobre el pulgar." },
  { key: "Ñ", shape: "N", orient: "frente", motion: "twist", desc: "Como la N, girando la muñeca de un lado a otro." },
  { key: "O", shape: "O", orient: "lado", desc: "Todas las puntas de los dedos se tocan formando una O." },
  { key: "P", shape: "P", orient: "frente", desc: "Mano cerrada con índice, medio y pulgar estirados; la yema del pulgar va entre índice y medio." },
  { key: "Q", shape: "GARRA", orient: "abajo", motion: "twist", desc: "Índice y pulgar en forma de garra con la palma hacia abajo; la muñeca gira de un lado a otro." },
  { key: "R", shape: "R", orient: "frente", desc: "Mano cerrada con índice y medio estirados y cruzados. Palma al frente." },
  { key: "RR", shape: "R", orient: "frente", motion: "sides", desc: "Como la R, moviendo la mano de un lado a otro." },
  { key: "S", shape: "S", orient: "frente", desc: "Mano cerrada con el pulgar sobre los demás dedos. Palma al frente." },
  { key: "T", shape: "T", orient: "frente", desc: "Mano cerrada con el pulgar metido entre el índice y el medio. Palma al frente." },
  { key: "U", shape: "U", orient: "frente", desc: "Mano cerrada con índice y medio estirados y juntos. Palma al frente." },
  { key: "V", shape: "V", orient: "frente", desc: "Mano cerrada con índice y medio estirados y separados. Palma al frente." },
  { key: "W", shape: "W", orient: "frente", desc: "Mano cerrada con índice, medio y anular estirados y separados. Palma al frente." },
  { key: "X", shape: "GARRA", orient: "lado", motion: "forward", desc: "Índice y pulgar en forma de garra con la palma de lado; la mano va al frente y regresa." },
  { key: "Y", shape: "Y", orient: "adentro", desc: "Mano cerrada con meñique y pulgar estirados. Palma hacia quien hace la seña." },
  { key: "Z", shape: "Z0", orient: "frente", motion: "z", desc: "Mano cerrada con el índice estirado y la palma al frente; se dibuja una Z en el aire." },
];

export const LETTER_BY_KEY = Object.fromEntries(LETTERS.map((l) => [l.key, l]));

/** Forma estática → letra que se escribe al sostenerla (null si solo existe con movimiento). */
export const STATIC_LETTER = { Z0: null, GARRA: null };
for (const l of LETTERS) if (!l.motion) STATIC_LETTER[l.shape] = l.key;

/** Forma estática + movimiento → letra con movimiento. */
export function dynamicLetter(shape, palmEdgeOn) {
  if (shape === "GARRA") return palmEdgeOn ? "X" : "Q";
  return { L: "LL", R: "RR", N: "Ñ", I: "J", P: "K", Z0: "Z" }[shape] ?? null;
}

// ---------- Cinemática ----------
// Generador pseudoaleatorio determinista para las variaciones de las plantillas.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Puntos 3D de la mano (21) para una forma, con variación opcional. */
export function shapePoints(spec, jitter = 0, rand = Math.random) {
  const J = (k) => (rand() * 2 - 1) * k * jitter;
  const p = new Array(21);
  p[0] = v(0, 0, 0);
  for (let f = 0; f < 4; f++) {
    const [a, b, c] = spec.f[f];
    const s = rad((spec.spread ? spec.spread[f] : FAN[f]) + J(5));
    const d0 = v(Math.sin(s), Math.cos(s), 0);
    const flex = [a + J(10), b + J(12), c + J(10)];
    let pos = MCP[f];
    const base = 5 + f * 4;
    p[base] = pos;
    let theta = 0;
    for (let k = 0; k < 3; k++) {
      theta += rad(flex[k]);
      const dir = add(mul(d0, Math.cos(theta)), v(0, 0, Math.sin(theta)));
      pos = add(pos, mul(dir, BONES[f][k]));
      p[base + k + 1] = pos;
    }
  }
  // Pulgar: metacarpo orientado hacia el objetivo y luego IK de dos huesos.
  const target = add(spec.thumb(p), v(J(0.06), J(0.06), J(0.06)));
  p[1] = THUMB_CMC;
  const rest = norm(v(-0.55, 0.65, 0.5));
  const meta = norm(add(mul(rest, 0.6), mul(norm(sub(target, THUMB_CMC)), 0.4)));
  p[2] = add(THUMB_CMC, mul(meta, THUMB_BONES[0]));
  const [a, b] = [THUMB_BONES[1], THUMB_BONES[2]];
  const toT = sub(target, p[2]);
  const d = Math.min(Math.max(len(toT), Math.abs(a - b) + 1e-3), a + b - 1e-3);
  const u = norm(toT);
  const hint = spec.hint || v(-0.4, 0.2, 0.9);
  const n = norm(sub(hint, mul(u, dot(hint, u))));
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  p[3] = add(p[2], mul(add(mul(u, cosA), mul(n, sinA)), a));
  p[4] = add(p[3], mul(norm(sub(add(p[2], mul(u, d)), p[3])), b));
  return p;
}

// ---------- Rasgos para reconocer ----------
/**
 * Coordenadas de los 20 puntos en un marco ligado a la propia mano, escaladas por su tamaño.
 * No dependen de cómo esté girada la mano ni de su distancia a la cámara.
 */
export function shapeFeatures(pts) {
  const o = pts[0];
  const yv = sub(pts[9], o);
  const scale = len(yv) || 1e-6;
  const y = norm(yv);
  let x = sub(pts[17], pts[5]);
  x = norm(sub(x, mul(y, dot(x, y))));
  const z = cross(x, y);
  const out = [];
  for (let k = 1; k < 21; k++) {
    const d = sub(pts[k], o);
    out.push(dot(d, x) / scale, dot(d, y) / scale, dot(d, z) / scale);
  }
  return out;
}

/**
 * Distancia entre dos manos. Se compara también con la versión reflejada para que dé igual
 * usar la mano derecha o la izquierda.
 */
export function shapeDistance(a, b) {
  let s1 = 0;
  let s2 = 0;
  for (let k = 0; k < a.length; k += 3) {
    const dx = a[k] - b[k];
    const dy = a[k + 1] - b[k + 1];
    s1 += dx * dx + dy * dy + (a[k + 2] - b[k + 2]) ** 2;
    s2 += dx * dx + dy * dy + (a[k + 2] + b[k + 2]) ** 2;
  }
  return Math.sqrt(Math.min(s1, s2) / (a.length / 3));
}

// ---------- Orientación (vista de frente) ----------
// Del marco de la mano a la vista: X a la derecha, Y arriba, Z hacia quien mira.
// Con esta conversión la mano dibujada es una mano derecha con la palma al frente.
export const toView = (p) => v(-p.x, p.y, p.z);
const rotX = (p, a) => v(p.x, p.y * Math.cos(a) - p.z * Math.sin(a), p.y * Math.sin(a) + p.z * Math.cos(a));
const rotY = (p, a) => v(p.x * Math.cos(a) + p.z * Math.sin(a), p.y, -p.x * Math.sin(a) + p.z * Math.cos(a));
const rotZ = (p, a) => v(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a), p.z);

export const ORIENT = {
  frente: (p) => p,
  lado: (p) => rotY(p, rad(80)),
  adentro: (p) => rotY(p, rad(180)),
  adentroH: (p) => rotZ(rotY(p, rad(180)), rad(-90)),
  abajo: (p) => rotY(rotX(p, rad(70)), rad(-20)),
};

/** Dirección muñeca→dedos en la imagen de la cámara, como (|x|, y) unitario. */
export function orientFeature(dx, dy) {
  const l = Math.hypot(dx, dy) || 1e-6;
  return [Math.abs(dx) / l, dy / l];
}

// ---------- Plantillas ----------
let templates = null;

/** Plantillas sintéticas: varias variaciones de cada forma, con su orientación esperada. */
export function getTemplates() {
  if (templates) return templates;
  templates = [];
  const rand = rng(42);
  const orientOf = {};
  for (const l of LETTERS) orientOf[l.shape] ??= l.orient;
  const add1 = (label, spec, orient) => {
    for (let i = 0; i < 16; i++) {
      const pts = shapePoints(spec, i === 0 ? 0 : 1, rand);
      const dir = ORIENT[orient](toView(pts[9]));
      templates.push({
        label,
        f: shapeFeatures(pts),
        o: orient === "abajo" ? null : orientFeature(dir.x, -dir.y),
      });
    }
  };
  for (const [shape, spec] of Object.entries(SHAPES)) add1(shape, spec, orientOf[shape]);
  NONE_SHAPES.forEach((spec) => add1("NONE", spec, "frente"));
  return templates;
}

// ---------- Dibujo ----------
const MOTION = {
  j: (t) => {
    // trazo de la J visto de frente (quien firma la dibuja hacia su izquierda)
    if (t < 0.5) return { dx: 0, dy: -1.1 * (t / 0.5) };
    const a = ((t - 0.5) / 0.5) * Math.PI;
    return { dx: 0.4 - 0.4 * Math.cos(a), dy: -1.1 - 0.4 * Math.sin(a) };
  },
  z: (t) => {
    const pts = [[0.5, 0], [-0.5, 0], [0.5, -1], [-0.5, -1]];
    const seg = Math.min(2, Math.floor(t * 3));
    const k = t * 3 - seg;
    const [a, b] = [pts[seg], pts[seg + 1]];
    return { dx: a[0] + (b[0] - a[0]) * k, dy: a[1] + (b[1] - a[1]) * k + 0.5 };
  },
  sides: (t) => ({ dx: 0.4 * Math.sin(t * Math.PI * 4) }),
  twist: (t) => ({ yaw: 35 * Math.sin(t * Math.PI * 4) }),
  up: (t) => ({ dy: 0.6 * Math.sin(t * Math.PI), pitch: -25 * Math.sin(t * Math.PI) }),
  forward: (t) => ({ scale: 1 + 0.18 * Math.sin(t * Math.PI * 2) }),
};

const WIDTH = { thumb: 0.2, 1: 0.17, 2: 0.18, 3: 0.17, 4: 0.15 };
const FINGER_OF = (k) => (k <= 4 ? "thumb" : Math.ceil((k - 4) / 4));

/** Puntos de la letra en la vista (incluye antebrazo) para el instante t ∈ [0, 1). */
function viewPoints(letter, t = 0) {
  const spec = SHAPES[letter.shape];
  const m = letter.motion ? MOTION[letter.motion](t) : {};
  const local = shapePoints(spec, 0);
  local.push(v(0.05, -0.9, -0.05)); // antebrazo (índice 21)
  return local.map((p) => {
    let q = ORIENT[letter.orient](toView(p));
    if (m.yaw) q = rotY(q, rad(m.yaw));
    if (m.pitch) q = rotX(q, rad(m.pitch));
    q = rotX(rotY(q, rad(-18)), rad(12)); // leve vista de tres cuartos
    const s = m.scale || 1;
    return v(q.x * s + (m.dx || 0), q.y * s + (m.dy || 0), q.z * s);
  });
}

const boxCache = new Map();
function letterBox(letter) {
  if (!boxCache.has(letter.key)) {
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push(...viewPoints(letter, i / 12).slice(0, 21));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    boxCache.set(letter.key, {
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    });
  }
  return boxCache.get(letter.key);
}

/**
 * Dibuja una letra de la LSM en un canvas. `t` avanza la animación de las letras con
 * movimiento. `area` limita el dibujo a una parte del canvas.
 */
export function drawLetter(ctx, key, t = 0, area = null) {
  const letter = LETTER_BY_KEY[key];
  const { width: W, height: H } = ctx.canvas;
  const A = area || { x: 0, y: 0, w: W, h: H };
  ctx.clearRect(A.x, A.y, A.w, A.h);
  if (!letter) return;
  const box = letterBox(letter);
  const s = Math.min(A.w / (box.maxX - box.minX + 0.6), A.h / (box.maxY - box.minY + 0.6));
  const cx = A.x + A.w / 2 - ((box.minX + box.maxX) / 2) * s;
  const cy = A.y + A.h / 2 + ((box.minY + box.maxY) / 2) * s;
  const P = (p) => [cx + p.x * s, cy - p.y * s];
  const pts = viewPoints(letter, t);

  const dark = matchMedia?.("(prefers-color-scheme: dark)").matches;
  const outline = dark ? "#2a1a10" : "#7a4b32";
  const shade = (z) => {
    const k = Math.max(0, Math.min(1, 0.55 + z * 0.35));
    return `rgb(${Math.round(205 + 40 * k)}, ${Math.round(150 + 50 * k)}, ${Math.round(115 + 45 * k)})`;
  };

  const items = [];
  const seg = (a, b, w) => items.push({ z: (pts[a].z + pts[b].z) / 2, draw: () => capsule(pts[a], pts[b], w) });
  seg(21, 0, 0.5);
  items[0].z = -99; // el antebrazo siempre al fondo
  const palm = [0, 1, 5, 9, 13, 17];
  items.push({
    z: palm.reduce((acc, k) => acc + pts[k].z, 0) / palm.length,
    draw: () => polygon(palm.map((k) => pts[k])),
  });
  for (let k = 2; k < 21; k++) {
    if (k === 5 || k === 9 || k === 13 || k === 17) continue;
    seg(k - 1, k, WIDTH[FINGER_OF(k)]);
  }
  items.sort((a, b) => a.z - b.z);

  ctx.save();
  ctx.beginPath();
  ctx.rect(A.x, A.y, A.w, A.h); // el antebrazo no se sale del área
  ctx.clip();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const it of items) it.draw();
  ctx.restore();

  function capsule(a, b, w) {
    ctx.beginPath();
    ctx.moveTo(...P(a));
    ctx.lineTo(...P(b));
    ctx.strokeStyle = outline;
    ctx.lineWidth = w * s + 3;
    ctx.stroke();
    ctx.strokeStyle = shade((a.z + b.z) / 2);
    ctx.lineWidth = w * s;
    ctx.stroke();
  }
  function polygon(ps) {
    ctx.beginPath();
    ps.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
    ctx.closePath();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 0.16 * s + 3;
    ctx.stroke();
    const z = ps.reduce((acc, p) => acc + p.z, 0) / ps.length;
    ctx.fillStyle = shade(z);
    ctx.strokeStyle = shade(z);
    ctx.lineWidth = 0.16 * s;
    ctx.fill();
    ctx.stroke();
  }
}

/** Divide una palabra en letras de la LSM (reconoce LL, RR y Ñ). */
export function spellWord(word) {
  const out = [];
  const w = word.toUpperCase();
  for (let i = 0; i < w.length; i++) {
    const two = w.slice(i, i + 2);
    if (two === "LL" || two === "RR") {
      out.push(two);
      i++;
    } else {
      out.push(w[i]);
    }
  }
  return out;
}

// ---------- Clasificador ----------
const ORIENT_WEIGHT = 0.35;

/**
 * Forma más parecida (k vecinos) entre las plantillas y las muestras propias de calibración.
 * Devuelve { label, d } o null si nada se parece lo suficiente o gana «NONE».
 */
export function classifyShape(f, o, calibration = [], tolerance = 0.3) {
  const all = getTemplates().concat(calibration);
  const scored = all.map((t) => {
    let d = shapeDistance(f, t.f);
    if (o && t.o) d += ORIENT_WEIGHT * Math.hypot(o[0] - t.o[0], o[1] - t.o[1]);
    return { label: t.label, d };
  });
  scored.sort((a, b) => a.d - b.d);
  const top = scored.slice(0, 5);
  const votes = {};
  for (const c of top) votes[c.label] = (votes[c.label] || 0) + 1;
  const [label, count] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  const d = top.find((c) => c.label === label).d;
  if (count < 3 || d > tolerance || label === "NONE") return null;
  return { label, d };
}
