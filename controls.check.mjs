// Dev check for the desktop cursor-relative movement math. Run: node controls.check.mjs
// Never imported by the game. It loads the real engine.js, so it stubs the few browser globals
// engine.js touches at import time and maps the bare 'three' specifier the importmap normally handles.
import assert from 'node:assert/strict';
import { register } from 'node:module';

const three = new URL('./three.module.min.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s, c, n) { return s === 'three' ? { url: '${three}', shortCircuit: true } : n(s, c); }`));
const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { createElement: () => ({ getContext: () => ctx }) };

const { cursorMove, AIM_DEAD } = await import('./engine.js');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const hero = { x: 3, z: -2 }, aim = { x: 9, z: 6 };          // aim direction = (0.6, 0.8)
const go = (f, s, a = aim, last = { x: 0, z: 1 }) => ({ v: cursorMove(f, s, hero.x, hero.z, a.x, a.z, last), last });

let r = go(1, 0);                                             // W: toward the aim point
assert(near(r.v.x, 0.6) && near(r.v.z, 0.8), 'W moves toward the aim point');
assert(near(r.last.x, 0.6) && near(r.last.z, 0.8), 'last direction is updated');
r = go(-1, 0);                                                // S: directly away
assert(near(r.v.x, -0.6) && near(r.v.z, -0.8), 'S moves away');
r = go(0, 1);                                                 // D: perpendicular, to the hero's right
assert(near(r.v.x * 0.6 + r.v.z * 0.8, 0), 'D is perpendicular to the aim direction');
assert(near(Math.hypot(r.v.x, r.v.z), 1), 'D is a unit vector');
// right of a facing f in a Y-up right-handed world is f x up = (-fz, fx)
assert(near(r.v.x, -0.8) && near(r.v.z, 0.6), 'D is to the hero\'s right');
r = go(0, -1);
assert(near(r.v.x, 0.8) && near(r.v.z, -0.6), 'A is to the hero\'s left');
r = go(1, 1);
assert(near(Math.hypot(r.v.x, r.v.z), 1), 'diagonals are normalised');

// inside the dead radius: W gives nothing, A/D still work off the last stable direction
const close = { x: hero.x + AIM_DEAD * 0.4 * 0.6, z: hero.z + AIM_DEAD * 0.4 * 0.8 };
const last = { x: 0.6, z: 0.8 };
r = go(1, 0, close, last);
assert(Math.hypot(r.v.x, r.v.z) < 1e-6, 'W yields ~0 inside the dead radius');
r = go(0, 1, close, last);
assert(near(Math.hypot(r.v.x, r.v.z), 1) && near(r.v.x, -0.8) && near(r.v.z, 0.6), 'D still strafes inside the dead radius');
assert(near(last.x, 0.6) && near(last.z, 0.8), 'last direction holds inside the dead radius');

// W falls off smoothly and monotonically on the way in, no step at the edge
let prev = 1;
for (let d = 4; d >= 0; d -= 0.05) {
  const v = cursorMove(1, 0, 0, 0, 0, d, { x: 0, z: 1 });
  assert(v.z <= prev + 1e-12 && v.z >= 0 && prev - v.z < 0.08, `smooth falloff at d=${d.toFixed(2)}`);
  prev = v.z;
}

// with a dt the direction turns at a capped rate while the aim is close, stays unit length, and is instant far away
{
  const l = { x: 0, z: 1 };
  cursorMove(0, 1, 0, 0, 1, 0, l, undefined, 1 / 60);        // aim 1u away, 90 degrees off
  const turned = Math.atan2(l.x, l.z);
  assert(turned > 0 && turned < 0.2 && near(Math.hypot(l.x, l.z), 1), 'close aim turns the direction gradually');
  for (let i = 0; i < 120; i++) cursorMove(0, 1, 0, 0, 1, 0, l, undefined, 1 / 60);
  assert(near(l.x, 1) && near(l.z, 0), 'and it still arrives exactly');
  const far = { x: 0, z: 1 };
  cursorMove(1, 0, 0, 0, -9, 0, far, undefined, 1 / 60);
  assert(near(far.x, -1) && near(far.z, 0), 'far aim snaps instantly');
}

// aim exactly on the hero, NaN aim, broken last direction: never NaN, never zero-length direction
for (const [a, l] of [[hero, { x: 0.6, z: 0.8 }], [hero, { x: 0, z: 0 }], [{ x: NaN, z: NaN }, { x: NaN, z: 0 }]])
  for (const [f, s] of [[1, 0], [-1, 0], [0, 1], [1, -1]]) {
    const v = cursorMove(f, s, hero.x, hero.z, a.x, a.z, l);
    assert(Number.isFinite(v.x) && Number.isFinite(v.z), 'no NaN in the move vector');
    assert(near(Math.hypot(l.x, l.z), 1), 'last direction stays unit length');
  }
console.log('controls.check: all assertions passed');
