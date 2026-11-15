// effects.js — tracers, muzzle flashes, impact sparks. Small pooled sets,
// faded out over their lifetime, nothing allocated per frame in the loop.
import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.sparks = [];
    this.flashes = [];
  }

  addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, m);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  addFlash(pos, dir) {
    const geo = new THREE.SphereGeometry(0.09, 6, 6);
    const m = new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 });
    const s = new THREE.Mesh(geo, m);
    s.position.copy(pos).addScaledVector(dir, 0.55);
    this.scene.add(s);
    this.flashes.push({ mesh: s, life: 0.05 });
  }

  addSparks(pos, color, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 0.25,
        pos.y + (Math.random() - 0.5) * 0.25,
        pos.z + (Math.random() - 0.5) * 0.25,
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.PointsMaterial({ color, size: 0.09, transparent: true, opacity: 1 });
    const p = new THREE.Points(geo, m);
    this.scene.add(p);
    this.sparks.push({ points: p, life: 0.28, vel: new THREE.Vector3(0, 0.6, 0) });
  }

  /** Expanding shockwave ring for the bomb. */
  addBlast(pos) {
    const geo = new THREE.SphereGeometry(1, 20, 14);
    const m = new THREE.MeshBasicMaterial({ color: 0xff7a2e, transparent: true, opacity: 0.55, wireframe: true });
    const s = new THREE.Mesh(geo, m);
    s.position.copy(pos);
    s.position.y = 0.6;
    this.scene.add(s);
    this.flashes.push({ mesh: s, life: 0.8, blast: true });
  }

  update(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      } else {
        t.line.material.opacity = t.life / 0.09;
      }
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.flashes.splice(i, 1);
      } else if (f.blast) {
        const k = 1 + (0.8 - f.life) * 22;
        f.mesh.scale.setScalar(k);
        f.mesh.material.opacity = f.life / 0.8;
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scene.remove(s.points);
        s.points.geometry.dispose();
        s.points.material.dispose();
        this.sparks.splice(i, 1);
      } else {
        s.points.position.addScaledVector(s.vel, dt);
        s.points.material.opacity = s.life / 0.28;
      }
    }
  }
}
