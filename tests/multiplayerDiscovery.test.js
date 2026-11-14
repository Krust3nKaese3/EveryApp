const test = require('node:test');
const assert = require('node:assert');
const { encodeServiceTxt, txtHasSecret, visibleRooms, matchRoom } = require('../src/services/multiplayer/discovery.ts');
const { AskGuard, resumeDelay } = require('../src/services/multiplayer/approval.ts');
const { MP_LIMITS } = require('../src/services/multiplayer/protocol.ts');
const { publicResume, resumeLeaksSecrets, roomExpired, loadUsable } = require('../src/services/multiplayer/persist.ts');

test('Ankündigung nennt den Raum, nicht das Token', () => {
  const txt = encodeServiceTxt({
    appId: 'wolf', roomCode: 'K7QP', roomId: 'aabbccddeeff0011', hostName: 'Ada<script>', players: 2, maxPlayers: 8,
  });
  assert.strictEqual(txt.v, '1');
  assert.strictEqual(txt.app, 'wolf');
  assert.strictEqual(txt.id, 'aabbccddeeff0011');
  assert.strictEqual(txtHasSecret(txt), false);
  assert.ok(!txt.name.includes('<'));
  assert.throws(() => encodeServiceTxt({ appId: '', roomCode: 'K7QP', roomId: 'aabbccddeeff0011', hostName: 'Ada', players: 1, maxPlayers: 4 }), /unvollständig/);
});

test('Suche zeigt nur dieselbe Mini-App und keine Adresse', () => {
  const services = [
    { key: 'a', host: '192.168.1.20', port: 4040, txt: { v: '1', app: 'wolf', room: 'K7QP', id: 'aabbccddeeff0011', name: 'Ada', n: '2', max: '8' } },
    { key: 'b', host: '192.168.1.21', port: 4041, txt: { v: '1', app: 'song', room: 'MMMM', id: 'bbbbbbbbbbbbbbbb', name: 'Bea', n: '1', max: '4' } },
  ];
  const rooms = visibleRooms(services, 'wolf');
  assert.strictEqual(rooms.length, 1);
  assert.strictEqual(rooms[0].roomCode, 'K7QP');
  assert.strictEqual(rooms[0].hostName, 'Ada');
  assert.ok(!JSON.stringify(rooms[0]).includes('192.168'));
  assert.strictEqual(matchRoom(services, 'wolf', 'aabbccddeeff0011').host, '192.168.1.20');
  assert.strictEqual(matchRoom(services, 'song', 'aabbccddeeff0011'), null);
});

test('Anfragen werden begrenzt und der Abstand wächst', () => {
  const guard = new AskGuard();
  for (let i = 0; i < MP_LIMITS.maxAsksPerAddress; i++) assert.strictEqual(guard.allow('10.0.0.2', 1000).ok, true);
  assert.strictEqual(guard.allow('10.0.0.2', 1000).ok, false);
  assert.strictEqual(guard.allow('10.0.0.3', 1000).ok, true);
  guard.deny('10.0.0.4', 1000);
  assert.strictEqual(guard.allow('10.0.0.4', 1000).code, 'rate');
  assert.strictEqual(guard.allow('10.0.0.4', 1000 + MP_LIMITS.askLockoutMs).ok, true);
  assert.strictEqual(resumeDelay(0), 1000);
  assert.ok(resumeDelay(8) <= MP_LIMITS.resumeBackoffMs);
});

test('Öffentliche Wiederkehr enthält kein Geheimnis und alte Räume fallen weg', () => {
  const room = {
    role: 'host',
    appId: 'wolf',
    roomId: 'aabbccddeeff0011',
    roomCode: 'K7QP',
    token: '0123456789abcdef',
    hostName: 'Ada',
    maxPlayers: 4,
    discoverable: true,
    joinApproval: true,
    selfId: 'host1',
    secret: 'fedcba9876543210',
    host: '192.168.1.20',
    port: 4040,
    members: [{ id: 'host1', secret: 'fedcba9876543210', name: 'Ada', host: true }],
    roster: [{ id: 'host1', name: 'Ada', host: true, connected: true }],
    updatedAt: 10_000,
  };
  const view = publicResume(room, 'ready');
  assert.strictEqual(view.roomCode, 'K7QP');
  assert.strictEqual(resumeLeaksSecrets(view), false);
  assert.ok(!JSON.stringify(view).includes(room.secret));
  assert.ok(!JSON.stringify(view).includes(room.token));
  assert.strictEqual(roomExpired(room, 10_000 + MP_LIMITS.roomTtlMs - 1), false);
  assert.strictEqual(roomExpired(room, 10_000 + MP_LIMITS.roomTtlMs), true);
  assert.strictEqual(loadUsable(room, 10_000 + MP_LIMITS.roomTtlMs), null);
});
