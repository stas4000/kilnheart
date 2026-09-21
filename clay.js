// KILNHEART content: procedural clay-toy models + the deterministic level layout.
// Every shape is rounded, matte and thick. No textures, no sharp edges, no glare.
import * as T from 'three';
import { PAL, clayMat, contactShadow, LOW } from './engine.js?v=20260921';

export function seeded(seed) { // mulberry32, so the world is the same every run
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const SEG = LOW ? 10 : 16;
const ball = (r, m) => new T.Mesh(new T.SphereGeometry(r, SEG, Math.max(6, SEG * 0.7)), m);
const cap = (r, len, m) => new T.Mesh(new T.CapsuleGeometry(r, len, 3, SEG), m);
const cyl = (rt, rb, h, m) => new T.Mesh(new T.CylinderGeometry(rt, rb, h, SEG), m);

function castAll(root) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return root;
}

// ------------------------------------------------------------------ player
export function makeHero() {
  const g = new T.Group();
  const skin = clayMat(PAL.skin), cloth = clayMat(PAL.cloth), dark = clayMat(0x4a3b33), wood = clayMat(PAL.wood);
  const cream = clayMat(PAL.cream);

  const body = cap(0.42, 0.42, cloth); body.position.y = 0.86; body.scale.set(1, 1, 0.86);
  const hips = ball(0.34, cloth); hips.position.y = 0.62;

  const headPivot = new T.Group(); headPivot.position.y = 1.34;
  const head = ball(0.52, skin); head.scale.set(1, 0.96, 0.94);
  const hair = ball(0.53, clayMat(0x6d4c3c)); hair.scale.set(1, 0.62, 1); hair.position.y = 0.2;
  const eyeL = ball(0.075, dark), eyeR = ball(0.075, dark);
  eyeL.position.set(-0.17, 0.02, 0.47); eyeR.position.set(0.17, 0.02, 0.47);
  const cheekL = ball(0.1, clayMat(PAL.rose)); cheekL.position.set(-0.3, -0.12, 0.4); cheekL.scale.set(1, .7, .5);
  const cheekR = cheekL.clone(); cheekR.position.x = 0.3;
  headPivot.add(head, hair, eyeL, eyeR, cheekL, cheekR);

  const scarf = new T.Mesh(new T.TorusGeometry(0.34, 0.13, 8, SEG), cloth);
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.06;
  const tail = cap(0.1, 0.5, cloth); tail.position.set(0, 0.95, -0.36); tail.rotation.x = 0.7;

  const mkArm = side => {
    const p = new T.Group(); p.position.set(side * 0.44, 1.02, 0);
    const a = cap(0.16, 0.36, skin); a.position.y = -0.28;
    const hand = ball(0.21, skin); hand.position.y = -0.56;
    p.add(a, hand); return p;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // mallet lives in the right hand
  const mallet = new T.Group(); mallet.position.y = -0.56;
  const handle = cyl(0.075, 0.085, 0.86, wood); handle.position.y = 0.3; handle.rotation.z = 0.1;
  const hd = cyl(0.22, 0.22, 0.44, cream); hd.rotation.z = Math.PI / 2; hd.position.y = 0.74;
  const cap1 = ball(0.225, clayMat(PAL.cloth)); cap1.position.set(0.22, 0.74, 0); cap1.scale.set(0.45, 1, 1);
  const cap2 = cap1.clone(); cap2.position.x = -0.22;
  mallet.add(handle, hd, cap1, cap2);
  armR.add(mallet);

  const mkLeg = side => {
    const p = new T.Group(); p.position.set(side * 0.2, 0.56, 0);
    const l = cap(0.17, 0.24, clayMat(0xb98c7a)); l.position.y = -0.22;
    const foot = ball(0.2, dark); foot.position.set(0, -0.44, 0.06); foot.scale.set(1, 0.62, 1.25);
    p.add(l, foot); return p;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  g.add(body, hips, headPivot, scarf, tail, armL, armR, legL, legR);
  castAll(g);
  const sh = contactShadow(0.85); g.add(sh);
  return { root: g, parts: { body, hips, head: headPivot, armL, armR, legL, legR, mallet, scarf, shadow: sh } };
}

// ------------------------------------------------------------------ enemies
// Fired husks: hard baked terracotta, cracked open, ember light leaking out.
function emberCore(r) {
  const m = new T.Mesh(new T.SphereGeometry(r, 10, 8),
    new T.MeshStandardMaterial({ color: PAL.ember, emissive: PAL.ember, emissiveIntensity: 1.6, roughness: 1 }));
  return m;
}

export function makeHusk() {
  const g = new T.Group();
  const baked = clayMat(PAL.husk), deep = clayMat(PAL.huskDark);
  const body = cap(0.38, 0.44, baked); body.position.y = 0.84; body.scale.set(1, 1, 0.82);
  const crack = emberCore(0.16); crack.position.set(0, 0.9, 0.3); crack.scale.set(1.5, 0.5, 0.4);
  const headP = new T.Group(); headP.position.y = 1.3;
  const head = ball(0.42, deep); head.scale.set(1, 0.9, 0.92);
  const jaw = ball(0.26, baked); jaw.position.set(0, -0.2, 0.2); jaw.scale.set(1, 0.5, 0.8);
  const eyeL = emberCore(0.07), eyeR = emberCore(0.07);
  eyeL.position.set(-0.15, 0.04, 0.36); eyeR.position.set(0.15, 0.04, 0.36);
  headP.add(head, jaw, eyeL, eyeR);
  const mkArm = s => { const p = new T.Group(); p.position.set(s * 0.42, 1.0, 0);
    const a = cap(0.14, 0.4, deep); a.position.y = -0.3; const h = ball(0.19, baked); h.position.y = -0.6;
    p.add(a, h); return p; };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = s => { const p = new T.Group(); p.position.set(s * 0.19, 0.52, 0);
    const l = cap(0.15, 0.22, deep); l.position.y = -0.2; const f = ball(0.18, baked);
    f.position.set(0, -0.4, 0.05); f.scale.set(1, 0.6, 1.2); p.add(l, f); return p; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  g.add(body, crack, headP, armL, armR, legL, legR);
  castAll(g);
  const sh = contactShadow(0.8); g.add(sh);
  return { root: g, parts: { body, head: headP, armL, armR, legL, legR, glow: [crack, eyeL, eyeR], shadow: sh } };
}

export function makeShardling() {
  const g = new T.Group();
  const pale = clayMat(PAL.butter), deep = clayMat(0xa88a5a);
  const body = ball(0.34, pale); body.position.y = 0.92; body.scale.set(1, 1.15, 0.9);
  const headP = new T.Group(); headP.position.y = 1.26;
  const head = ball(0.27, deep); const eye = emberCore(0.11); eye.position.set(0, 0.02, 0.24);
  headP.add(head, eye);
  const mkLeg = (s, a) => { const p = new T.Group(); p.position.set(s * 0.2, 0.72, Math.sin(a) * 0.16);
    const l = cap(0.075, 0.5, deep); l.position.y = -0.3; l.rotation.z = -s * 0.4; p.add(l); return p; };
  const legL = mkLeg(-1, 0.4), legR = mkLeg(1, -0.4), legB = mkLeg(0.2, 2.4);
  const armP = new T.Group(); armP.position.set(0.34, 1.0, 0.1);
  const arm = cap(0.09, 0.3, deep); arm.position.y = -0.2;
  const shard = new T.Mesh(new T.ConeGeometry(0.14, 0.42, 6), clayMat(PAL.ember, { emissive: PAL.ember, emissiveIntensity: 0.5 }));
  shard.position.set(0, -0.44, 0.06); shard.rotation.x = Math.PI / 2;
  armP.add(arm, shard);
  g.add(body, headP, legL, legR, legB, armP);
  castAll(g);
  const sh = contactShadow(0.62); g.add(sh);
  return { root: g, parts: { body, head: headP, armL: armP, armR: armP, legL, legR, shard, glow: [eye], shadow: sh } };
}

export function makeBrute() {
  const g = new T.Group();
  const baked = clayMat(PAL.brick), deep = clayMat(0x8d5540);
  const body = cap(0.72, 0.5, baked); body.position.y = 1.42; body.scale.set(1.15, 1, 0.9);
  const belly = emberCore(0.3); belly.position.set(0, 1.28, 0.5); belly.scale.set(1.3, 0.7, 0.4);
  const headP = new T.Group(); headP.position.y = 2.02;
  const head = ball(0.34, deep); const eyeL = emberCore(0.07), eyeR = emberCore(0.07);
  eyeL.position.set(-0.13, 0.03, 0.28); eyeR.position.set(0.13, 0.03, 0.28);
  headP.add(head, eyeL, eyeR);
  const mkArm = s => { const p = new T.Group(); p.position.set(s * 0.86, 1.68, 0);
    const a = cap(0.26, 0.7, deep); a.position.y = -0.5;
    const fist = ball(0.42, baked); fist.position.y = -1.0; p.add(a, fist); return p; };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = s => { const p = new T.Group(); p.position.set(s * 0.34, 0.86, 0);
    const l = cap(0.26, 0.3, deep); l.position.y = -0.3; const f = ball(0.32, baked);
    f.position.set(0, -0.6, 0.08); f.scale.set(1, 0.6, 1.2); p.add(l, f); return p; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  g.add(body, belly, headP, armL, armR, legL, legR);
  castAll(g);
  const sh = contactShadow(1.4); g.add(sh);
  return { root: g, parts: { body, head: headP, armL, armR, legL, legR, glow: [belly, eyeL, eyeR], shadow: sh } };
}

// The Kilnwright: a walking kiln. Chimney, fire door, two long arms.
export function makeKilnwright() {
  const g = new T.Group();
  const brick = clayMat(0xa8624a), deep = clayMat(0x7d4433), band = clayMat(0xd9c3a3);
  const body = cyl(1.15, 1.45, 2.5, brick); body.position.y = 1.9;
  const dome = ball(1.16, brick); dome.position.y = 3.1; dome.scale.set(1, 0.72, 1);
  const chimney = cyl(0.36, 0.46, 1.5, deep); chimney.position.y = 4.0;
  const rim = new T.Mesh(new T.TorusGeometry(1.2, 0.16, 8, SEG), band); rim.rotation.x = Math.PI / 2; rim.position.y = 2.6;
  const door = emberCore(0.62); door.position.set(0, 1.6, 1.28); door.scale.set(1.3, 1.5, 0.4);
  const headP = new T.Group(); headP.position.y = 3.2;
  const eyeL = emberCore(0.14), eyeR = emberCore(0.14);
  eyeL.position.set(-0.42, 0.2, 0.92); eyeR.position.set(0.42, 0.2, 0.92);
  headP.add(eyeL, eyeR);
  const mkArm = s => { const p = new T.Group(); p.position.set(s * 1.8, 2.75, 0.25);
    const a = cap(0.34, 1.4, band); a.position.y = -0.9;
    const fist = ball(0.66, deep); fist.position.y = -1.9;
    const knuck = emberCore(0.2); knuck.position.set(0, -2.0, 0.4); knuck.scale.set(1.6, 0.5, 0.4);
    p.add(a, fist, knuck); return p; };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkLeg = s => { const p = new T.Group(); p.position.set(s * 0.6, 0.75, 0);
    const l = cap(0.34, 0.3, deep); l.position.y = -0.3; const f = ball(0.5, brick);
    f.position.set(0, -0.6, 0.15); f.scale.set(1, 0.55, 1.3); p.add(l, f); return p; };
  const legL = mkLeg(-1), legR = mkLeg(1);
  g.add(body, dome, chimney, rim, door, headP, armL, armR, legL, legR);
  castAll(g);
  g.scale.setScalar(1.45); // it has to tower over a hero who is 1.9 units tall
  const sh = contactShadow(1.9); g.add(sh);
  return { root: g, parts: { body, head: headP, armL, armR, legL, legR, glow: [door, eyeL, eyeR], shadow: sh } };
}

// ------------------------------------------------------------------ props
export function makeKiln(rng) {
  const g = new T.Group();
  const brick = clayMat(0xb4795e), deep = clayMat(0x8a5540);
  const base = cyl(0.9, 1.15, 1.9, brick); base.position.y = 0.95;
  const dome = ball(0.92, brick); dome.position.y = 1.9; dome.scale.set(1, 0.7, 1);
  const stack = cyl(0.28, 0.34, 1.2, deep); stack.position.y = 2.7;
  const mouth = emberCore(0.4); mouth.position.set(0, 0.75, 0.86); mouth.scale.set(1, 1.1, 0.3);
  g.add(base, dome, stack, mouth);
  return castAll(g);
}

export function makeHut(rng) {
  const g = new T.Group();
  const wall = clayMat(0xe0cbb0), roof = clayMat(0xc98a63);
  const w = cyl(1.25, 1.45, 1.9, wall); w.position.y = 0.95;
  const r = cyl(0.05, 1.75, 1.25, roof); r.position.y = 2.45;
  const door = new T.Mesh(new T.CapsuleGeometry(0.34, 0.5, 3, 10), clayMat(0x7d5f4c));
  door.position.set(0, 0.7, 1.3); door.scale.set(1, 1, 0.25);
  g.add(w, r, door);
  return castAll(g);
}

export function makeWheel() {
  const g = new T.Group();
  const wood = clayMat(PAL.wood), stone = clayMat(0x9d9384);
  const base = cyl(0.5, 0.62, 0.5, wood); base.position.y = 0.25;
  const post = cyl(0.12, 0.14, 0.7, wood); post.position.y = 0.7;
  const disc = cyl(0.72, 0.72, 0.14, stone); disc.position.y = 1.06;
  const pot = cap(0.24, 0.2, clayMat(PAL.cream)); pot.position.y = 1.34;
  g.add(base, post, disc, pot);
  return castAll(g);
}

export function makePot(scale = 1) {
  const m = clayMat(0xd8b48c);
  const g = new T.Group();
  const b = ball(0.42, m); b.scale.set(1, 1.1, 1); b.position.y = 0.45;
  const neck = cyl(0.2, 0.3, 0.24, m); neck.position.y = 0.92;
  const lip = new T.Mesh(new T.TorusGeometry(0.22, 0.06, 6, 12), m); lip.rotation.x = Math.PI / 2; lip.position.y = 1.02;
  g.add(b, neck, lip); g.scale.setScalar(scale);
  return castAll(g);
}

export function makeBush(rng) {
  const g = new T.Group();
  const m = clayMat(rng() > 0.5 ? PAL.sage : 0x9fb589);
  for (let i = 0; i < 3; i++) {
    const b = ball(0.34 + rng() * 0.22, m);
    b.position.set((rng() - 0.5) * 0.7, 0.3 + rng() * 0.25, (rng() - 0.5) * 0.7);
    b.scale.y = 0.85; g.add(b);
  }
  return castAll(g);
}

export function makeTree(rng) {
  const g = new T.Group();
  const trunk = cyl(0.16, 0.26, 1.7, clayMat(PAL.wood)); trunk.position.y = 0.85;
  const leaf = clayMat(rng() > 0.5 ? 0x93b07d : 0xa9c294);
  for (let i = 0; i < 3; i++) {
    const b = ball(0.85 - i * 0.16, leaf);
    b.position.set((rng() - 0.5) * 0.5, 1.9 + i * 0.5, (rng() - 0.5) * 0.5);
    b.scale.y = 0.8; g.add(b);
  }
  g.add(trunk);
  return castAll(g);
}

export function makeGate() {
  const g = new T.Group();
  const m = clayMat(0x8f6a56);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const b = new T.Mesh(new T.BoxGeometry(1.7, 0.85, 1.1), m);
      b.position.set((i - 2) * 1.75 + (j % 2 ? 0.3 : 0), 0.45 + j * 0.86, 0);
      g.add(b);
    }
  }
  const seal = new T.Mesh(new T.TorusGeometry(0.9, 0.2, 8, 18),
    clayMat(PAL.ember, { emissive: PAL.ember, emissiveIntensity: 1.2 }));
  seal.position.set(0, 1.5, 0.6);
  g.add(seal);
  castAll(g);
  return { root: g, seal };
}

// ------------------------------------------------------------------ level
// Zones are circles, corridors are axis-aligned rectangles. Movement is legal
// inside the union, which keeps collision to a few cheap tests.
export const ZONES = [
  { id: 0, name: 'The Yard', sub: 'soft ground, first husks', x: 0, z: 0, r: 17,
    waves: [[['husk', 3]], [['husk', 4], ['shardling', 1]]] },
  { id: 1, name: 'Wheel Row', sub: 'the potters ran', x: 0, z: -44, r: 19,
    waves: [[['husk', 4], ['shardling', 2]], [['husk', 5], ['shardling', 3]], [['brute', 1], ['husk', 3]]] },
  { id: 2, name: 'Kiln Terrace', sub: 'it is hot up here', x: 42, z: -44, r: 21,
    waves: [[['brute', 1], ['shardling', 3]], [['husk', 6], ['shardling', 2]], [['brute', 2], ['husk', 4]]] },
  { id: 3, name: "The Kilnwright's Bed", sub: 'it is awake', x: 42, z: -88, r: 24,
    waves: [[['boss', 1]]] }
];

export const CORRIDORS = [
  { x0: -4, x1: 4, z0: -44, z1: 0, gate: { x: 0, z: -19, rot: 0, from: 0 } },
  { x0: 0, x1: 42, z0: -48, z1: -40, gate: { x: 21, z: -44, rot: Math.PI / 2, from: 1 } },
  { x0: 37, x1: 47, z0: -88, z1: -44, gate: { x: 42, z: -66, rot: 0, from: 2 } }
];

export function insideWorld(x, z, openGates) {
  for (const zn of ZONES) {
    const dx = x - zn.x, dz = z - zn.z;
    if (dx * dx + dz * dz < (zn.r - 0.6) * (zn.r - 0.6)) return true;
  }
  for (let i = 0; i < CORRIDORS.length; i++) {
    const c = CORRIDORS[i];
    if (x > c.x0 + 0.6 && x < c.x1 - 0.6 && z > c.z0 + 0.6 && z < c.z1 - 0.6) {
      if (!openGates[i]) { // gate still sealed: stop short of it
        const g = c.gate;
        if (g.rot === 0 ? z < g.z + 1.2 : x > g.x - 1.2) return false;
      }
      return true;
    }
  }
  return false;
}

// ground slabs + scenery, built once
export function buildWorld(scene, rng) {
  const group = new T.Group();
  // the table the diorama sits on, so the world does not end in empty fog
  const table = new T.Mesh(new T.PlaneGeometry(600, 600), clayMat(0xdcc6a8));
  table.rotation.x = -Math.PI / 2; table.position.set(20, -1.6, -44); table.receiveShadow = false;
  group.add(table);
  const groundMat = clayMat(PAL.ground);
  const pathMat = clayMat(PAL.path);
  const rimMat = clayMat(PAL.groundDark);

  // rim of hand-rolled clay lumps, with a gap wherever a corridor meets the platter
  const gapsFor = zn => CORRIDORS.flatMap((c, i) => {
    if (i !== zn.id && i + 1 !== zn.id) return [];
    return [Math.atan2((c.z0 + c.z1) / 2 - zn.z, (c.x0 + c.x1) / 2 - zn.x)];
  });
  const inGap = (a, gaps) => gaps.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.34);

  for (const zn of ZONES) {
    const slab = cyl(zn.r, zn.r * 0.99, 1.2, groundMat);
    slab.position.set(zn.x, -0.6, zn.z); slab.receiveShadow = true;
    group.add(slab);
    const gaps = gapsFor(zn);
    zn._gaps = gaps;
    const n = Math.round(zn.r * 3.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (inGap(a, gaps)) continue;
      const lump = ball(0.62 + rng() * 0.2, rimMat);
      lump.position.set(zn.x + Math.cos(a) * (zn.r - 0.35), 0.14, zn.z + Math.sin(a) * (zn.r - 0.35));
      lump.scale.set(1.25, 0.78, 1.25);
      lump.receiveShadow = true; lump.castShadow = true;
      group.add(lump);
    }
  }
  for (const c of CORRIDORS) {
    const w = c.x1 - c.x0, d = c.z1 - c.z0;
    const box = new T.Mesh(new T.BoxGeometry(w, 1.2, d), pathMat);
    // a hair lower than the zone slabs, so paths do not stripe across the platters
    box.position.set((c.x0 + c.x1) / 2, -0.63, (c.z0 + c.z1) / 2); box.receiveShadow = true;
    group.add(box);
  }

  // scenery, deterministic per zone
  const props = [];
  for (const zn of ZONES) {
    const n = zn.id === 3 ? 9 : 9;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = zn.r * (0.62 + rng() * 0.32);
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      const roll = rng();
      let p;
      if (zn.id === 3) p = makeKiln(rng);
      else if (roll < 0.2) p = makeHut(rng);
      else if (roll < 0.38) p = makeKiln(rng);
      else if (roll < 0.55) p = makeWheel();
      else if (roll < 0.78) p = makeTree(rng);
      else p = makeBush(rng);
      p.position.set(x, 0, z); p.rotation.y = rng() * Math.PI * 2;
      group.add(p);
      props.push({ x, z, r: roll < 0.55 ? 1.35 : 0.8 });
    }
    // a ring of decorative bushes on the slab edge, gaps kept clear
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng() * 0.2;
      if (inGap(a, zn._gaps)) continue;
      const b = makeBush(rng);
      b.position.set(zn.x + Math.cos(a) * (zn.r - 1.1), 0, zn.z + Math.sin(a) * (zn.r - 1.1));
      b.scale.setScalar(0.8 + rng() * 0.5);
      group.add(b);
    }
  }
  scene.add(group);
  return { group, props };
}
