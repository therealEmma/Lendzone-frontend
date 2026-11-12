import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_LAYOUT, WORLD } from '../../backend/shared/types.js';
import { circleHitsPlayer, segmentHitsPlatform, stepPlayer } from '../../backend/server/physics.js';

function player() {
  return { x: 300, y: 400, vx: 0, vy: 0, grounded: false, fuel: WORLD.maxFuel, jetpacking: false };
}

test('gravity pulls a player downward', () => {
  const p = player();
  stepPlayer(p, { left: false, right: false, jump: false, jetpack: false }, 1 / 30);
  assert.ok(p.y > 400);
  assert.ok(p.vy > 0);
});

test('player lands on a platform and becomes grounded', () => {
  const p = { ...player(), x: 200, y: 880, vy: 500 };
  for (let i = 0; i < 20; i += 1) stepPlayer(p, { left: false, right: false, jump: false, jetpack: false }, 1 / 30);
  assert.equal(p.grounded, true);
  assert.equal(p.y, 965 - WORLD.playerHeight);
});

test('jump and jetpack consume fuel while flight is active', () => {
  const p = { ...player(), y: 1080, grounded: true };
  stepPlayer(p, { left: false, right: false, jump: true, jetpack: false }, 1 / 30);
  assert.ok(p.vy < 0);
  const before = p.fuel;
  stepPlayer(p, { left: false, right: false, jump: false, jetpack: true }, 1 / 30);
  assert.ok(p.fuel < before);
  assert.equal(p.jetpacking, true);
});

test('fuel recharges when grounded', () => {
  const p = { ...player(), y: 1080, grounded: true, fuel: 20 };
  stepPlayer(p, { left: false, right: false, jump: false, jetpack: false }, 1 / 30);
  assert.ok(p.fuel > 20);
});

test('projectile segment collides with platforms but not open air', () => {
  assert.equal(segmentHitsPlatform(200, 900, 200, 1010, PLATFORM_LAYOUT), true);
  assert.equal(segmentHitsPlatform(200, 900, 300, 900, PLATFORM_LAYOUT), false);
});

test('projectile circle collides with a player rectangle', () => {
  assert.equal(circleHitsPlayer(320, 430, 5, { x: 300, y: 400 }), true);
  assert.equal(circleHitsPlayer(500, 430, 5, { x: 300, y: 400 }), false);
});
