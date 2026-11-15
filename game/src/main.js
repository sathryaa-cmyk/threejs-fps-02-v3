// main.js — MERIDIAN: 5v5 tactical FPS. Round loop (buy → live → end),
// bomb plant/defuse, economy, killfeed, spectating, and ?shot= staging
// for screenshots. Seeded with ?seed= for deterministic shots.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Combatant } from './player.js';
import { Bot, makeBots } from './bots.js';
import { WEAPONS, makeLoadout, fireHitscan } from './weapons.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { Effects } from './effects.js';
import { COLORS } from './palette.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = new URLSearchParams(location.search);
const SEED = params.has('seed') ? parseInt(params.get('seed'), 10) || 1 : (Math.random() * 1e9) | 0;
Math.random = mulberry32(SEED);
const SHOT = params.get('shot'); // start | buy | play | end
const AUTO = params.has('auto');

const BUY_TIME = 12;
const ROUND_TIME = 100;
const FUSE_TIME = 40;
const WIN_ROUNDS = 8;

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.capabilities.isWebGL2) {
      document.getElementById('nogl').style.display = 'block';
      throw new Error('WebGL2 required');
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.sky);
    this.scene.fog = new THREE.Fog(COLORS.fog, 30, 90);
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x565d68, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.0);
    sun.position.set(18, 30, 12);
    this.scene.add(sun);

    this.world = buildWorld(this.scene);
    this.effects = new Effects(this.scene);
    this.sfx = new Sfx();
    this.hud = new HUD();
    this.input = new Input(this.canvas);

    this.player = new Combatant('AURUM', 'You', true);
    this.player.game = this;
    this.scene.add(this.player.mesh);
    this.bots = makeBots(this);
    this.combatants = [this.player, ...this.bots.map((b) => b.c)];
    this.ctx = { world: this.world, combatants: this.combatants, effects: this.effects, sfx: this.sfx, hud: this.hud, player: this.player };
    // autopilot drives the player with the same AI as a bot (headless playthrough)
    this.autoBot = null;
    if (AUTO) {
      this.autoBot = new Bot(this.player, 1.0);
      this.autoBot.c.game = this;
    }

    this.bomb = { state: 'carried', site: null, carrier: null, timer: 0 };
    this.bombMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 0.35),
      new THREE.MeshLambertMaterial({ color: 0x1c2129, emissive: COLORS.bombLight, emissiveIntensity: 0.9 }),
    );
    this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);

    this.state = 'buy';
    this.stateT = BUY_TIME;
    this.round = 1;
    this.score = { AURUM: 0, FERRO: 0 };
    this.fireT = 0;
    this.prevMouse = false;
    this.bloom = 0;
    this.spectate = null;
    this.deadSeen = new Set();
    this.clock = new THREE.Clock();
    this.shotReady = false;
    this.shotT = 0;
    this.stagedBanner = false; // staged 'end' shot: keep the banner up for the photo

    this.input.onKey = (code) => this.onKey(code);
    this.hud.onBuy = (id) => this.buyItem(id);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.startRound();
    if (SHOT) this.stageShot(SHOT);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---- round lifecycle ----
  startRound() {
    this.state = 'buy';
    this.stateT = BUY_TIME;
    this.bomb = { state: 'carried', site: null, carrier: null, timer: 0 };
    this.bombMesh.visible = false;
    // spawn everybody
    const atk = [...this.world.spawns.attack];
    const def = [...this.world.spawns.defend];
    const attackers = this.combatants.filter((c) => c.team === 'AURUM');
    const defenders = this.combatants.filter((c) => c.team === 'FERRO');
    attackers.forEach((c, i) => {
      const s = atk[i % atk.length];
      c.spawn(s.x, s.z, s.yaw);
      c.weapon = makeLoadout(c.weapon.id === 'pistol' ? 'pistol' : c.weapon.id);
      c.weapon.ammo = WEAPONS[c.weapon.id].mag;
      c.weapon.reserve = WEAPONS[c.weapon.id].reserve;
    });
    defenders.forEach((c, i) => {
      const s = def[i % def.length];
      c.spawn(s.x, s.z, s.yaw);
      c.weapon = makeLoadout(c.weapon.id === 'pistol' ? 'pistol' : c.weapon.id);
      c.weapon.ammo = WEAPONS[c.weapon.id].mag;
      c.weapon.reserve = WEAPONS[c.weapon.id].reserve;
    });
    // bomb carrier: random attacker; site fixed per round (alternate)
    const carrier = attackers[Math.floor(Math.random() * attackers.length)];
    carrier.hasBomb = true;
    carrier.bombSite = this.round % 2 === 1 ? 'A' : 'B';
    carrier.updateBombMesh();
    this.bomb.carrier = carrier;
    // bot objectives
    for (const b of this.bots) {
      if (b.c.team === 'AURUM') {
        b.setObjective(carrier.bombSite === 'A' ? 6 : 7);
      } else {
        const holds = [13, 3, 12, 14, 3];
        b.setObjective(holds[this.bots.indexOf(b) % holds.length]);
      }
      // bots buy rifles when they can afford them
      if (b.c.money >= 2700 && b.c.weapon.id === 'pistol') b.c.buy('rifle');
      else if (b.c.money >= 1500 && b.c.weapon.id === 'pistol') b.c.buy('smg');
    }
    this.spectate = null;
    this.hud.hideDeath();
    this.hud.setScore(this.score.AURUM, this.score.FERRO, this.round);
    this.hud.setBomb('carried', 0, null);
    if (carrier.isPlayer) this.hud.setBomb('carried', 0, null);
    this.hud.banner(`ROUND ${this.round}`, carrier.isPlayer ? 'You carry the bomb — plant at site ' + carrier.bombSite : `${carrier.name} carries the bomb — push site ${carrier.bombSite}`);
    this.hud.showBuy(this.player.money);
    this.hud.showHelp(true);
  }

  beginLive() {
    this.state = 'live';
    this.stateT = ROUND_TIME;
    this.hud.hideBuy();
    this.hud.showHelp(false);
    this.hud.banner('GO — ROUND LIVE', 'Eliminate FERRO or plant the bomb');
  }

  endRound(winner, reason) {
    if (this.state === 'end' || this.state === 'match') return;
    this.state = 'end';
    this.stateT = 4.5;
    this.score[winner] += 1;
    for (const c of this.combatants) {
      c.money += c.team === winner ? 3250 : 1900;
      c.money = Math.min(c.money, 16000);
    }
    this.hud.setScore(this.score.AURUM, this.score.FERRO, this.round);
    this.hud.setBomb('gone', 0, null);
    this.hud.setPlant(null, 0);
    this.hud.banner(
      winner === 'AURUM' ? '★ AURUM WINS THE ROUND' : '◆ FERRO WINS THE ROUND',
      reason,
    );
    if (winner === 'AURUM') this.sfx.roundWin(); else this.sfx.roundLose();
    if (this.score[winner] >= WIN_ROUNDS || this.round >= 15) {
      this.state = 'match';
      this.hud.banner(
        this.score.AURUM > this.score.FERRO ? '★ AURUM WINS THE MATCH' : '◆ FERRO WINS THE MATCH',
        `Final score ${this.score.AURUM} — ${this.score.FERRO}`,
      );
    }
  }

  plantBomb(site, by) {
    this.bomb.state = 'planted';
    this.bomb.site = site;
    this.bomb.timer = FUSE_TIME;
    if (this.bomb.carrier) {
      this.bomb.carrier.hasBomb = false;
      this.bomb.carrier.updateBombMesh();
      this.bomb.carrier.planting = 0;
    }
    const s = this.world.sites[site];
    this.bombMesh.position.set(s.center.x, 0.3, s.center.z);
    this.bombMesh.visible = true;
    this.hud.banner('💣 BOMB PLANTED', `Site ${site} — FERRO must defuse in ${FUSE_TIME}s`);
    this.sfx.plant();
    this.hud.setBomb('planted', FUSE_TIME, site);
  }

  defuseBomb(by) {
    this.bomb.state = 'gone';
    this.bombMesh.visible = false;
    this.sfx.defuse();
    this.endRound('FERRO', `${by.name} defused the bomb`);
  }

  explodeBomb() {
    this.bomb.state = 'gone';
    this.bombMesh.visible = false;
    const s = this.world.sites[this.bomb.site];
    this.effects.addBlast(s.center);
    this.sfx.explosion();
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - s.center.x, c.pos.z - s.center.z);
      if (d < 12) c.takeDamage(500, null);
    }
    this.endRound('AURUM', 'The bomb detonated on site ' + this.bomb.site);
  }

  // ---- player actions ----
  onKey(code) {
    if (code === 'KeyB' && this.state === 'buy') {
      if (this.hud.buyOpen) this.hud.hideBuy(); else this.hud.showBuy(this.player.money);
    }
    if (code === 'KeyR') this.startReload();
    if (this.hud.buyOpen && this.state === 'buy') {
      const map = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'sniper', Digit5: 'armor' };
      if (map[code]) this.buyItem(map[code]);
    }
  }

  buyItem(id) {
    if (this.state !== 'buy') return;
    let ok = false;
    if (id === 'armor') ok = this.player.buyArmor();
    else ok = this.player.buy(id);
    if (ok) {
      this.sfx.click();
      this.hud.setMoney(this.player.money);
      this.hud.showBuy(this.player.money);
    }
  }

  startReload() {
    const p = this.player;
    const w = WEAPONS[p.weapon.id];
    if (!p.alive || p.weapon.reloading > 0 || p.weapon.ammo >= w.mag || p.weapon.reserve <= 0) return;
    p.weapon.reloading = w.reload;
  }

  // ---- per-frame ----
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.effects.update(dt);
    // camera
    if (this.player.alive) {
      this.camera.position.copy(this.player.eyePos());
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    } else if (this.spectate && this.spectate.alive) {
      this.camera.position.copy(this.spectate.eyePos());
      this.camera.rotation.set(this.spectate.pitch || 0, this.spectate.yaw, 0, 'YXZ');
    }
    this.renderer.render(this.scene, this.camera);
    if (SHOT && !this.shotReady) {
      this.shotT += dt;
      if (this.stagedBanner) {
        // headless SwiftShader runs few fps, so the 3.2 s banner fade can
        // beat the screenshot: hold it up until the photo is taken.
        this.hud.el.banner.style.opacity = '1';
        this.hud.el['banner-sub'].style.opacity = '1';
      }
      if (this.shotT > 1.6) {
        this.shotReady = true;
        window.__shotReady = true;
      }
    }
  }

  update(dt) {
    // state timers
    if (this.state === 'buy') {
      this.stateT -= dt;
      this.hud.setTimer(this.stateT);
      if (this.stateT <= 0) this.beginLive();
    } else if (this.state === 'live') {
      this.stateT -= dt;
      this.hud.setTimer(this.stateT);
      if (this.bomb.state === 'planted') {
        this.bomb.timer -= dt;
        this.hud.setBomb('planted', this.bomb.timer, this.bomb.site);
        if (this.bomb.timer <= 10 && this.bomb.timer + dt > 10) this.sfx.beep();
        if (this.bomb.timer <= 0) { this.explodeBomb(); }
      }
      if (this.stateT <= 0 && this.state === 'live') this.endRound('FERRO', 'Time expired — bomb never detonated');
    } else if (this.state === 'end') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.round += 1;
        this.startRound();
      }
    }

    // player control (alive + live round; buy phase: frozen)
    const p = this.player;
    if (p.alive && this.state === 'live') {
      if (this.autoBot) {
        this.autoBot.update(dt, this);
      } else {
        const look = this.input.consumeLook();
        p.yaw -= look.dx * 0.0022;
        p.pitch -= look.dy * 0.0022;
        p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
        const mv = this.input.moveAxis();
        p.move(mv.z, mv.x, dt, this.world);
        this.handleShooting(dt);
        this.handlePlant(dt);
      }
      this.bloom = Math.max(0, this.bloom - dt * 6);
      this.hud.setCrosshair(this.bloom * 26);
    } else {
      this.input.consumeLook();
    }
    // reload progress
    if (p.weapon.reloading > 0) {
      p.weapon.reloading -= dt;
      if (p.weapon.reloading <= 0) {
        const w = WEAPONS[p.weapon.id];
        const need = w.mag - p.weapon.ammo;
        const take = Math.min(need, p.weapon.reserve);
        p.weapon.ammo += take;
        p.weapon.reserve -= take;
      }
    }
    // bots
    if (this.state === 'live' || this.state === 'buy') {
      for (const b of this.bots) {
        if (this.state === 'live') b.update(dt, this);
        b.c.updateMesh(dt);
      }
    }
    // deaths → killfeed + economy + spectate
    for (const c of this.combatants) {
      if (!c.alive && !this.deadSeen.has(c.id)) {
        this.deadSeen.add(c.id);
        const killer = c.lastAttacker;
        if (killer) {
          killer.money = Math.min(16000, killer.money + 300);
          this.hud.killfeed(killer.name, c.name, WEAPONS[killer.weapon.id].name, c.lastHitHead);
          if (killer.isPlayer) this.sfx.kill();
        }
        if (c.isPlayer) {
          this.spectate = this.combatants.find((t) => t.team === 'AURUM' && t.alive && !t.isPlayer) || null;
          this.hud.showDeath(this.spectate ? `You are down — spectating ${this.spectate.name}` : 'Your whole team is down');
        }
      }
      if (c.alive) this.deadSeen.delete(c.id);
    }
    // round end by elimination
    if (this.state === 'live') {
      const aAlive = this.combatants.some((c) => c.team === 'AURUM' && c.alive);
      const fAlive = this.combatants.some((c) => c.team === 'FERRO' && c.alive);
      if (this.bomb.state !== 'planted') {
        if (!aAlive) this.endRound('FERRO', 'AURUM eliminated');
        else if (!fAlive) this.endRound('AURUM', 'FERRO eliminated');
      } else if (!fAlive) {
        this.endRound('AURUM', 'FERRO eliminated — bomb still ticking');
      }
    }
    // HUD
    this.hud.setHealth(p.health, p.armor);
    this.hud.setAmmo(p.weapon.ammo, p.weapon.reserve, p.weapon.reloading);
    this.hud.setMoney(p.money);
    // site label under the player
    let site = '';
    for (const [k, s] of Object.entries(this.world.sites)) {
      if (Math.hypot(p.pos.x - s.center.x, p.pos.z - s.center.z) < s.r) site = `SITE ${k}`;
    }
    if (!site) {
      if (Math.abs(p.pos.x) < 12 && p.pos.z > -12 && p.pos.z < 12) site = 'MID';
      else if (p.pos.z < -12) site = 'NORTH';
      else site = 'SOUTH';
    }
    this.hud.setSiteLabel(site + (p.hasBomb ? ' · 💣 BOMB' : ''));
    if (this.bomb.state === 'planted') this.hud.setBomb('planted', this.bomb.timer, this.bomb.site);
    else if (p.hasBomb) this.hud.setBomb('carried', 0, null);
    else this.hud.setBomb('gone', 0, null);
  }

  handleShooting(dt) {
    const p = this.player;
    this.fireT -= dt;
    const w = WEAPONS[p.weapon.id];
    const wantFire = w.auto ? this.input.mouseDown : (this.input.mouseDown && !this.prevMouse);
    this.prevMouse = this.input.mouseDown;
    if (wantFire && this.fireT <= 0 && p.weapon.ammo > 0 && p.weapon.reloading <= 0) {
      this.fireT = 60 / w.rpm;
      p.weapon.ammo -= 1;
      this.bloom = Math.min(1, this.bloom + (w.id === 'sniper' ? 0.9 : 0.25));
      fireHitscan(p, p.aimDir(), w.spread + this.bloom * 0.02, this.ctx);
      if (p.weapon.ammo === 0) this.startReload();
    }
  }

  handlePlant(dt) {
    const p = this.player;
    if (!p.hasBomb || this.bomb.state !== 'carried') {
      p.planting = 0;
      this.hud.setPlant(null, 0);
      return;
    }
    const site = this.world.sites[p.bombSite];
    const inSite = Math.hypot(p.pos.x - site.center.x, p.pos.z - site.center.z) < site.r * 0.8;
    if (inSite && this.input.down('KeyE')) {
      p.planting += dt / 3;
      this.hud.setPlant(`PLANTING BOMB — SITE ${p.bombSite}`, p.planting);
      if (p.planting >= 1) {
        this.hud.setPlant(null, 0);
        this.plantBomb(p.bombSite, p);
      }
    } else {
      p.planting = Math.max(0, p.planting - dt / 2);
      this.hud.setPlant(null, 0);
    }
  }

  // ---- screenshot staging (?shot=) ----
  stageShot(shot) {
    const set = (x, z, yaw, pitch = 0) => {
      this.player.pos.set(x, 0, z);
      this.player.yaw = yaw;
      this.player.pitch = pitch;
      this.player.mesh.position.copy(this.player.pos);
    };
    if (shot === 'start') {
      set(-10, 20, -0.3);
      this.hud.hideBuy();
      this.hud.showHelp(true);
    } else if (shot === 'buy') {
      set(-10, 20, -0.3);
      this.hud.showBuy(this.player.money);
    } else if (shot === 'play') {
      this.beginLive();
      this.player.buy('rifle');
      set(-6, 16, -0.36);
      const ferro = this.combatants.filter((c) => c.team === 'FERRO');
      ferro[0].spawn(0, -2, Math.PI);
      ferro[1].spawn(4, -6, Math.PI);
      ferro[2].spawn(-2, 4, Math.PI);
      const mate = this.combatants.find((c) => c.team === 'AURUM' && !c.isPlayer);
      mate.spawn(-3, 12, 0);
      // a visible tracer right away
      setTimeout(() => {
        if (ferro[0].alive) {
          const from = ferro[0].eyePos();
          const to = this.player.eyePos().clone();
          to.y -= 0.3;
          this.effects.addTracer(from, to, 0x8fc4ff);
        }
      }, 400);
    } else if (shot === 'end') {
      this.score = { AURUM: 3, FERRO: 2 };
      this.round = 6;
      this.hud.hideBuy();
      this.hud.setTimer(0);
      set(-8, 10, -0.5);
      this.hud.setScore(3, 2, 6);
      this.endRound('AURUM', 'FERRO eliminated');
      this.state = 'end';
      this.stateT = 99;
      this.stagedBanner = true;
    }
  }
}

try {
  window.__game = new Game();
} catch (err) {
  console.error(err);
  const el = document.getElementById('fatal');
  if (el) {
    el.style.display = 'block';
    el.textContent = 'MERIDIAN failed to start: ' + err.message;
  }
}
