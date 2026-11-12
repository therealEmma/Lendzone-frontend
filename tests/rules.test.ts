import test from 'node:test';
import assert from 'node:assert/strict';
import { addDamage, addDeath, addKill, applyDamage, isRespawnDue, remainingMatchMs } from '../../backend/shared/rules.js';

test('damage clamps at zero and never increases health', () => {
  assert.equal(applyDamage(100, 20), 80);
  assert.equal(applyDamage(10, 50), 0);
  assert.equal(applyDamage(40, -20), 40);
});

test('score helpers track damage, kills, and deaths immutably', () => {
  const score = { kills: 0, deaths: 0, damage: 0 };
  assert.deepEqual(addDamage(score, 40), { kills: 0, deaths: 0, damage: 40 });
  assert.deepEqual(addKill(score), { kills: 1, deaths: 0, damage: 0 });
  assert.deepEqual(addDeath(score), { kills: 0, deaths: 1, damage: 0 });
  assert.deepEqual(score, { kills: 0, deaths: 0, damage: 0 });
});

test('respawn and match timer rules use server timestamps', () => {
  assert.equal(isRespawnDue(false, 3_000, 2_999), false);
  assert.equal(isRespawnDue(false, 3_000, 3_000), true);
  assert.equal(isRespawnDue(true, 3_000, 4_000), false);
  assert.equal(remainingMatchMs('PLAYING', 10_000, 8_000), 2_000);
  assert.equal(remainingMatchMs('RESULTS', 10_000, 8_000), 0);
});
