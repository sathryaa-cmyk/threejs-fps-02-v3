// palette.js — MERIDIAN's colours and material helpers.
// All materials are cheap Lambert so the game stays fast on SwiftShader too.
import * as THREE from 'three';

export const COLORS = {
  // teams
  aurum: 0xd9a441, // attackers — amber/gold
  aurumDark: 0x8a6420,
  ferro: 0x4a7fb5, // defenders — steel blue
  ferroDark: 0x2c4d70,
  // map
  ground: 0x3a3f45,
  groundLine: 0x2c3138,
  wall: 0x6b7280,
  wallTop: 0x8b93a1,
  crate: 0x9a7b4f,
  crateDark: 0x6e5636,
  barrel: 0xb0433a,
  siteA: 0x3fae6a,
  siteB: 0xc96a2e,
  mid: 0x7a6bb0,
  sky: 0x1c2739,
  fog: 0x1c2739,
  // fx
  tracerAurum: 0xffd27a,
  tracerFerro: 0x8fc4ff,
  spark: 0xffc861,
  muzzle: 0xffe9a8,
  bomb: 0xff4d3d,
  bombLight: 0xff2d1e,
};

const cache = new Map();

/** Shared Lambert material per colour (flat colours read well at distance). */
export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.transparent ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshLambertMaterial({
    color,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  cache.set(key, m);
  return m;
}

/** A canvas texture with a big letter on a dark plate (site signs, spawn marks). */
export function letterTexture(letter, fg = '#ffffff', bg = '#1c2129') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = fg;
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 138);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
