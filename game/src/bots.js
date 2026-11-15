// bots.js — team AI. Waypoint BFS paths, line-of-sight duels with reaction
// times and aim error, site executes, bomb plant and defuse.
import * as THREE from 'three';
import { WEAPONS } from './weapons.js';
import { fireHitscan } from './weapons.js';
import { Combatant } from './player.js';
import { rayWalls, findPath, nearestWp } from './world.js';

const AURUM_NAMES = ['Vega', 'Orion', 'Lyra', 'Nova'];
const FERRO_NAMES = ['Bastion', 'Rook', 'Havoc', 'Sable', 'Frost'];

function rand(a, b) { return a + Math.random() * (b - a); }

function losClear(from, to, world) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const dist = dir.length();
  if (dist < 0.01) return true;
  dir.normalize();
  const wall = rayWalls(from, dir, dist, world.colliders);
  return wall === null;
}

export class Bot {
  constructor(combatant, skill) {
    this.c = combatant;
    this.skill = skill; // 0.7 rookie .. 1.3 sharp
    this.path = [];
    this.pathIdx = 0;
    this.objective = 0;
    this.enemy = null;
    this.reaction = 0;
    this.burstLeft = 0;
    this.cooldown = 0;
    this.repath = 0;
    this.strafeDir = 1;
    this.strafeT = 0;
    this.holdT = rand(0, 2);
  }

  setObjective(nodeIdx) {
    this.objective = nodeIdx;
    this.repathNow();
  }

  repathNow() {
    const from = nearestWp(this.c.game.world.waypoints, this.c.pos);
    this.path = findPath(this.c.game.world.waypoints, from, this.objective);
    this.pathIdx = 0;
  }

  /** Nearest living enemy with line of sight inside 50 m. */
  perceive(game) {
    const eye = this.c.eyePos();
    let best = null;
    let bestD = Infinity;
    for (const e of game.combatants) {
      if (e.team === this.c.team || !e.alive) continue;
      const d = eye.distanceTo(e.eyePos());
      if (d > 50 || d >= bestD) continue;
      const chest = e.pos.clone();
      chest.y += 1.2;
      if (!losClear(eye, chest, game.world)) continue;
      best = e;
      bestD = d;
    }
    if (best && best !== this.enemy) {
      this.reaction = rand(0.35, 0.75) / this.skill;
      this.burstLeft = 0;
    }
    this.enemy = best;
    return best;
  }

  turnToward(targetYaw, dt, rate = 6) {
    let d = targetYaw - this.c.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = Math.max(-rate * dt, Math.min(rate * dt, d));
    this.c.yaw += step;
  }

  update(dt, game) {
    const c = this.c;
    if (!c.alive) return;
    this.cooldown -= dt;
    this.strafeT -= dt;

    // --- bomb duties first ---
    if (game.bomb.state === 'planted' && c.team === 'FERRO') {
      const site = game.world.sites[game.bomb.site];
      this.setObjective(game.bomb.site === 'A' ? 6 : 7);
      const dSite = Math.hypot(c.pos.x - site.center.x, c.pos.z - site.center.z);
      if (dSite < site.r * 0.8 && !this.enemy) {
        c.defusing += dt / 5;
        if (c.defusing >= 1) { game.defuseBomb(c); return; }
      } else {
        c.defusing = Math.max(0, c.defusing - dt / 2);
      }
    } else if (c.hasBomb && game.bomb.state === 'carried') {
      const site = game.world.sites[c.bombSite];
      const dSite = Math.hypot(c.pos.x - site.center.x, c.pos.z - site.center.z);
      if (dSite < site.r * 0.8 && !this.enemy) {
        c.planting += dt / 3;
        if (c.planting >= 1) { game.plantBomb(c.bombSite, c); return; }
      } else {
        c.planting = Math.max(0, c.planting - dt / 2);
      }
    }

    // --- perception ---
    const enemy = this.perceive(game);

    if (enemy) {
      // face the enemy and shoot in bursts
      const to = new THREE.Vector3().subVectors(enemy.pos, c.pos);
      const wantYaw = Math.atan2(-to.x, -to.z);
      this.turnToward(wantYaw, dt, 7);
      const dist = to.length();
      if (this.reaction > 0) {
        this.reaction -= dt;
      } else if (this.cooldown <= 0 && c.weapon.ammo > 0 && c.weapon.reloading <= 0) {
        if (this.burstLeft <= 0) {
          this.burstLeft = c.weapon.id === 'sniper' ? 1 : 3 + Math.floor(Math.random() * 3);
          this.cooldown = rand(0.25, 0.6);
        } else {
          this.burstLeft -= 1;
          const w = WEAPONS[c.weapon.id];
          const err = (0.02 + dist * 0.0011) / this.skill;
          const dir = new THREE.Vector3().subVectors(enemy.eyePos(), c.eyePos()).normalize();
          dir.x += (Math.random() - 0.5) * err * 2;
          dir.y += (Math.random() - 0.5) * err * 2 + (Math.random() < 0.12 ? 0.06 : 0);
          dir.z += (Math.random() - 0.5) * err * 2;
          dir.normalize();
          fireHitscan(c, dir, w.spread, game.ctx);
          c.weapon.ammo -= 1;
          this.cooldown = 60 / w.rpm;
          if (c.weapon.ammo <= 0) this.startReload();
        }
      }
      // strafe while duelling so fights are not statues
      if (this.strafeT <= 0) { this.strafeDir *= -1; this.strafeT = rand(0.5, 1.4); }
      if (dist > 6) c.move(0.25, this.strafeDir * 0.7, dt, game.world);
      else c.move(0, this.strafeDir * 0.8, dt, game.world);
      return;
    }

    // --- no enemy: walk the path ---
    if (c.weapon.reloading > 0) {
      c.weapon.reloading -= dt;
      if (c.weapon.reloading <= 0) {
        const w = WEAPONS[c.weapon.id];
        const need = w.mag - c.weapon.ammo;
        const take = Math.min(need, c.weapon.reserve);
        c.weapon.ammo += take;
        c.weapon.reserve -= take;
      }
    } else if (c.weapon.ammo === 0) {
      this.startReload();
    } else if (c.weapon.ammo < WEAPONS[c.weapon.id].mag * 0.3 && c.weapon.reserve > 0 && Math.random() < dt * 0.3) {
      this.startReload();
    }

    this.repath -= dt;
    if (this.repath <= 0) {
      this.repath = 4;
      const cur = nearestWp(game.world.waypoints, c.pos);
      if (this.path.length === 0 || this.path[this.path.length - 1] !== this.objective) {
        this.path = findPath(game.world.waypoints, cur, this.objective);
        this.pathIdx = 0;
      }
    }
    if (this.pathIdx < this.path.length) {
      const node = game.world.waypoints[this.path[this.pathIdx]].p;
      const dx = node.x - c.pos.x;
      const dz = node.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.9) {
        this.pathIdx += 1;
      } else {
        const wantYaw = Math.atan2(-dx, -dz);
        this.turnToward(wantYaw, dt, 5);
        // only walk when roughly facing the node
        let diff = wantYaw - c.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.9) c.move(1, 0, dt, game.world);
      }
    } else {
      // holding: slow scan
      this.holdT -= dt;
      if (this.holdT <= 0) {
        this.holdT = rand(1.5, 3.5);
        this.turnToward(c.yaw + rand(-1.2, 1.2), dt, 8);
      }
    }
  }

  startReload() {
    const w = WEAPONS[this.c.weapon.id];
    if (this.c.weapon.reserve <= 0 || this.c.weapon.ammo >= w.mag) return;
    this.c.weapon.reloading = w.reload;
  }
}

export function makeBots(game) {
  const bots = [];
  AURUM_NAMES.forEach((n, i) => {
    const c = new Combatant('AURUM', n, false);
    c.game = game;
    game.scene.add(c.mesh);
    bots.push(new Bot(c, 0.75 + i * 0.12));
  });
  FERRO_NAMES.forEach((n, i) => {
    const c = new Combatant('FERRO', n, false);
    c.game = game;
    game.scene.add(c.mesh);
    bots.push(new Bot(c, 0.8 + i * 0.1));
  });
  return bots;
}
