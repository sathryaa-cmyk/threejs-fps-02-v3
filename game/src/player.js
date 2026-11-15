// player.js — one fighter, human or bot. A simple blocky soldier: torso, head,
// helmet, gun. The same class drives the player and all nine bots.
import * as THREE from 'three';
import { COLORS, mat } from './palette.js';
import { WEAPONS, makeLoadout } from './weapons.js';
import { collideMove } from './world.js';

let NEXT_ID = 1;

export class Combatant {
  constructor(team, name, isPlayer) {
    this.id = NEXT_ID++;
    this.team = team; // 'AURUM' (attack) or 'FERRO' (defend)
    this.name = name;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.money = 800;
    this.kills = 0;
    this.deaths = 0;
    this.weapon = makeLoadout('pistol');
    this.speed = 5.2;
    this.radius = 0.45;
    this.eyeHeight = 1.62;
    this.hasBomb = false;
    this.bombSite = null;
    this.planting = 0; // 0..1 progress
    this.defusing = 0;
    this.lastAttacker = null;
    this.lastHitHead = false;
    this.flash = 0; // hit flash timer for the mesh
    this.mesh = this.buildMesh();
  }

  buildMesh() {
    const teamColor = this.team === 'AURUM' ? COLORS.aurum : COLORS.ferro;
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), mat(teamColor));
    torso.position.y = 1.05;
    g.add(torso);
    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.3, 0.4),
      mat(this.team === 'AURUM' ? COLORS.aurumDark : COLORS.ferroDark),
    );
    vest.position.y = 1.12;
    g.add(vest);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mat(0xc9a06c));
    head.position.y = 1.62;
    g.add(head);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), mat(0x2e343c));
    helmet.position.y = 1.8;
    g.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.05), mat(0x11161f));
    visor.position.set(0, 1.62, 0.19);
    g.add(visor);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.85), mat(0x1c2129));
    gun.position.set(0.28, 1.25, 0.35);
    g.add(gun);
    // bomb pack on the carrier's back
    this.bombMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.18), mat(COLORS.bomb));
    this.bombMesh.position.set(0, 1.15, -0.28);
    this.bombMesh.visible = false;
    g.add(this.bombMesh);
    g.visible = false;
    return g;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.planting = 0;
    this.defusing = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = yaw;
    this.updateBombMesh();
  }

  eyePos() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  aimDir() {
    return new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );
  }

  updateBombMesh() {
    this.bombMesh.visible = this.hasBomb && this.alive;
  }

  takeDamage(amount, from, head = false) {
    if (!this.alive) return;
    this.health -= amount;
    this.flash = 0.12;
    this.lastAttacker = from;
    this.lastHitHead = head;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.mesh.visible = false;
      this.deaths += 1;
      if (from) from.kills += 1;
    }
  }

  /** Move with wall sliding. `forward`/`strafe` are -1..1 in facing space. */
  move(forward, strafe, dt, world) {
    if (!this.alive) return;
    const w = WEAPONS[this.weapon.id];
    const sp = this.speed * w.move;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const dx = (-sin * forward + cos * strafe) * sp * dt;
    const dz = (-cos * forward - sin * strafe) * sp * dt;
    collideMove(this.pos, dx, dz, this.radius, world.colliders);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
  }

  updateMesh(dt) {
    if (!this.alive) return;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (this.flash > 0) {
      this.flash -= dt;
      const s = 1 + Math.max(0, this.flash) * 0.8;
      this.mesh.scale.setScalar(s);
    } else {
      this.mesh.scale.setScalar(1);
    }
  }

  buy(id) {
    const w = WEAPONS[id];
    if (!w || this.money < w.price) return false;
    if (this.weapon.id === id) return false;
    this.money -= w.price;
    this.weapon = makeLoadout(id);
    return true;
  }

  buyArmor() {
    if (this.armor >= 100 || this.money < 650) return false;
    this.money -= 650;
    this.armor = 100;
    return true;
  }
}
