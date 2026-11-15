// weapons.js — buyable guns and the one shared hitscan routine.
// Damage falls off with range; headshots (hit above the shoulders) pay double.
import * as THREE from 'three';
import { rayWalls } from './world.js';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, damage: 26, rpm: 320, mag: 13, reserve: 52,
    spread: 0.014, auto: false, range: 55, reload: 1.1, move: 1.0, tracer: 0xffe9a8,
  },
  smg: {
    name: 'VK-9 SMG', price: 1500, damage: 22, rpm: 750, mag: 30, reserve: 120,
    spread: 0.026, auto: true, range: 40, reload: 1.6, move: 0.98, tracer: 0xffd27a,
  },
  rifle: {
    name: 'AR-77 Rifle', price: 2700, damage: 33, rpm: 600, mag: 25, reserve: 100,
    spread: 0.011, auto: true, range: 70, reload: 2.0, move: 0.95, tracer: 0xffe9a8,
  },
  sniper: {
    name: 'LW-50 Longshot', price: 4750, damage: 95, rpm: 48, mag: 5, reserve: 20,
    spread: 0.001, auto: false, range: 120, reload: 2.8, move: 0.9, tracer: 0x8fc4ff,
  },
};

export const BUY_ORDER = ['pistol', 'smg', 'rifle', 'sniper'];

export function makeLoadout(id) {
  const w = WEAPONS[id];
  return { id, ammo: w.mag, reserve: w.reserve, reloading: 0 };
}

/** Combatant body box for hitscan: 0.9 wide, 1.8 tall, centred on pos. */
function combatantHit(origin, dir, maxDist, c) {
  const min = new THREE.Vector3(c.pos.x - 0.45, c.pos.y, c.pos.z - 0.45);
  const max = new THREE.Vector3(c.pos.x + 0.45, c.pos.y + 1.8, c.pos.z + 0.45);
  let tmin = 0;
  let tmax = maxDist;
  for (const ax of ['x', 'y', 'z']) {
    const o = origin[ax];
    const d = dir[ax];
    const lo = min[ax];
    const hi = max[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmin > maxDist) return null;
  const y = origin.y + dir.y * tmin;
  return { t: tmin, head: y > c.pos.y + 1.35 };
}

const _dir = new THREE.Vector3();

/**
 * One hitscan shot. `shooter` is a Combatant; `ctx` carries the world, the
 * combatant list, effects and sound. Returns the combatant hit (or null).
 * Spread is applied by the caller through `spreadRad`.
 */
export function fireHitscan(shooter, dir, spreadRad, ctx) {
  const w = WEAPONS[shooter.weapon.id];
  _dir.copy(dir);
  if (spreadRad > 0) {
    // random cone around the aim direction
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * spreadRad;
    const up = Math.abs(_dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(_dir, up).normalize();
    const upv = new THREE.Vector3().crossVectors(right, _dir).normalize();
    _dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r).normalize();
  }
  const origin = shooter.eyePos();
  const maxDist = w.range;
  const wall = rayWalls(origin, _dir, maxDist, ctx.world.colliders);
  const wallT = wall ? wall.t : Infinity;
  let hit = null;
  let bestT = wallT;
  for (const c of ctx.combatants) {
    if (c === shooter || !c.alive) continue;
    if (c.team === shooter.team) continue;
    const h = combatantHit(origin, _dir, maxDist, c);
    if (h && h.t < bestT) { bestT = h.t; hit = { c, head: h.head }; }
  }
  const end = origin.clone().addScaledVector(_dir, Math.min(bestT, maxDist));
  ctx.effects.addTracer(origin, end, w.tracer);
  ctx.effects.addFlash(origin, _dir);
  ctx.sfx.shot(shooter.weapon.id, shooter.isPlayer ? 0 : origin.distanceTo(ctx.player.pos));
  if (hit) {
    const falloff = Math.max(0.55, 1 - (bestT / w.range) * 0.45);
    let dmg = w.damage * falloff * (hit.head ? 2 : 1);
    if (hit.c.armor > 0) { dmg *= 0.6; hit.c.armor = Math.max(0, hit.c.armor - dmg * 0.4); }
    hit.c.takeDamage(dmg, shooter, hit.head);
    ctx.effects.addSparks(end, 0xffc861, hit.head ? 10 : 6);
    if (shooter.isPlayer) ctx.hud.hitmarker(hit.head);
    return hit.c;
  }
  if (bestT < maxDist) ctx.effects.addSparks(end, 0x9aa3ad, 3);
  return null;
}
