// world.js — MERIDIAN foundry yard: two bombsites, three lanes, crates for cover.
// Collision is AABBs only; movement slides axis by axis. All coordinates are in
// metres: x east, z south, north is -z. Site A is north-west, site B north-east.
import * as THREE from 'three';
import { COLORS, mat, letterTexture } from './palette.js';

const GROUND_W = 72; // x: -36..36
const GROUND_D = 56; // z: -28..28
const WALL_H = 4.5;

function aabb(cx, cz, w, d, h) {
  return {
    min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
    max: new THREE.Vector3(cx + w / 2, h, cz + d / 2),
  };
}

/** Segment (origin + t*dir) vs one AABB, slab method. Returns t or Infinity. */
export function rayAABB(origin, dir, maxDist, box) {
  let tmin = 0;
  let tmax = maxDist;
  for (const ax of ['x', 'y', 'z']) {
    const o = origin[ax];
    const d = dir[ax];
    const lo = box.min[ax];
    const hi = box.max[ax];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

/** Nearest wall hit along a ray, or null. */
export function rayWalls(origin, dir, maxDist, colliders) {
  let best = Infinity;
  for (const c of colliders) {
    const t = rayAABB(origin, dir, maxDist, c);
    if (t < best) best = t;
  }
  return best === Infinity ? null : { t: best };
}

/**
 * Move a circle (radius r, standing 0..1.8 high) by (dx, dz), sliding on walls.
 * Axes are tried separately so the fighter slides along a wall instead of sticking.
 */
export function collideMove(pos, dx, dz, radius, colliders) {
  const blocked = (x, z) => {
    for (const c of colliders) {
      if (x + radius < c.min.x || x - radius > c.max.x) continue;
      if (z + radius < c.min.z || z - radius > c.max.z) continue;
      if (c.max.y <= 0.05 || c.min.y >= 1.8) continue;
      return true;
    }
    return false;
  };
  const nx = pos.x + dx;
  if (!blocked(nx, pos.z)) pos.x = nx;
  const nz = pos.z + dz;
  if (!blocked(pos.x, nz)) pos.z = nz;
  // keep inside the yard
  pos.x = Math.max(-35, Math.min(35, pos.x));
  pos.z = Math.max(-27, Math.min(27, pos.z));
}

export function buildWorld(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  const addBox = (cx, cz, w, d, h, color, opts = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color, opts));
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    if (!opts.noCollide) colliders.push(aabb(cx, cz, w, d, h));
    return mesh;
  };

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_W, GROUND_D),
    mat(COLORS.ground),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  // painted lane lines on the ground (thin, no collision)
  const line = (cx, cz, w, d, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.02, cz);
    group.add(m);
  };
  line(0, -18, 52, 0.3, COLORS.groundLine);
  line(-14, 0, 0.3, 44, COLORS.groundLine);
  line(14, 0, 0.3, 44, COLORS.groundLine);

  // perimeter walls
  addBox(0, -28.5, GROUND_W + 2, 1, WALL_H, COLORS.wall);
  addBox(0, 28.5, GROUND_W + 2, 1, WALL_H, COLORS.wall);
  addBox(-36.5, 0, 1, GROUND_D + 2, WALL_H, COLORS.wall);
  addBox(36.5, 0, 1, GROUND_D + 2, WALL_H, COLORS.wall);

  // lane divider walls (west/east), leaving a mid-west / mid-east gap
  addBox(-14, -20, 1, 16, WALL_H, COLORS.wallTop);
  addBox(14, -20, 1, 16, WALL_H, COLORS.wallTop);
  addBox(-14, 16, 1, 14, 3.2, COLORS.wall);
  addBox(14, 16, 1, 14, 3.2, COLORS.wall);

  // mid block + mid crates
  addBox(0, -6, 8, 4, 3, COLORS.wallTop);
  addBox(-6, 6, 3, 3, 1.4, COLORS.crate);
  addBox(6, 6, 3, 3, 1.4, COLORS.crate);
  addBox(0, 12, 4, 2, 1.2, COLORS.crateDark);

  // site A (north-west) cover
  addBox(-26, -20, 4, 2, 1.5, COLORS.crate);
  addBox(-20, -14, 2, 2, 1.2, COLORS.crateDark);
  addBox(-28, -10, 2, 4, 2.2, COLORS.barrel, { emissive: 0x300a06 });
  addBox(-18, -24, 3, 3, 1.4, COLORS.crate);
  // site B (north-east) cover, mirrored
  addBox(26, -20, 4, 2, 1.5, COLORS.crate);
  addBox(20, -14, 2, 2, 1.2, COLORS.crateDark);
  addBox(28, -10, 2, 4, 2.2, COLORS.barrel, { emissive: 0x300a06 });
  addBox(18, -24, 3, 3, 1.4, COLORS.crate);

  // south cover near attacker spawn (kept clear of the centre spawn lane)
  addBox(-8, 18, 3, 2, 1.3, COLORS.crate);
  addBox(8, 18, 3, 2, 1.3, COLORS.crate);
  addBox(-13, 21, 2, 2, 1.1, COLORS.crateDark);

  // site pads (glowing circles) + floating letters
  const sites = {
    A: { center: new THREE.Vector3(-24, 0, -18), r: 6, color: COLORS.siteA },
    B: { center: new THREE.Vector3(24, 0, -18), r: 6, color: COLORS.siteB },
  };
  for (const [key, s] of Object.entries(sites)) {
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(s.r, 32),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.28 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(s.center.x, 0.03, s.center.z);
    group.add(pad);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.center.x, 0.04, s.center.z);
    group.add(ring);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshBasicMaterial({ map: letterTexture(key, '#ffffff', '#14181f'), transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(s.center.x, 5.2, s.center.z - 5.5);
    group.add(sign);
    s.pad = pad;
    s.sign = sign;
  }

  // spawns — attackers south facing north (yaw 0), defenders north facing south
  const spawns = {
    attack: [
      { x: -6, z: 23, yaw: 0 },
      { x: -2, z: 24, yaw: 0 },
      { x: 2, z: 24, yaw: 0 },
      { x: 6, z: 23, yaw: 0 },
      { x: 0, z: 21, yaw: 0 },
    ],
    defend: [
      { x: -20, z: -22, yaw: Math.PI },
      { x: -8, z: -24, yaw: Math.PI },
      { x: 0, z: -22, yaw: Math.PI },
      { x: 8, z: -24, yaw: Math.PI },
      { x: 20, z: -22, yaw: Math.PI },
    ],
  };

  // waypoint graph (BFS in bots.js). Nodes: [x, z, neighbours]
  const wpDef = [
    [0, 23, [1, 10, 11]], // 0 attacker spawn
    [0, 12, [0, 2, 10, 11]], // 1 mid-south
    [0, 0, [1, 3, 10, 11]], // 2 mid
    [0, -12, [2, 4, 5, 12]], // 3 mid-north
    [-14, -6, [2, 6, 12]], // 4 west connector
    [14, -6, [2, 7, 12]], // 5 east connector
    [-24, -18, [4, 8, 12]], // 6 site A
    [24, -18, [5, 9, 12]], // 7 site B
    [-28, -8, [4, 6]], // 8 A west flank
    [28, -8, [5, 7]], // 9 B east flank
    [-20, 8, [0, 1, 2, 4]], // 10 west lane
    [20, 8, [0, 1, 2, 5]], // 11 east lane
    [0, -22, [3, 4, 5, 6, 7]], // 12 defender spawn
    [-18, -22, [6, 12]], // 13 A hold
    [18, -22, [7, 12]], // 14 B hold
  ];
  const waypoints = wpDef.map(([x, z, n]) => ({
    p: new THREE.Vector3(x, 0, z),
    n,
  }));

  return {
    colliders,
    sites,
    spawns,
    waypoints,
    bounds: { minX: -35, maxX: 35, minZ: -27, maxZ: 27 },
  };
}

/** BFS over the waypoint graph; returns node indices from `from` to `to`. */
export function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const q = [from];
  prev[from] = from;
  while (q.length > 0) {
    const cur = q.shift();
    for (const nb of waypoints[cur].n) {
      if (prev[nb] !== -1) continue;
      prev[nb] = cur;
      if (nb === to) {
        const path = [to];
        let c = to;
        while (c !== from) { c = prev[c]; path.unshift(c); }
        return path;
      }
      q.push(nb);
    }
  }
  return [to];
}

export function nearestWp(waypoints, pos) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const dx = waypoints[i].p.x - pos.x;
    const dz = waypoints[i].p.z - pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
