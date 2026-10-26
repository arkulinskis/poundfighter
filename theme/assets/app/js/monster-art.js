// Procedural monster portraits. Each monster's look is generated from its id,
// so it's always the same monster, with no image files needed.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seeded(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => n.toFixed(1);

function smoothClosed(p) {
  const n = p.length;
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

function sparkle(x, y, s, fill) {
  return `<path d="M${x},${y - s} Q${x},${y} ${x + s},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s},${y} Q${x},${y} ${x},${y - s}Z" fill="${fill}"/>`;
}

let uid = 0;

export function monsterSVG(monster, { className = '' } = {}) {
  const r = seeded(monster.id);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const range = (a, b) => a + r() * (b - a);
  const id = `pf${uid++}`;
  const { rarity, habitat } = monster;
  const fancy = rarity === 'epic' || rarity === 'legendary';

  const hue = Math.floor(r() * 360);
  const sat = Math.round(range(55, 80));
  const body = `hsl(${hue} ${sat}% 58%)`;
  const dark = `hsl(${hue} ${sat}% 34%)`;
  const light = `hsl(${hue} ${sat}% 76%)`;
  const accentHue = (hue + pick([140, 180, 210])) % 360;
  const accent = `hsl(${accentHue} 80% 62%)`;
  const ink = '#1d1412';

  const cx = 100, cy = 120;
  const rx = range(50, 64), ry = range(46, 58);
  const n = 8 + Math.floor(r() * 4);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const j = i === 0 ? range(0.95, 1.08) : range(0.88, 1.1);
    let y = cy + Math.sin(a) * ry * j;
    if (Math.sin(a) > 0.7) y = Math.min(y, cy + ry * 0.96); // flatter bottom so it sits
    pts.push([cx + Math.cos(a) * rx * j, y]);
  }
  const top = pts[0][1];
  const bodyPath = smoothClosed(pts);

  const parts = [];
  const defs = [];

  defs.push(`<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${body}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`);
  defs.push(`<clipPath id="${id}c"><path d="${bodyPath}"/></clipPath>`);

  // Aura for fancy monsters
  if (fancy) {
    const auraCol = rarity === 'legendary' ? '#ffc531' : '#b46bff';
    defs.push(`<radialGradient id="${id}a"><stop offset=".35" stop-color="${auraCol}" stop-opacity=".55"/><stop offset="1" stop-color="${auraCol}" stop-opacity="0"/></radialGradient>`);
    parts.push(`<circle cx="${cx}" cy="${cy - 6}" r="96" fill="url(#${id}a)" class="aura"/>`);
  }

  // Ground shadow
  parts.push(`<ellipse cx="${cx}" cy="${f(cy + ry + 8)}" rx="${f(rx * 0.9)}" ry="7" fill="#000" opacity=".25"/>`);

  // Head accessory decides what top feature can show
  const accessoryRoll = r();
  let accessory = null;
  if (rarity === 'legendary') accessory = 'crown';
  else if (accessoryRoll < 0.5) accessory = { bedroom: 'nightcap', office: 'tie', lounge: 'headphones' }[habitat];

  const topFeature = accessory === 'nightcap' || accessory === 'crown' ? pick(['none', 'ears']) : pick(['horns', 'antenna', 'ears', 'tuft', 'none', 'horns']);

  // Top features drawn behind the body
  if (topFeature === 'horns') {
    const bone = 'hsl(40 45% 88%)';
    for (const s of [-1, 1]) {
      const bx = cx + s * rx * 0.38;
      parts.push(`<path d="M${f(bx - 9)},${f(top + 14)} Q${f(bx + s * 4)},${f(top - 10)} ${f(bx + s * 16)},${f(top - 22)} Q${f(bx + s * 8)},${f(top + 2)} ${f(bx + 9)},${f(top + 16)}Z" fill="${bone}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    }
  } else if (topFeature === 'antenna') {
    const tx = cx + range(-14, 14);
    parts.push(`<path d="M${cx},${f(top + 6)} Q${f(cx + (tx - cx) * 0.3)},${f(top - 14)} ${f(tx)},${f(top - 26)}" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${f(tx)}" cy="${f(top - 28)}" r="6.5" fill="${accent}" stroke="${ink}" stroke-width="2.5"/>`);
  } else if (topFeature === 'ears') {
    for (const s of [-1, 1]) {
      const ex = cx + s * rx * 0.55;
      parts.push(`<path d="M${f(ex - 14)},${f(top + 22)} L${f(ex + s * 10)},${f(top - 16)} L${f(ex + 14)},${f(top + 20)}Z" fill="${body}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
      parts.push(`<path d="M${f(ex - 6)},${f(top + 18)} L${f(ex + s * 8)},${f(top - 6)} L${f(ex + 7)},${f(top + 17)}Z" fill="${light}"/>`);
    }
  }

  // Arms: little raised fists, ready to fight
  const armUp = r() < 0.6;
  for (const s of [-1, 1]) {
    const ax = cx + s * (rx + 4);
    const ay = armUp ? cy - 14 : cy + 12;
    parts.push(`<path d="M${f(cx + s * rx * 0.8)},${f(cy + 4)} Q${f(ax + s * 2)},${f(cy)} ${f(ax)},${f(ay)}" stroke="${dark}" stroke-width="9" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${f(ax)}" cy="${f(ay)}" r="10" fill="${body}" stroke="${ink}" stroke-width="2.5"/>`);
  }

  // Feet
  for (const s of [-1, 1]) {
    parts.push(`<ellipse cx="${f(cx + s * rx * 0.42)}" cy="${f(cy + ry * 0.94)}" rx="15" ry="9" fill="${dark}" stroke="${ink}" stroke-width="2.5"/>`);
  }

  // Body
  parts.push(`<path d="${bodyPath}" fill="url(#${id}g)" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/>`);

  // Spots + belly, clipped to body
  const inner = [];
  const spots = 2 + Math.floor(r() * 4);
  for (let i = 0; i < spots; i++) {
    inner.push(`<circle cx="${f(cx + range(-rx, rx))}" cy="${f(cy + range(-ry, ry * 0.2))}" r="${f(range(4, 10))}" fill="${dark}" opacity=".3"/>`);
  }
  if (r() < 0.75) inner.push(`<ellipse cx="${cx}" cy="${f(cy + ry * 0.55)}" rx="${f(rx * 0.55)}" ry="${f(ry * 0.5)}" fill="${light}" opacity=".75"/>`);
  parts.push(`<g clip-path="url(#${id}c)">${inner.join('')}</g>`);
  if (topFeature === 'tuft') {
    parts.push(`<path d="M${f(cx - 16)},${f(top + 6)} l5,-18 l5,14 l6,-20 l6,20 l5,-14 l5,18Z" fill="${dark}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
  }

  // Eyes
  const eyeCount = pick([1, 2, 2, 2, 3]);
  const eyeY = cy - ry * 0.22;
  const eyes =
    eyeCount === 1 ? [[cx, eyeY, 17]] :
    eyeCount === 2 ? [[cx - rx * 0.33, eyeY, range(10, 14)], [cx + rx * 0.33, eyeY, range(10, 14)]] :
    [[cx - rx * 0.4, eyeY + 2, 9], [cx, eyeY - 8, 11], [cx + rx * 0.4, eyeY + 2, 9]];
  const lookX = range(-0.35, 0.35), lookY = range(-0.2, 0.3);
  const sleepy = habitat === 'bedroom' && rarity !== 'legendary' && r() < 0.65;
  for (const [ex, ey, er] of eyes) {
    parts.push(`<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(er)}" fill="#fff" stroke="${ink}" stroke-width="2.5"/>`);
    parts.push(`<circle cx="${f(ex + lookX * er)}" cy="${f(ey + lookY * er)}" r="${f(er * 0.5)}" fill="${ink}"/>`);
    parts.push(`<circle cx="${f(ex + lookX * er - er * 0.18)}" cy="${f(ey + lookY * er - er * 0.2)}" r="${f(er * 0.16)}" fill="#fff"/>`);
    if (sleepy) {
      parts.push(`<path d="M${f(ex - er - 1)},${f(ey)} A${f(er + 1)},${f(er + 1)} 0 0 1 ${f(ex + er + 1)},${f(ey)} Z" fill="${body}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    }
  }
  if (fancy || r() < 0.25) {
    // Angry brows
    const [lx, ly, lr] = eyes[0];
    const [qx, qy, qr] = eyes[eyes.length - 1];
    if (eyeCount === 1) {
      parts.push(`<path d="M${f(lx - lr)},${f(ly - lr - 8)} L${f(lx)},${f(ly - lr - 2)} L${f(lx + lr)},${f(ly - lr - 8)}" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else {
      parts.push(`<path d="M${f(lx - lr)},${f(ly - lr - 9)} L${f(lx + lr * 0.8)},${f(ly - lr - 2)}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`);
      parts.push(`<path d="M${f(qx + qr)},${f(qy - qr - 9)} L${f(qx - qr * 0.8)},${f(qy - qr - 2)}" stroke="${ink}" stroke-width="4" stroke-linecap="round"/>`);
    }
  }

  // Glasses for some office monsters
  if (habitat === 'office' && eyeCount === 2 && accessory !== 'tie' && r() < 0.7) {
    const [[ax, ay, ar], [bx, by, br]] = eyes;
    parts.push(`<g fill="none" stroke="${ink}" stroke-width="3"><circle cx="${f(ax)}" cy="${f(ay)}" r="${f(ar + 5)}"/><circle cx="${f(bx)}" cy="${f(by)}" r="${f(br + 5)}"/><path d="M${f(ax + ar + 5)},${f(ay)} L${f(bx - br - 5)},${f(by)}"/></g>`);
  }

  // Mouth
  const my = cy + ry * 0.18;
  const mw = range(14, 24);
  const mouth = pick(['grin', 'fangs', 'o', 'wavy', 'grin', 'fangs']);
  if (mouth === 'grin') {
    parts.push(`<path d="M${f(cx - mw)},${f(my)} Q${cx},${f(my + mw * 1.1)} ${f(cx + mw)},${f(my)}Z" fill="${ink}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    const teeth = [];
    for (let i = 0; i < 4; i++) {
      const tx = cx - mw * 0.75 + (i * mw * 1.5) / 3;
      teeth.push(`<path d="M${f(tx - 4)},${f(my)} L${f(tx)},${f(my + 6)} L${f(tx + 4)},${f(my)}Z" fill="#fff"/>`);
    }
    parts.push(teeth.join(''));
  } else if (mouth === 'fangs') {
    parts.push(`<path d="M${f(cx - mw)},${f(my)} Q${cx},${f(my + 12)} ${f(cx + mw)},${f(my)}" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`);
    for (const s of [-1, 1]) parts.push(`<path d="M${f(cx + s * mw * 0.45 - 4)},${f(my + 4)} L${f(cx + s * mw * 0.45)},${f(my + 13)} L${f(cx + s * mw * 0.45 + 4)},${f(my + 4)}Z" fill="#fff" stroke="${ink}" stroke-width="1.5" stroke-linejoin="round"/>`);
  } else if (mouth === 'o') {
    parts.push(`<ellipse cx="${cx}" cy="${f(my + 6)}" rx="${f(mw * 0.5)}" ry="${f(mw * 0.6)}" fill="${ink}"/>`);
    parts.push(`<ellipse cx="${cx}" cy="${f(my + 6 + mw * 0.3)}" rx="${f(mw * 0.3)}" ry="${f(mw * 0.22)}" fill="#e2566b"/>`);
  } else {
    let d = `M${f(cx - mw)},${f(my + 4)}`;
    for (let i = 1; i <= 6; i++) d += ` L${f(cx - mw + (i * 2 * mw) / 6)},${f(my + (i % 2 ? -2 : 6))}`;
    parts.push(`<path d="${d}" stroke="${ink}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  // Habitat accessories
  if (accessory === 'nightcap') {
    const capCol = `hsl(${accentHue} 60% 55%)`;
    parts.push(`<path d="M${f(cx - rx * 0.62)},${f(top + 16)} Q${f(cx - 8)},${f(top - 34)} ${f(cx + rx * 0.95)},${f(top - 8)} Q${f(cx + 20)},${f(top - 4)} ${f(cx + rx * 0.62)},${f(top + 16)}Z" fill="${capCol}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    parts.push(`<path d="M${f(cx - rx * 0.66)},${f(top + 18)} Q${cx},${f(top + 4)} ${f(cx + rx * 0.66)},${f(top + 18)}" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${f(cx + rx * 0.98)}" cy="${f(top - 6)}" r="7" fill="#fff" stroke="${ink}" stroke-width="2.5"/>`);
    parts.push(`<text x="${f(cx + rx + 6)}" y="${f(top - 22)}" font-family="Bungee, sans-serif" font-size="14" fill="${light}">z</text>`);
  } else if (accessory === 'tie') {
    const ty = cy + ry * 0.42;
    const tieCol = `hsl(${accentHue} 70% 50%)`;
    parts.push(`<path d="M${cx - 7},${f(ty)} L${cx + 7},${f(ty)} L${cx + 4},${f(ty + 7)} L${cx + 10},${f(ty + 30)} L${cx},${f(ty + 38)} L${cx - 10},${f(ty + 30)} L${cx - 4},${f(ty + 7)}Z" fill="${tieCol}" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>`);
  } else if (accessory === 'headphones') {
    parts.push(`<path d="M${f(cx - rx * 0.92)},${f(cy - ry * 0.25)} Q${cx},${f(top - 38)} ${f(cx + rx * 0.92)},${f(cy - ry * 0.25)}" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>`);
    for (const s of [-1, 1]) parts.push(`<rect x="${f(cx + s * rx * 0.92 - 8)}" y="${f(cy - ry * 0.25 - 6)}" width="16" height="24" rx="7" fill="${accent}" stroke="${ink}" stroke-width="2.5"/>`);
  } else if (accessory === 'crown') {
    const cw = 26, cyy = top - 4;
    parts.push(`<path d="M${cx - cw},${f(cyy + 6)} L${cx - cw - 4},${f(cyy - 20)} L${cx - cw / 2},${f(cyy - 6)} L${cx},${f(cyy - 26)} L${cx + cw / 2},${f(cyy - 6)} L${cx + cw + 4},${f(cyy - 20)} L${cx + cw},${f(cyy + 6)}Z" fill="#ffc531" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
    parts.push(`<circle cx="${cx}" cy="${f(cyy - 4)}" r="4" fill="#e2566b" stroke="${ink}" stroke-width="1.5"/>`);
    parts.push(sparkle(30, 46, 9, '#ffe27a') + sparkle(170, 64, 7, '#ffe27a') + sparkle(160, 24, 5, '#fff'));
  }

  return `<svg class="monster-svg ${className}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
}
