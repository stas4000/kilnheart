// KILNHEART engine: renderer, isometric camera rig, input, procedural audio, VFX pools.
// Art direction: clay-toy (see state/game-styles.json). Matte, rounded, pastel, soft light, zero glare.
import * as T from 'three';

export const IS_TOUCH = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
export const LOW = IS_TOUCH || (navigator.hardwareConcurrency || 8) <= 4;
export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[(Math.random() * arr.length) | 0];
// angle difference wrapped to [-PI,PI]
export const angDiff = (a, b) => { let d = (a - b + Math.PI) % (Math.PI * 2); if (d < 0) d += Math.PI * 2; return d - Math.PI; };

export const PAL = {
  sky: 0xf2e4d2, ground: 0x9dbb7c, groundDark: 0x7d9b5c, path: 0xdcc09a,
  skin: 0xe6a49b, cloth: 0x8fb8d6, wood: 0xb58a5f, cream: 0xfff3e4,
  husk: 0xc98a63, huskDark: 0x9c6244, ember: 0xff6b35, charcoal: 0x5a4438,
  butter: 0xecd9a6, sage: 0xb8c9a4, rose: 0xe8b8b0, brick: 0xbf7a5c
};

// ---------------------------------------------------------------- renderer
export function makeRenderer(canvas) {
  const r = new T.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
  r.setSize(innerWidth, innerHeight, false);
  r.shadowMap.enabled = true;
  r.shadowMap.type = LOW ? T.PCFShadowMap : T.PCFSoftShadowMap;
  r.toneMapping = T.NoToneMapping; // clay-toy: no filmic glare
  return r;
}

export function makeScene() {
  const s = new T.Scene();
  s.background = new T.Color(PAL.sky);
  s.fog = new T.Fog(PAL.sky, 52, 120);

  const hemi = new T.HemisphereLight(0xfff6ea, 0x93a37c, 0.66);
  s.add(hemi);

  const key = new T.DirectionalLight(0xfff3e0, 1.7);
  key.position.set(24, 42, 18);
  key.castShadow = true;
  const sm = LOW ? 1024 : 2048;
  key.shadow.mapSize.set(sm, sm);
  key.shadow.camera.near = 1; key.shadow.camera.far = 140;
  const ext = 20;
  key.shadow.camera.left = -ext; key.shadow.camera.right = ext;
  key.shadow.camera.top = ext; key.shadow.camera.bottom = -ext;
  key.shadow.bias = -0.0012;
  key.shadow.normalBias = 0.035;
  s.add(key, key.target);

  const fill = new T.DirectionalLight(0xdCE6ff, 0.28);
  fill.position.set(-20, 16, -22);
  s.add(fill);
  return { scene: s, key, fill };
}

// isometric orthographic rig with smooth follow + shake
export class CameraRig {
  constructor() {
    this.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.dir = new T.Vector3(1, 1.18, 1).normalize();
    this.target = new T.Vector3();
    this.look = new T.Vector3();
    this.shake = 0;
    this.zoom = 1;
    this.baseSpan = 12;
    this.shift = 0; // world units along screen-down, keeps the hero above the thumbs
    this.resize();
  }
  resize() {
    const a = innerWidth / innerHeight;
    // portrait phones get a slightly wider view and the hero pushed up off the controls
    const span = this.baseSpan * (a < 1 ? 1.15 : 1) * this.zoom;
    this.cam.left = -span * a; this.cam.right = span * a;
    this.cam.top = span; this.cam.bottom = -span;
    this.cam.updateProjectionMatrix();
    this.shift = a < 1 ? span * 0.2 : (a < 1.5 ? span * 0.1 : 0);
  }
  snap(x, z) { this.look.set(x, 0, z); this.place(); }
  follow(x, z, aimX, aimZ, dt) {
    // slight look-ahead toward the aim point keeps the action centred
    const tx = x + (aimX - x) * 0.16, tz = z + (aimZ - z) * 0.16;
    const k = 1 - Math.pow(0.0016, dt);
    this.look.x = lerp(this.look.x, tx, k);
    this.look.z = lerp(this.look.z, tz, k);
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.place();
  }
  place() {
    const d = 70;
    let sx = 0, sz = 0, sy = 0;
    if (this.shake > 0 && !REDUCED) {
      const a = this.shake * this.shake * 0.5;
      sx = rand(-a, a); sz = rand(-a, a); sy = rand(-a, a) * 0.5;
    }
    // screen-down in world space is (+1,+1)/sqrt2 for this iso angle
    const ox = this.shift * Math.SQRT1_2, oz = this.shift * Math.SQRT1_2;
    const cx = this.look.x + ox + sx, cz = this.look.z + oz + sz;
    this.cam.position.set(cx + this.dir.x * d, this.dir.y * d + sy, cz + this.dir.z * d);
    this.cam.lookAt(cx, 0, cz);
  }
  kick(amount) { this.shake = Math.min(1.6, this.shake + amount); }
  // screen point -> world point on the y=0 plane
  screenToGround(px, py, out) {
    const ndc = new T.Vector2((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    const rc = new T.Raycaster();
    rc.setFromCamera(ndc, this.cam);
    const p = new T.Plane(new T.Vector3(0, 1, 0), 0);
    return rc.ray.intersectPlane(p, out) ? out : null;
  }
}

// ---------------------------------------------------------------- input
export class Input {
  constructor(rig) {
    this.rig = rig;
    this.keys = new Set();
    this.move = new T.Vector2();      // -1..1 desired direction
    this.aim = new T.Vector3(0, 0, 1); // world aim point
    this.attackHeld = false;
    this.pressed = { attack: false, dash: false, burst: false };
    this._pt = new T.Vector3();
    this.pointerPx = { x: innerWidth / 2, y: innerHeight / 2 };
    this.usingTouch = IS_TOUCH;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') { this.pressed.dash = true; e.preventDefault(); }
      if (k === 'e') this.pressed.burst = true;
      if (k === 'p' || k === 'escape') this.onPause?.();
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.attackHeld = false; });

    addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { this.pointerPx.x = e.clientX; this.pointerPx.y = e.clientY; } });
    addEventListener('pointerdown', e => {
      const t = e.target; // may be window/document, not only an element
      if (e.pointerType === 'touch' || (t && t.closest && t.closest('#touch,.over,#cards,button,.card'))) return;
      this.pointerPx.x = e.clientX; this.pointerPx.y = e.clientY;
      if (e.button === 0) { this.attackHeld = true; this.pressed.attack = true; }
      if (e.button === 2) this.pressed.burst = true;
    });
    addEventListener('pointerup', e => { if (e.button === 0) this.attackHeld = false; });
    addEventListener('contextmenu', e => e.preventDefault());

    if (IS_TOUCH) this._touch();
  }
  _touch() {
    document.getElementById('touch').classList.add('on'); // body.touch is set in index.html
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let sid = null, cx = 0, cy = 0;
    const R = 52;
    const startStick = e => {
      const b = stick.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      sid = e.pointerId; stick.setPointerCapture(sid); moveStick(e);
    };
    const moveStick = e => {
      if (e.pointerId !== sid) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy) || 1;
      const c = Math.min(1, d / R);
      dx = dx / d * c; dy = dy / d * c;
      this.move.set(dx, dy);
      knob.style.transform = `translate(${dx * R}px,${dy * R}px)`;
    };
    const endStick = e => { if (e.pointerId !== sid) return; sid = null; this.move.set(0, 0); knob.style.transform = ''; };
    stick.addEventListener('pointerdown', startStick);
    stick.addEventListener('pointermove', moveStick);
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('hold'); down(); });
      const off = () => { el.classList.remove('hold'); up?.(); };
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
    };
    btn('tAtk', () => { this.attackHeld = true; this.pressed.attack = true; }, () => { this.attackHeld = false; });
    btn('tDash', () => { this.pressed.dash = true; });
    btn('tBurst', () => { this.pressed.burst = true; });
  }
  // desired move vector in world space (screen-up = world -Z rotated to iso)
  moveVector(out) {
    let x = 0, y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (x === 0 && y === 0) { x = this.move.x; y = this.move.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    // iso: camera looks from (+x,+y,+z), so screen-up maps to world (-1,-1)/sqrt2
    const c = Math.SQRT1_2;
    out.set((x - y) * c, (-x - y) * c);
    return out;
  }
  aimPoint(player) {
    if (this.usingTouch && this.move.lengthSq() > 0.01) {
      const m = new T.Vector2(); this.moveVector(m);
      this.aim.set(player.x + m.x * 6, 0, player.z + m.y * 6);
    } else if (!this.usingTouch) {
      const p = this.rig.screenToGround(this.pointerPx.x, this.pointerPx.y, this._pt);
      if (p) this.aim.copy(p);
    }
    return this.aim;
  }
  consume(name) { const v = this.pressed[name]; this.pressed[name] = false; return v; }
}

// ---------------------------------------------------------------- audio
// Everything is synthesised: wooden knocks, mallets, marimba. No files, no network.
export class Audio {
  constructor() {
    this.ctx = null; this.on = true; this.next = 0; this.step = 0;
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
    this.musicG = this.ctx.createGain(); this.musicG.gain.value = 0.34; this.musicG.connect(this.master);
    this.sfxG = this.ctx.createGain(); this.sfxG.gain.value = 0.9; this.sfxG.connect(this.master);
    const cv = this.ctx.createConvolver(); // small wooden room
    const len = this.ctx.sampleRate * 0.6, buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    cv.buffer = buf; this.verb = this.ctx.createGain(); this.verb.gain.value = 0.22;
    this.verb.connect(cv); cv.connect(this.master);
    this.next = this.ctx.currentTime + 0.1;
  }
  // one struck wooden/mallet tone
  tone(freq, t, dur, gain, type = 'triangle', bend = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * bend), t + dur);
    f.type = 'lowpass'; f.frequency.setValueAtTime(Math.min(9000, freq * 6), t); f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.sfxG); g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(t, dur, gain, lp = 1800, hp = 120) {
    const c = this.ctx; if (!c) return;
    const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const s = c.createBufferSource(); s.buffer = b;
    const lo = c.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = lp;
    const hi = c.createBiquadFilter(); hi.type = 'highpass'; hi.frequency.value = hp;
    const g = c.createGain(); g.gain.value = gain;
    s.connect(hi); hi.connect(lo); lo.connect(g); g.connect(this.sfxG); g.connect(this.verb);
    s.start(t); s.stop(t + dur);
  }
  sfx(name) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + 0.001;
    switch (name) {
      case 'swing': this.noise(t, 0.16, 0.13, 1400, 500); break;
      case 'hit': this.tone(rand(150, 190), t, 0.16, 0.4, 'triangle', 0.55); this.noise(t, 0.11, 0.3, 2600, 300); break;
      case 'heavy': this.tone(96, t, 0.4, 0.5, 'sine', 0.4); this.noise(t, 0.26, 0.34, 1500, 90); break;
      case 'dash': this.noise(t, 0.2, 0.16, 3200, 800); break;
      case 'burst': this.tone(220, t, 0.7, 0.36, 'sine', 0.25); this.noise(t, 0.5, 0.3, 900, 60);
        [0, 0.06, 0.12].forEach((d, i) => this.tone(440 * (1 + i * 0.5), t + d, 0.5, 0.1, 'triangle', 0.5)); break;
      case 'break': this.noise(t, 0.35, 0.34, 4200, 700); this.tone(rand(300, 420), t, 0.2, 0.16, 'square', 0.3); break;
      case 'hurt': this.tone(140, t, 0.3, 0.42, 'sawtooth', 0.35); this.noise(t, 0.2, 0.2, 900, 60); break;
      case 'pick': this.tone(660, t, 0.16, 0.22, 'triangle'); this.tone(990, t + 0.06, 0.2, 0.16, 'triangle'); break;
      case 'gate': this.noise(t, 0.9, 0.34, 1200, 60); this.tone(70, t, 0.9, 0.4, 'sine', 0.5); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.09, 0.5, 0.2, 'triangle')); break;
      case 'boss': this.tone(58, t, 1.6, 0.5, 'sine', 0.7); this.noise(t, 1.2, 0.24, 600, 40); break;
      case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.13, 0.9, 0.22, 'triangle')); break;
      case 'lose': [330, 294, 247, 196].forEach((f, i) => this.tone(f, t + i * 0.16, 0.7, 0.24, 'triangle', 0.8)); break;
    }
  }
  // marimba loop; intensity 0..1 raises density and adds a low pulse
  music(intensity) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, spb = 60 / 96 / 2; // eighth notes at 96bpm
    const scale = [174.61, 196, 233.08, 261.63, 293.66, 349.23, 392, 466.16, 523.25];
    while (this.next < c.currentTime + 0.6) {
      const t = this.next, s = this.step;
      if (s % 4 === 0) this.tone(scale[(s / 4) % 4 === 0 ? 0 : 2] / 2, t, 1.1, 0.09 + intensity * 0.05, 'sine');
      if (s % 2 === 0 || Math.random() < 0.3 + intensity * 0.35) {
        const n = scale[(Math.floor(s / 2) * 3 + (s % 3)) % scale.length];
        this.tone(n, t, 0.5, 0.055 + intensity * 0.03, 'triangle');
      }
      if (intensity > 0.35 && s % 8 === 4) this.noise(t, 0.1, 0.05 + intensity * 0.05, 3000, 900); // brush
      if (s % 8 === 0) this.noise(t, 0.08, 0.06, 900, 120); // wooden knock
      this.next += spb; this.step++;
    }
  }
}

// ---------------------------------------------------------------- VFX
// One instanced sphere pool for every particle: clay puffs, chunks, sparks.
export class Particles {
  constructor(scene, max = LOW ? 260 : 620) {
    const g = new T.SphereGeometry(0.5, LOW ? 6 : 8, LOW ? 4 : 6);
    const m = new T.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    this.mesh = new T.InstancedMesh(g, m, max);
    this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.count = max;
    // instanceColor must exist before first compile, otherwise every particle is white
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, new T.Color(1, 1, 1));
    scene.add(this.mesh);
    this.max = max;
    this.p = Array.from({ length: max }, () => ({ life: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s: 0, s0: 0, ttl: 1, g: -26, spin: 0 }));
    this.head = 0;
    this._m = new T.Matrix4(); this._q = new T.Quaternion(); this._v = new T.Vector3(); this._sc = new T.Vector3();
    this._c = new T.Color();
    this.hidden = new T.Matrix4().makeScale(0, 0, 0);
  }
  burst(x, y, z, n, opt = {}) {
    if (REDUCED) n = Math.ceil(n * 0.4);
    const { color = PAL.husk, speed = 6, size = 0.28, ttl = 0.8, spread = 1, up = 1, grav = -26 } = opt;
    for (let i = 0; i < n; i++) {
      const idx = this.head; const p = this.p[idx]; this.head = (this.head + 1) % this.max;
      const a = Math.random() * Math.PI * 2, e = rand(0.1, 1) * up;
      const sp = speed * rand(0.4, 1.2);
      p.x = x + rand(-0.2, 0.2) * spread; p.y = y + rand(0, 0.3); p.z = z + rand(-0.2, 0.2) * spread;
      p.vx = Math.cos(a) * sp * spread; p.vz = Math.sin(a) * sp * spread; p.vy = e * sp;
      p.s0 = p.s = size * rand(0.55, 1.5); p.ttl = ttl * rand(0.7, 1.3); p.life = p.ttl; p.g = grav;
      this._c.set(color).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.08, 0.08));
      this.mesh.setColorAt(idx, this._c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (p.life <= 0) { this.mesh.setMatrixAt(i, this.hidden); continue; }
      p.life -= dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.34; p.vx *= 0.7; p.vz *= 0.7; }
      const k = Math.max(0, p.life / p.ttl);
      // shrink to nothing instead of resting at 35%, or landed chunks litter the floor
      const s = p.s0 * Math.min(1, k * 2.2);
      this._v.set(p.x, p.y, p.z); this._sc.set(s, s, s);
      this._m.compose(this._v, this._q, this._sc);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// expanding ground rings for shockwaves and telegraphs
export class Rings {
  constructor(scene, max = 14) {
    this.items = [];
    this.pool = [];
    const geo = new T.RingGeometry(0.72, 1, 40);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < max; i++) {
      const m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false; m.renderOrder = 2; scene.add(m); this.pool.push(m);
    }
  }
  spawn(x, z, r0, r1, ttl, color, opacity = 0.75) {
    const m = this.pool.pop(); if (!m) return null;
    m.visible = true; m.position.set(x, 0.06, z); m.material.color.set(color);
    const it = { m, r0, r1, ttl, t: 0, opacity };
    this.items.push(it); return it;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]; it.t += dt;
      const k = it.t / it.ttl;
      if (k >= 1) { it.m.visible = false; this.pool.push(it.m); this.items.splice(i, 1); continue; }
      const r = lerp(it.r0, it.r1, k);
      it.m.scale.set(r, 1, r);
      it.m.material.opacity = it.opacity * (1 - k);
    }
  }
}

// soft round contact shadow that sells the toy-diorama look
const shadowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  rad.addColorStop(0, 'rgba(90,68,56,.55)'); rad.addColorStop(0.55, 'rgba(90,68,56,.22)'); rad.addColorStop(1, 'rgba(90,68,56,0)');
  g.fillStyle = rad; g.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
})();

export function contactShadow(radius = 1) {
  const m = new T.Mesh(new T.PlaneGeometry(radius * 2, radius * 2),
    new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

// shared per (colour, options) so a crowd of husks costs one material, not thirty.
// Anything whose emissive is animated per entity must build its own material instead.
const matCache = new Map();
export const clayMat = (color, opts = {}) => {
  const k = `${color}|${opts.roughness}|${opts.flat}|${opts.emissive}|${opts.emissiveIntensity}`;
  let m = matCache.get(k);
  if (!m) {
    m = new T.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.98, metalness: 0, flatShading: !!opts.flat,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1
    });
    matCache.set(k, m);
  }
  return m;
};

// adaptive quality: real phones and software renderers both land here.
// ponytail: two steps only (pixel ratio, then shadows), add more if a device needs it.
export function autoQuality(renderer, key) {
  let acc = 0, n = 0, step = 0;
  return dt => {
    if (step > 1) return;
    acc += dt; n++;
    if (acc < 2.5) return;
    const fps = n / acc; acc = 0; n = 0;
    if (fps > 45) { step = 2; return; } // healthy, stop watching
    if (step === 0) { renderer.setPixelRatio(1); step = 1; }
    else if (fps < 26) { renderer.shadowMap.enabled = false; key.castShadow = false; step = 2; }
  };
}
