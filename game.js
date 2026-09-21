// KILNHEART — isometric clay-toy action RPG.
// Simulation is authoritative: contact events resolve damage, visuals only follow.
import * as T from 'three';
import {
  makeRenderer, makeScene, CameraRig, Input, Audio, Particles, Rings, contactShadow, autoQuality,
  PAL, clamp, lerp, rand, pick, angDiff, IS_TOUCH, LOW, REDUCED
} from './engine.js';
import {
  seeded, makeHero, makeHusk, makeShardling, makeBrute, makeKilnwright,
  makePot, makeGate, buildWorld, ZONES, CORRIDORS, insideWorld
} from './clay.js';

const Q = new URLSearchParams(location.search);
const DEBUG_ZONE = Q.has('zone') ? clamp(+Q.get('zone'), 0, 3) : 0;
const AUTOSTART = Q.has('go');
const NOMUSIC = Q.has('nomusic');

// ------------------------------------------------------------------ tuning
const P = {
  hpMax: 100, speed: 7.4, radius: 0.55, accel: 26,
  dash: { dur: 0.26, speed: 21, iframe: 0.2, cd: 0.75 },
  burst: { cost: 100, startup: 0.18, radius: 6, dmg: 34, stun: 1.8, kb: 13 }
};
const COMBO = [
  { startup: 0.09, active: 0.10, recovery: 0.17, dmg: 13, arc: 2.0, range: 2.5, kb: 5, lunge: 2.6 },
  { startup: 0.08, active: 0.10, recovery: 0.18, dmg: 15, arc: 2.2, range: 2.6, kb: 6, lunge: 2.8 },
  { startup: 0.16, active: 0.13, recovery: 0.32, dmg: 30, arc: 3.0, range: 3.1, kb: 14, lunge: 3.6, shock: true }
];
const EDEF = {
  husk: { hp: 46, speed: 3.5, radius: 0.6, mass: 1, score: 10, make: makeHusk, color: PAL.husk,
    atk: { tell: 0.5, active: 0.12, rec: 0.5, cd: 0.95, range: 2.2, dmg: 10, kb: 5 } },
  shardling: { hp: 30, speed: 3.2, radius: 0.5, mass: 0.7, score: 14, make: makeShardling, color: PAL.butter,
    ranged: true, keep: [7, 11], atk: { tell: 0.66, active: 0.05, rec: 0.45, cd: 1.9, range: 18, dmg: 9 } },
  brute: { hp: 155, speed: 2.2, radius: 1.05, mass: 3, score: 40, make: makeBrute, color: PAL.brick,
    atk: { tell: 0.9, active: 0.16, rec: 0.75, cd: 2.4, range: 3.4, dmg: 22, kb: 13, slam: 4.6 } },
  boss: { hp: 900, speed: 2.5, radius: 2.7, mass: 12, score: 400, make: makeKilnwright, color: 0xa8624a,
    boss: true, atk: { tell: 1.0, active: 0.18, rec: 0.8, cd: 2.6, range: 6.0, dmg: 26, kb: 16, slam: 8.0 } }
};
const UPGRADES = [
  { ico: '🧱', t: 'Thicker Clay', d: '+30 maximum body, and you are patched up right now.', ap: s => { s.hpMax += 30; s.hp = s.hpMax; } },
  { ico: '🔨', t: 'Heavy Head', d: 'The mallet hits 25% harder.', ap: s => s.dmgMul *= 1.25 },
  { ico: '👟', t: 'Quick Feet', d: 'You move 15% faster.', ap: s => s.speedMul *= 1.15 },
  { ico: '🌀', t: 'Springy Legs', d: 'Dash recovers 35% sooner.', ap: s => s.dashCdMul *= 0.65 },
  { ico: '📏', t: 'Long Handle', d: 'Mallet reach and swing arc +25%.', ap: s => s.rangeMul *= 1.25 },
  { ico: '💥', t: 'Hungry Kiln', d: 'Kiln charge builds 60% faster, burst is 20% wider.', ap: s => { s.chargeMul *= 1.6; s.burstMul *= 1.2; } }
];

// ------------------------------------------------------------------ boot
const canvas = document.getElementById('c');
const renderer = makeRenderer(canvas);
const { scene, key } = makeScene();
const rig = new CameraRig();
const input = new Input(rig);
const audio = new Audio();
const fx = new Particles(scene);
const rings = new Rings(scene);
const rng = seeded(20260725);
const world = buildWorld(scene, rng);
const quality = autoQuality(renderer, key);

const ui = {
  hp: document.getElementById('hpFill'), ch: document.getElementById('chFill'),
  kills: document.getElementById('kills'), zone: document.getElementById('zoneName'),
  sub: document.getElementById('zoneSub'), toast: document.getElementById('toast'),
  hurt: document.getElementById('hurt'), fps: document.getElementById('fps'),
  dash: document.getElementById('skDash'), burst: document.getElementById('skBurst'),
  tBurst: document.getElementById('tBurst'),
  title: document.getElementById('title'), pause: document.getElementById('pause'),
  over: document.getElementById('over'), overTitle: document.getElementById('overTitle'),
  overText: document.getElementById('overText'), pauseInfo: document.getElementById('pauseInfo'),
  cards: document.getElementById('cards'), cardRow: document.getElementById('cardRow'),
  cardTitle: document.getElementById('cardTitle')
};

const G = {
  state: 'title', time: 0, kills: 0, zone: DEBUG_ZONE, wave: -1,
  enemies: [], shots: [], drops: [], pots: [], gates: [], spawnQueue: [],
  hitstop: 0, waveTimer: 0, intensity: 0, toastT: 0, cleared: false
};

// ------------------------------------------------------------------ player
const hero = makeHero();
scene.add(hero.root);
const player = {
  x: ZONES[G.zone].x, z: ZONES[G.zone].z + 8, vx: 0, vz: 0, face: 0,
  hp: P.hpMax, hpMax: P.hpMax, charge: 0,
  dmgMul: 1, speedMul: 1, dashCdMul: 1, rangeMul: 1, chargeMul: 1, burstMul: 1,
  atk: null, step: 0, comboT: 0, queued: false,
  dashT: 0, dashCd: 0, iframe: 0, burstT: 0, hurtCd: 0, dead: false,
  walk: 0, bob: 0, squash: 1
};

function resetToZone(z) {
  G.zone = z; G.wave = -1; G.waveTimer = 0.6; G.cleared = false;
  player.x = ZONES[z].x; player.z = ZONES[z].z + (z === 3 ? 16 : 8);
  rig.snap(player.x, player.z);
  ui.zone.textContent = ZONES[z].name; ui.sub.textContent = ZONES[z].sub;
}

// walking into the next platter is what advances the run, not a teleport
function enterZone(z) {
  G.zone = z; G.wave = -1; G.waveTimer = 1.0; G.cleared = false;
  ui.zone.textContent = ZONES[z].name; ui.sub.textContent = ZONES[z].sub;
  toast(`${ZONES[z].name} — ${ZONES[z].sub}`, 2.4);
  audio.sfx('levelup');
}

// gates seal each corridor until its zone is cleared
const openGates = CORRIDORS.map((c, i) => i < DEBUG_ZONE);
CORRIDORS.forEach((c, i) => {
  const g = makeGate();
  g.root.position.set(c.gate.x, 0, c.gate.z);
  g.root.rotation.y = c.gate.rot;
  if (openGates[i]) g.root.visible = false;
  scene.add(g.root);
  G.gates.push(g);
});

// breakable pots scattered in the first two zones
for (const zn of ZONES) {
  for (let i = 0; i < (zn.id === 3 ? 6 : 7); i++) { // pots in the boss arena are the only healing in there
    const a = rng() * Math.PI * 2, d = zn.r * (0.25 + rng() * 0.55);
    const m = makePot(0.9 + rng() * 0.4);
    m.position.set(zn.x + Math.cos(a) * d, 0, zn.z + Math.sin(a) * d);
    scene.add(m);
    G.pots.push({ m, x: m.position.x, z: m.position.z, hp: 1 });
  }
}

// ------------------------------------------------------------------ helpers
function toast(msg, secs = 2.2) { ui.toast.textContent = msg; ui.toast.classList.add('on'); G.toastT = secs; }

function moveCircle(e, nx, nz, r) {
  // axis-separated so sliding along a wall feels right
  let x = e.x, z = e.z;
  if (insideWorld(nx, z, openGates) && !blocked(nx, z, r)) x = nx;
  if (insideWorld(x, nz, openGates) && !blocked(x, nz, r)) z = nz;
  e.x = x; e.z = z;
}
function blocked(x, z, r) {
  for (const p of world.props) {
    const dx = x - p.x, dz = z - p.z, rr = p.r + r;
    if (dx * dx + dz * dz < rr * rr) return true;
  }
  return false;
}
function inArc(ex, ez, er, fromX, fromZ, face, range, arc) {
  const dx = ex - fromX, dz = ez - fromZ;
  const d = Math.hypot(dx, dz);
  if (d > range + er) return false;
  if (d < 0.001) return true;
  return Math.abs(angDiff(Math.atan2(dx, dz), face)) < arc / 2;
}

function spawnEnemy(type, x, z) {
  const def = EDEF[type];
  const m = def.make(rng);
  m.root.position.set(x, 0, z);
  const scale0 = m.root.scale.x; // the Kilnwright ships pre-scaled, everything else is 1
  m.root.scale.setScalar(0.01);
  scene.add(m.root);
  const e = {
    type, def, model: m, scale0, x, z, vx: 0, vz: 0, face: 0, hp: def.hp, hpMax: def.hp,
    state: 'rise', t: 0, cd: rand(0.2, 0.9), flash: 0, stun: 0, walk: 0, squash: 1,
    phase: 1, summonT: 8, burstT: 6, dead: false
  };
  G.enemies.push(e);
  fx.burst(x, 0.3, z, 14, { color: PAL.groundDark, speed: 5, size: 0.26, ttl: 0.6 });
  rings.spawn(x, z, 0.4, def.radius * 2.4, 0.5, 0xbba07f, 0.5);
  return e;
}

function startWave() {
  const zn = ZONES[G.zone];
  G.wave++;
  if (G.wave >= zn.waves.length) { clearZone(); return; }
  const list = zn.waves[G.wave];
  let delay = 0;
  for (const [type, count] of list) {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, d = zn.r * (0.45 + rng() * 0.4);
      const at = type === 'boss' ? { x: zn.x, z: zn.z } // the Kilnwright rises in the middle of its bed
        : { x: zn.x + Math.cos(a) * d, z: zn.z + Math.sin(a) * d };
      G.spawnQueue.push({ type, x: at.x, z: at.z, t: delay });
      delay += 0.16;
    }
  }
  if (zn.waves[G.wave][0][0] === 'boss') { toast('THE KILNWRIGHT WAKES', 3); audio.sfx('boss'); rig.kick(1.2); }
  else toast(`${zn.name} — wave ${G.wave + 1} of ${zn.waves.length}`, 1.6);
}

function clearZone() {
  if (G.zone === 3) { win(); return; }
  G.cleared = true;
  const gi = G.zone;
  if (G.gates[gi] && !openGates[gi]) {
    openGates[gi] = true;
    const g = G.gates[gi];
    const p = g.root.position;
    fx.burst(p.x, 1.4, p.z, 46, { color: 0x8f6a56, speed: 11, size: 0.42, ttl: 1.3, spread: 3 });
    rings.spawn(p.x, p.z, 1, 9, 0.7, 0xffd9a0, 0.8);
    g.root.visible = false;
    audio.sfx('gate'); rig.kick(0.7);
  }
  offerCards();
}

function offerCards() {
  G.state = 'cards';
  const opts = [];
  const bag = UPGRADES.slice();
  while (opts.length < 3 && bag.length) opts.push(bag.splice((rng() * bag.length) | 0, 1)[0]);
  ui.cardRow.innerHTML = '';
  ui.cardTitle.textContent = `ZONE CLEAR — SHAPE YOURSELF`;
  for (const u of opts) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="ico">${u.ico}</div><div class="t">${u.t}</div><div class="d">${u.d}</div>`;
    el.onclick = () => {
      u.ap(player);
      player.hp = Math.min(player.hp + 20, player.hpMax);
      ui.cards.classList.remove('on');
      audio.sfx('levelup');
      G.state = 'play';
      toast('the gate is open, walk on through', 3);
    };
    ui.cardRow.appendChild(el);
  }
  ui.cards.classList.add('on');
  audio.sfx('levelup');
}

function drop(x, z, kind = 'clay') {
  const m = new T.Mesh(new T.SphereGeometry(0.28, 10, 8),
    new T.MeshStandardMaterial({ color: PAL.rose, roughness: 0.95, emissive: 0x3a1a14, emissiveIntensity: 0.3 }));
  m.castShadow = true; m.position.set(x, 0.5, z);
  const sh = contactShadow(0.4); sh.position.set(x, 0.02, z); scene.add(sh);
  scene.add(m);
  G.drops.push({ m, sh, x, z, t: 0, kind });
}

// ------------------------------------------------------------------ combat
function damageEnemy(e, dmg, kbX, kbZ, kb) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.12;
  player.charge = Math.min(P.burst.cost, player.charge + dmg * 0.5 * player.chargeMul);
  const d = Math.hypot(kbX, kbZ) || 1;
  e.vx += (kbX / d) * kb / (e.def.mass || 1);
  e.vz += (kbZ / d) * kb / (e.def.mass || 1);
  fx.burst(e.x, 1.0, e.z, 8, { color: e.def.color, speed: 6, size: 0.2, ttl: 0.55 });
  if (e.hp <= 0) killEnemy(e);
  else if (e.state === 'wind' && dmg >= 25) { e.state = 'idle'; e.t = 0; e.cd = 0.5; } // heavy hits interrupt telegraphs
}

function killEnemy(e) {
  e.dead = true;
  G.kills++;
  ui.kills.textContent = G.kills;
  fx.burst(e.x, 1.0, e.z, e.def.boss ? 90 : 26, { color: e.def.color, speed: e.def.boss ? 14 : 9, size: e.def.boss ? 0.5 : 0.3, ttl: 1.2, spread: e.def.boss ? 3 : 1.2 });
  rings.spawn(e.x, e.z, 0.6, e.def.boss ? 14 : 3.4, 0.6, 0xffd9a0, 0.7);
  scene.remove(e.model.root);
  audio.sfx('break');
  rig.kick(e.def.boss ? 1.5 : 0.28);
  G.hitstop = e.def.boss ? 0.2 : 0.05;
  if (e.def.boss) { setTimeout(win, 900); return; }
  const roll = rng();
  if (e.type === 'brute') { drop(e.x + 0.8, e.z); drop(e.x - 0.8, e.z); }
  else if (roll < 0.34) drop(e.x, e.z);
}

function hurtPlayer(dmg, fromX, fromZ, kb = 0) {
  if (player.dead || player.iframe > 0 || player.hurtCd > 0) return;
  player.hp -= dmg;
  player.hurtCd = 0.45;
  player.charge = Math.min(P.burst.cost, player.charge + 12 * player.chargeMul);
  const dx = player.x - fromX, dz = player.z - fromZ, d = Math.hypot(dx, dz) || 1;
  player.vx += dx / d * kb; player.vz += dz / d * kb;
  fx.burst(player.x, 1.1, player.z, 12, { color: PAL.skin, speed: 6, size: 0.22, ttl: 0.6 });
  ui.hurt.style.opacity = Math.min(0.9, 0.35 + dmg / 40);
  setTimeout(() => ui.hurt.style.opacity = 0, 160);
  audio.sfx('hurt'); rig.kick(0.5); G.hitstop = 0.06;
  if (player.hp <= 0) { player.hp = 0; lose(); }
}

function playerAttack() {
  const a = COMBO[player.step];
  player.atk = { def: a, t: 0, hits: new Set() };
  player.queued = false;
  audio.sfx('swing');
}

function resolveSwing() {
  const a = player.atk.def;
  const range = a.range * player.rangeMul, arc = Math.min(Math.PI * 1.6, a.arc * player.rangeMul);
  let hit = false;
  for (const e of G.enemies) {
    if (e.dead || player.atk.hits.has(e)) continue;
    if (inArc(e.x, e.z, e.def.radius, player.x, player.z, player.face, range, arc)) {
      player.atk.hits.add(e);
      damageEnemy(e, a.dmg * player.dmgMul, e.x - player.x, e.z - player.z, a.kb);
      hit = true;
    }
  }
  for (const p of G.pots) {
    if (p.hp <= 0) continue;
    if (inArc(p.x, p.z, 0.5, player.x, player.z, player.face, range, arc)) {
      p.hp = 0; p.m.visible = false;
      fx.burst(p.x, 0.6, p.z, 18, { color: 0xd8b48c, speed: 7, size: 0.22, ttl: 0.8 });
      audio.sfx('break');
      if (rng() < 0.5) drop(p.x, p.z);
    }
  }
  if (hit) {
    audio.sfx(a.shock ? 'heavy' : 'hit');
    rig.kick(a.shock ? 0.6 : 0.22);
    G.hitstop = a.shock ? 0.09 : 0.045;
    if (a.shock) rings.spawn(player.x + Math.sin(player.face) * 1.6, player.z + Math.cos(player.face) * 1.6, 0.5, 4.5, 0.35, 0xfff0d0, 0.7);
  }
}

function doBurst() {
  const r = P.burst.radius * player.burstMul;
  player.charge = 0;
  player.burstT = P.burst.startup + 0.25;
  rings.spawn(player.x, player.z, 0.5, r * 2, 0.55, 0x8fb8d6, 0.85);
  fx.burst(player.x, 0.6, player.z, 40, { color: PAL.cloth, speed: 12, size: 0.3, ttl: 0.9, spread: 1.6 });
  audio.sfx('burst'); rig.kick(0.9); G.hitstop = 0.08;
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - player.x, dz = e.z - player.z;
    if (dx * dx + dz * dz < r * r) {
      damageEnemy(e, P.burst.dmg * player.dmgMul, dx, dz, P.burst.kb);
      if (!e.dead) { e.stun = P.burst.stun; e.state = 'stun'; e.t = 0; }
    }
  }
  for (const p of G.pots) {
    if (p.hp <= 0) continue;
    const dx = p.x - player.x, dz = p.z - player.z;
    if (dx * dx + dz * dz < r * r) { p.hp = 0; p.m.visible = false; fx.burst(p.x, 0.6, p.z, 14, { color: 0xd8b48c, speed: 7, size: 0.22, ttl: 0.7 }); }
  }
}

function shootShard(e, tx, tz) {
  const m = new T.Mesh(new T.ConeGeometry(0.18, 0.6, 7),
    new T.MeshStandardMaterial({ color: PAL.ember, emissive: PAL.ember, emissiveIntensity: 1.1, roughness: 1 }));
  m.castShadow = true;
  const y = e.def.boss ? 2.0 : 1.1;
  m.position.set(e.x, y, e.z);
  scene.add(m);
  const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
  G.shots.push({ m, x: e.x, y, z: e.z, vx: dx / d * 13, vz: dz / d * 13, life: 2.6, dmg: e.def.atk.dmg });
  audio.sfx('dash');
}

// ------------------------------------------------------------------ updates
function updatePlayer(dt) {
  const mv = input.moveVector(new T.Vector2());
  const aim = input.aimPoint(player);

  // face: aim on desktop, movement on touch
  const wantFace = (!input.usingTouch)
    ? Math.atan2(aim.x - player.x, aim.z - player.z)
    : (mv.lengthSq() > 0.01 ? Math.atan2(mv.x, mv.y) : player.face);
  if (player.dashT <= 0) player.face = wantFace;

  // input intents
  if (input.consume('attack') || (input.attackHeld && !player.atk && player.burstT <= 0)) {
    if (!player.atk && player.dashT <= 0 && player.burstT <= 0) playerAttack();
    else if (player.atk) player.queued = true;
  }
  if (input.consume('dash') && player.dashCd <= 0 && player.burstT <= 0) {
    player.dashT = P.dash.dur; player.iframe = P.dash.iframe;
    player.dashCd = P.dash.cd * player.dashCdMul;
    player.atk = null;
    const d = mv.lengthSq() > 0.01 ? Math.atan2(mv.x, mv.y) : player.face;
    player.dashDir = d;
    fx.burst(player.x, 0.4, player.z, 12, { color: PAL.path, speed: 4, size: 0.24, ttl: 0.5, up: 0.4 });
    audio.sfx('dash');
  }
  if (input.consume('burst') && player.charge >= P.burst.cost && player.burstT <= 0 && player.dashT <= 0) {
    player.atk = null; doBurst();
  }

  player.dashCd = Math.max(0, player.dashCd - dt);
  player.iframe = Math.max(0, player.iframe - dt);
  player.hurtCd = Math.max(0, player.hurtCd - dt);
  player.burstT = Math.max(0, player.burstT - dt);

  // motion
  let sx = 0, sz = 0;
  if (player.dashT > 0) {
    player.dashT -= dt;
    sx = Math.sin(player.dashDir) * P.dash.speed;
    sz = Math.cos(player.dashDir) * P.dash.speed;
    if (!REDUCED && Math.random() < 0.6) fx.burst(player.x, 0.35, player.z, 2, { color: PAL.path, speed: 1.6, size: 0.2, ttl: 0.4, up: 0.3 });
  } else if (player.atk) {
    const a = player.atk.def, t = player.atk.t;
    if (t < a.startup) { const k = 1 - t / a.startup; sx = Math.sin(player.face) * a.lunge * k; sz = Math.cos(player.face) * a.lunge * k; }
  } else if (player.burstT <= 0) {
    const sp = P.speed * player.speedMul;
    sx = mv.x * sp; sz = mv.y * sp;
  }
  const k = 1 - Math.pow(0.0001, dt);
  player.vx = lerp(player.vx, sx, player.dashT > 0 ? 1 : k);
  player.vz = lerp(player.vz, sz, player.dashT > 0 ? 1 : k);
  moveCircle(player, player.x + player.vx * dt, player.z + player.vz * dt, P.radius);

  // attack state machine
  if (player.atk) {
    const a = player.atk.def;
    const prev = player.atk.t;
    player.atk.t += dt;
    const t = player.atk.t;
    if (prev < a.startup && t >= a.startup) resolveSwing();
    else if (t >= a.startup && t < a.startup + a.active) resolveSwing();
    if (t >= a.startup + a.active + a.recovery) {
      const wasLast = player.step >= COMBO.length - 1;
      player.atk = null;
      if (player.queued && !wasLast) { player.step++; player.comboT = 0.7; playerAttack(); }
      else { player.step = 0; player.comboT = 0; }
    } else if (player.queued && t >= a.startup + a.active && player.step < COMBO.length - 1) {
      player.step++; player.comboT = 0.7; playerAttack();
    }
  } else {
    player.comboT = Math.max(0, player.comboT - dt);
    if (player.comboT <= 0) player.step = 0;
  }

  // pickups
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i];
    d.t += dt;
    d.m.position.y = 0.5 + Math.sin(d.t * 3.4) * 0.12;
    d.m.rotation.y += dt * 2;
    const dx = player.x - d.x, dz = player.z - d.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.4) { d.x += dx / dist * dt * 7; d.z += dz / dist * dt * 7; d.m.position.x = d.x; d.m.position.z = d.z; d.sh.position.set(d.x, 0.02, d.z); }
    if (dist < 0.9) {
      player.hp = Math.min(player.hpMax, player.hp + 14);
      scene.remove(d.m); scene.remove(d.sh); G.drops.splice(i, 1);
      audio.sfx('pick');
      fx.burst(d.x, 0.7, d.z, 8, { color: PAL.rose, speed: 4, size: 0.16, ttl: 0.5 });
    }
  }
  animateHero(dt, mv.lengthSq() > 0.01);
}

function animateHero(dt, moving) {
  const p = hero.parts, r = hero.root;
  r.position.set(player.x, 0, player.z);
  const speed = Math.hypot(player.vx, player.vz);
  player.walk += dt * (2.5 + speed * 1.5);
  const w = moving ? Math.sin(player.walk * 3.4) : 0;
  p.legL.rotation.x = w * 0.7; p.legR.rotation.x = -w * 0.7;
  p.armL.rotation.x = -w * 0.5;
  r.rotation.y = player.face;

  // body bob and squash
  const target = player.dashT > 0 ? 0.78 : 1;
  player.squash = lerp(player.squash, target, 1 - Math.pow(0.001, dt));
  r.scale.set(1 / Math.sqrt(player.squash), player.squash, 1 / Math.sqrt(player.squash));
  r.position.y = moving ? Math.abs(Math.sin(player.walk * 3.4)) * 0.08 : Math.sin(player.walk * 0.9) * 0.03;
  p.head.rotation.z = Math.sin(player.walk * 1.7) * 0.05;

  // mallet swing drives off the attack clock, never the other way round
  let arm = 0.2;
  if (player.atk) {
    const a = player.atk.def, t = player.atk.t;
    if (t < a.startup) arm = lerp(0.2, -2.5, t / a.startup);
    else if (t < a.startup + a.active) arm = lerp(-2.5, 1.5, (t - a.startup) / a.active);
    else arm = lerp(1.5, 0.2, clamp((t - a.startup - a.active) / a.recovery, 0, 1));
  } else if (player.burstT > 0) arm = -1.8;
  p.armR.rotation.x = arm;
  p.armR.rotation.z = player.atk ? Math.sin(player.atk.t * 8) * 0.15 : 0;
}

function updateEnemy(e, dt) {
  const d = e.def, m = e.model;
  const dx = player.x - e.x, dz = player.z - e.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  e.flash = Math.max(0, e.flash - dt);
  e.t += dt;

  if (e.state === 'rise') {
    const k = Math.min(1, e.t / 0.5);
    m.root.scale.setScalar(e.scale0 * k * (1 + Math.sin(k * Math.PI) * 0.18));
    if (k >= 1) { e.state = 'idle'; e.t = 0; m.root.scale.setScalar(e.scale0); }
  } else if (e.state === 'stun') {
    e.stun -= dt;
    if (e.stun <= 0) { e.state = 'idle'; e.t = 0; e.cd = 0.4; }
  } else if (e.state === 'idle') {
    e.cd -= dt;
    let want = 0, wx = 0, wz = 0;
    if (d.ranged) {
      const [near, far] = d.keep;
      if (dist < near) { wx = -dx / dist; wz = -dz / dist; want = d.speed * 1.1; }
      else if (dist > far) { wx = dx / dist; wz = dz / dist; want = d.speed; }
      else { wx = -dz / dist; wz = dx / dist; want = d.speed * 0.5; } // strafe
      if (e.cd <= 0 && dist < d.atk.range && dist > 2) { e.state = 'wind'; e.t = 0; }
    } else {
      wx = dx / dist; wz = dz / dist; want = d.speed;
      if (dist < d.atk.range * 0.92 && e.cd <= 0) { e.state = 'wind'; e.t = 0; }
    }
    e.vx = lerp(e.vx, wx * want, 1 - Math.pow(0.02, dt));
    e.vz = lerp(e.vz, wz * want, 1 - Math.pow(0.02, dt));
    if (want > 0) e.face = Math.atan2(dx, dz);
  } else if (e.state === 'wind') {
    e.vx *= 0.86; e.vz *= 0.86;
    e.face = lerp(e.face, e.face + angDiff(Math.atan2(dx, dz), e.face), 1 - Math.pow(0.06, dt));
    if (e.t === dt || (e.t < dt * 2 && d.atk.slam)) {
      if (d.atk.slam) rings.spawn(e.x, e.z, 0.5, d.atk.slam, d.atk.tell, PAL.ember, 0.55);
    }
    if (e.t >= d.atk.tell) {
      e.state = 'strike'; e.t = 0; e.hitDone = false;
      if (d.ranged) shootShard(e, player.x, player.z);
    }
  } else if (e.state === 'strike') {
    e.vx *= 0.7; e.vz *= 0.7;
    if (!e.hitDone && e.t >= d.atk.active * 0.4 && !d.ranged) {
      e.hitDone = true;
      if (d.atk.slam) {
        rings.spawn(e.x, e.z, 0.5, d.atk.slam, 0.35, 0xfff0d0, 0.9);
        fx.burst(e.x, 0.3, e.z, 26, { color: PAL.path, speed: 9, size: 0.3, ttl: 0.8, spread: 2, up: 0.6 });
        rig.kick(0.45); audio.sfx('heavy');
        if (dist < d.atk.slam) hurtPlayer(d.atk.dmg, e.x, e.z, d.atk.kb);
      } else {
        audio.sfx('swing');
        if (dist < d.atk.range + 0.5 && Math.abs(angDiff(Math.atan2(dx, dz), e.face)) < 1.1)
          hurtPlayer(d.atk.dmg, e.x, e.z, d.atk.kb);
      }
    }
    if (e.t >= d.atk.active + d.atk.rec) { e.state = 'idle'; e.t = 0; e.cd = d.atk.cd * (e.phase === 3 ? 0.6 : 1); }
  }

  // boss extras
  if (d.boss && e.state !== 'rise') {
    const frac = e.hp / e.hpMax;
    const ph = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (ph !== e.phase) {
      e.phase = ph; e.state = 'idle'; e.t = 0; e.cd = 1.2;
      toast(ph === 2 ? 'THE KILN OPENS ITS SIDE' : 'THE KILN ROARS', 2);
      audio.sfx('boss'); rig.kick(1);
      fx.burst(e.x, 2.4, e.z, 50, { color: PAL.ember, speed: 12, size: 0.4, ttl: 1.1, spread: 2.4 });
      rings.spawn(e.x, e.z, 1, 18, 0.8, PAL.ember, 0.7);
      for (const en of G.enemies) if (en !== e && !en.dead) { en.stun = 1; en.state = 'stun'; }
    }
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = ph === 3 ? 9 : 13;
      const n = ph === 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        spawnEnemy('husk', e.x + Math.cos(a) * 7, e.z + Math.sin(a) * 7);
      }
      toast('it spits out more husks', 1.4);
    }
    if (ph >= 2) {
      e.burstT -= dt;
      if (e.burstT <= 0) {
        e.burstT = ph === 3 ? 5.5 : 8;
        const n = ph === 3 ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          shootShard(e, e.x + Math.cos(a) * 10, e.z + Math.sin(a) * 10);
        }
      }
    }
  }

  // separation so the horde does not stack into one point
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const ox = e.x - o.x, oz = e.z - o.z, r = e.def.radius + o.def.radius;
    const dd = Math.hypot(ox, oz);
    if (dd < r && dd > 0.001) { const push = (r - dd) / r * 9; e.vx += ox / dd * push * dt * 8; e.vz += oz / dd * push * dt * 8; }
  }

  moveCircle(e, e.x + e.vx * dt, e.z + e.vz * dt, d.radius * 0.6);
  e.vx *= Math.pow(0.08, dt); e.vz *= Math.pow(0.08, dt);

  // body contact damage from the boss and brutes while walking
  if ((d.boss || e.type === 'brute') && dist < d.radius + 0.7 && e.state === 'idle')
    hurtPlayer(6, e.x, e.z, 8);

  animateEnemy(e, dt);
}

function animateEnemy(e, dt) {
  const p = e.model.parts, r = e.model.root, d = e.def;
  r.position.set(e.x, 0, e.z);
  r.rotation.y = e.face;
  const sp = Math.hypot(e.vx, e.vz);
  e.walk += dt * (2 + sp * 2);
  const w = sp > 0.4 ? Math.sin(e.walk * 3.2) : 0;
  if (p.legL) { p.legL.rotation.x = w * 0.6; p.legR.rotation.x = -w * 0.6; }
  if (e.state !== 'rise') r.position.y = Math.abs(Math.sin(e.walk * 3.2)) * (sp > 0.4 ? 0.06 : 0) ;

  let arm = 0;
  if (e.state === 'wind') {
    const k = clamp(e.t / d.atk.tell, 0, 1);
    arm = lerp(0, -2.2, k);
    r.position.y += Math.sin(e.t * 40) * 0.02 * k; // shiver on telegraph
  } else if (e.state === 'strike') {
    arm = lerp(-2.2, 1.2, clamp(e.t / (d.atk.active || 0.1), 0, 1));
  } else if (e.state === 'stun') {
    arm = 0.6; r.rotation.z = Math.sin(e.t * 12) * 0.12;
  } else r.rotation.z = 0;
  if (p.armL) { p.armL.rotation.x = arm; p.armR.rotation.x = arm; }

  // ember glow pulses harder while winding up, that IS the tell
  const glowBase = e.state === 'wind' ? 1.6 + Math.sin(e.t * 22) * 1.2 : 1.1;
  if (p.glow) for (const g of p.glow) g.material.emissiveIntensity = glowBase + (e.flash > 0 ? 2 : 0);
  if (e.flash > 0) { const s = 1 + e.flash * 1.4; r.scale.set(e.scale0 * s, e.scale0 / s, e.scale0 * s); }
  else if (e.state !== 'rise') r.scale.setScalar(e.scale0);
}

function updateShots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    s.life -= dt;
    s.x += s.vx * dt; s.z += s.vz * dt;
    s.m.position.set(s.x, s.y, s.z);
    s.m.rotation.set(Math.PI / 2, 0, -Math.atan2(s.vz, s.vx) + Math.PI / 2);
    s.m.rotation.z += 0;
    const dx = player.x - s.x, dz = player.z - s.z;
    if (dx * dx + dz * dz < 0.85) {
      hurtPlayer(s.dmg, s.x, s.z, 5);
      fx.burst(s.x, s.y, s.z, 10, { color: PAL.ember, speed: 6, size: 0.18, ttl: 0.5 });
      scene.remove(s.m); G.shots.splice(i, 1); continue;
    }
    if (s.life <= 0 || !insideWorld(s.x, s.z, openGates)) {
      fx.burst(s.x, s.y, s.z, 6, { color: PAL.ember, speed: 4, size: 0.16, ttl: 0.4 });
      scene.remove(s.m); G.shots.splice(i, 1);
    }
  }
}

function updateWaves(dt) {
  for (let i = G.spawnQueue.length - 1; i >= 0; i--) {
    const s = G.spawnQueue[i];
    s.t -= dt;
    if (s.t <= 0) { spawnEnemy(s.type, s.x, s.z); G.spawnQueue.splice(i, 1); }
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].dead) G.enemies.splice(i, 1);
  if (G.state !== 'play') return;
  if (G.cleared) { // waiting for the player to walk into the next zone
    const nz = ZONES[G.zone + 1];
    if (nz) {
      const dx = player.x - nz.x, dz = player.z - nz.z;
      if (dx * dx + dz * dz < (nz.r - 1) * (nz.r - 1)) enterZone(G.zone + 1);
    }
    return;
  }
  if (G.enemies.length === 0 && G.spawnQueue.length === 0) {
    G.waveTimer -= dt;
    if (G.waveTimer <= 0) { G.waveTimer = 1.4; startWave(); }
  }
}

// ------------------------------------------------------------------ states
function win() {
  if (G.state === 'over') return;
  G.state = 'over';
  saveBest();
  ui.overTitle.textContent = 'THE KILN GOES COLD';
  ui.overText.textContent = `You put the Kilnwright back in the ground. ${G.kills} husks smashed in ${fmt(G.time)}. The clay is soft again.`;
  ui.over.classList.remove('hide');
  audio.sfx('win');
}
function lose() {
  if (G.state === 'over') return;
  player.dead = true;
  G.state = 'over';
  saveBest();
  fx.burst(player.x, 1, player.z, 44, { color: PAL.skin, speed: 10, size: 0.34, ttl: 1.2, spread: 1.6 });
  hero.root.visible = false;
  ui.overTitle.textContent = 'CRACKED';
  ui.overText.textContent = `${ZONES[G.zone].name} got you. ${G.kills} husks smashed in ${fmt(G.time)}.` + bestLine();
  ui.over.classList.remove('hide');
  audio.sfx('lose');
}
function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function saveBest() {
  try {
    const prev = JSON.parse(localStorage.getItem('kilnheart.best') || '{}');
    if (!prev.kills || G.kills > prev.kills) localStorage.setItem('kilnheart.best', JSON.stringify({ kills: G.kills, zone: G.zone, time: Math.round(G.time) }));
  } catch { /* private mode, no save, no crash */ }
}
function bestLine() {
  try {
    const b = JSON.parse(localStorage.getItem('kilnheart.best') || '{}');
    return b.kills ? ` Your best is ${b.kills}.` : '';
  } catch { return ''; }
}

function start() {
  audio.unlock();
  ui.title.classList.add('hide');
  resetToZone(DEBUG_ZONE);
  G.state = 'play';
  G.time = 0;
  toast(`${ZONES[G.zone].name} — ${ZONES[G.zone].sub}`, 2.4);
}
function togglePause(force) {
  if (G.state === 'play' || force === false) {
    if (G.state !== 'play') return;
    G.state = 'pause';
    ui.pauseInfo.textContent = `${ZONES[G.zone].name} · ${G.kills} smashed · ${fmt(G.time)}`;
    ui.pause.classList.remove('hide');
  } else if (G.state === 'pause') {
    G.state = 'play'; ui.pause.classList.add('hide');
  }
}
input.onPause = () => togglePause();

document.getElementById('tPause').onclick = () => togglePause();
document.getElementById('playBtn').onclick = start;
document.getElementById('resumeBtn').onclick = () => togglePause();
document.getElementById('quitBtn').onclick = () => { location.href = location.pathname; };
document.getElementById('againBtn').onclick = () => { location.href = location.pathname + '?go=1'; };

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { ui.fps.textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
  if (G.state === 'play') quality(dt);

  if (G.state === 'play') {
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.12; }
    G.time += dt;
    updatePlayer(dt);
    for (const e of G.enemies) if (!e.dead) updateEnemy(e, dt);
    updateShots(dt);
    updateWaves(dt);
  }

  fx.update(dt);
  rings.update(dt);

  const aim = input.aim;
  rig.follow(player.x, player.z, aim.x, aim.z, dt);
  key.position.set(player.x + 24, 42, player.z + 18);
  key.target.position.set(player.x, 0, player.z);
  key.target.updateMatrixWorld();

  // HUD
  ui.hp.style.width = `${clamp(player.hp / player.hpMax * 100, 0, 100)}%`;
  ui.ch.style.width = `${clamp(player.charge / P.burst.cost * 100, 0, 100)}%`;
  ui.dash.querySelector('.cd').style.transform = `scaleY(${clamp(player.dashCd / (P.dash.cd * player.dashCdMul), 0, 1)})`;
  const bready = player.charge >= P.burst.cost;
  ui.burst.classList.toggle('ready', bready);
  ui.dash.classList.toggle('ready', player.dashCd <= 0);
  ui.burst.querySelector('.cd').style.transform = `scaleY(${bready ? 0 : 1 - player.charge / P.burst.cost})`;
  if (IS_TOUCH) ui.tBurst.classList.toggle('off', !bready);
  if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) ui.toast.classList.remove('on'); }

  if (!NOMUSIC && G.state === 'play') {
    G.intensity = lerp(G.intensity, Math.min(1, G.enemies.length / 6 + (G.zone === 3 ? 0.5 : 0)), dt);
    audio.music(G.intensity);
  }

  renderer.render(scene, rig.cam);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  rig.resize();
});

rig.snap(player.x, player.z);
ui.zone.textContent = ZONES[G.zone].name;
ui.sub.textContent = ZONES[G.zone].sub;
requestAnimationFrame(frame);
if (AUTOSTART || Q.has('zone')) start();

// review hooks for automated QA (see test-playable-web-games)
window.KILNHEART = {
  G, player, ZONES, start, togglePause, fx, rig,
  project: (x, z) => { const v = new T.Vector3(x, 1, z).project(rig.cam); return { x: (v.x + 1) / 2 * innerWidth, y: (-v.y + 1) / 2 * innerHeight }; },
  liveParticles: () => fx.p.filter(p => p.life > 0).length,
  state: () => ({ state: G.state, zone: G.zone, wave: G.wave, enemies: G.enemies.length, hp: player.hp, kills: G.kills, charge: player.charge }),
  hurt: n => hurtPlayer(n, player.x + 2, player.z, 0),
  spawn: (t, dx = 3, dz = 0) => spawnEnemy(t, player.x + dx, player.z + dz),
  giveCharge: () => { player.charge = P.burst.cost; },
  killAll: () => { for (const e of G.enemies) if (!e.dead) killEnemy(e); }
};
