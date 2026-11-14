const test = require('node:test');
const assert = require('node:assert');
const QRCode = require('qrcode');
const { MP_LIMITS, assertPayload, decodeFrames, encodeFrame } = require('../src/services/multiplayer/protocol.ts');
const { chooseLanIPv4, decodeJoinUrl, encodeJoinUrl, isPrivateIPv4 } = require('../src/services/multiplayer/qr.ts');
const { GameRoom } = require('../src/services/multiplayer/room.ts');
const { bridgeMethod, parseBridgeMessage, takeRate, clearRate } = require('../src/bridge/allowlist.ts');
const { PERMISSION_INFO } = require('../src/bridge/permissionInfo.ts');

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('Rahmen überstehen Zeilenumbrüche und unvollständige Puffer', () => {
  const frame = encodeFrame({ t: 'msg', data: { text: 'zeile\nzwei' }, seq: 1, from: 'ab' });
  assert.strictEqual(frame.split('\n').length, 2);
  const partial = decodeFrames(frame.slice(0, 8));
  assert.strictEqual(partial.frames.length, 0);
  assert.ok(partial.rest.length > 0);
  const done = decodeFrames(partial.rest + frame.slice(8));
  assert.strictEqual(done.frames.length, 1);
  assert.deepStrictEqual(done.frames[0].data, { text: 'zeile\nzwei' });
  assert.strictEqual(decodeFrames('{}\n').error, 'Unbekannter Rahmen.');
  assert.strictEqual(decodeFrames('kein-json\n').error, 'Kein JSON.');
});

test('Nutzlast ist begrenzt und ohne verbotene Felder', () => {
  assert.deepStrictEqual(assertPayload({ n: 1, list: [true, null] }), { n: 1, list: [true, null] });
  assert.throws(() => assertPayload(JSON.parse('{"__proto__":{"x":1}}')), /unerlaubtes Feld/);
  assert.throws(() => assertPayload('x'.repeat(MP_LIMITS.maxPayloadBytes + 1)), /32 KiB/);
  const huge = encodeFrame({ t: 'msg', data: 'x'.repeat(MP_LIMITS.maxPayloadBytes + 1) });
  assert.ok(decodeFrames(huge).error);
});

test('QR bleibt im lokalen Netz und passt in einen Code', () => {
  assert.strictEqual(isPrivateIPv4('10.1.2.3'), true);
  assert.strictEqual(isPrivateIPv4('192.168.0.12'), true);
  assert.strictEqual(isPrivateIPv4('172.20.10.1'), true);
  assert.strictEqual(isPrivateIPv4('172.15.0.1'), false);
  assert.strictEqual(isPrivateIPv4('8.8.8.8'), false);
  assert.strictEqual(isPrivateIPv4('127.0.0.1'), false);
  const target = { v: 1, host: '172.20.10.1', port: 38421, room: 'K7QP', token: '0123456789abcdef', appId: 'evryWerwolf' };
  const url = encodeJoinUrl(target);
  assert.ok(url.startsWith('everyapp-mp://join?'));
  assert.deepStrictEqual(decodeJoinUrl(url), target);
  assert.throws(() => decodeJoinUrl('https://github.com/a/b'), /Spielraum/);
  assert.throws(() => encodeJoinUrl({ ...target, host: '8.8.8.8' }), /lokalen Netz/);
  assert.throws(() => decodeJoinUrl(url.replace('38421', '80')), /Port/);
  const code = QRCode.create(url, { errorCorrectionLevel: 'M' });
  assert.ok(code.modules.size >= 21 && code.modules.size <= 177);
  assert.strictEqual(chooseLanIPv4([
    { name: 'ap0', ip: '192.168.43.1' },
    { name: 'wlan0', ip: '192.168.1.20' },
  ]), '192.168.1.20');
  assert.strictEqual(chooseLanIPv4([
    { name: 'rmnet0', ip: '8.8.8.8' },
    { name: 'bridge100', ip: '172.20.10.1' },
  ]), '172.20.10.1');
  assert.strictEqual(chooseLanIPv4([{ name: 'lo', ip: '127.0.0.1' }]), null);
});

test('Raum nimmt nur dieselbe Mini-App auf und leitet gezielt weiter', () => {
  const room = new GameRoom({ appId: 'wolf', maxPlayers: 3, hostName: 'Ada', now: 0, random: rng(7) });
  const hostId = room.hostId;
  assert.strictEqual(room.players().length, 1);
  assert.strictEqual(room.players()[0].host, true);
  const deniedApp = room.admit({ appId: 'song', room: room.roomCode, token: room.token, name: 'Bea' }, 1);
  assert.strictEqual(deniedApp.ok, false);
  assert.strictEqual(deniedApp.code, 'auth');
  const deniedToken = room.admit({ appId: 'wolf', room: room.roomCode, token: '0000000000000000', name: 'Bea' }, 1);
  assert.strictEqual(deniedToken.code, 'auth');
  const bea = room.admit({ appId: 'wolf', room: room.roomCode, token: room.token, name: 'Bea' }, 1);
  const cio = room.admit({ appId: 'wolf', room: room.roomCode, token: room.token, name: 'Cio' }, 1);
  assert.strictEqual(bea.ok && cio.ok, true);
  assert.strictEqual(room.admit({ appId: 'wolf', room: room.roomCode, token: room.token, name: 'Dan' }, 1).code, 'full');
  const toHost = room.relay(bea.player.id, { vote: 'ja' });
  assert.deepStrictEqual(toHost.targets, [hostId]);
  assert.deepStrictEqual(toHost.data, { vote: 'ja' });
  const directed = room.relay(bea.player.id, { hint: 1 }, cio.player.id);
  assert.deepStrictEqual(directed.targets, [cio.player.id]);
  const blast = room.broadcast(bea.player.id, { phase: 'night' });
  assert.ok(!blast.targets.includes(bea.player.id));
  assert.ok(blast.targets.includes(hostId));
  assert.ok(blast.targets.includes(cio.player.id));
  assert.throws(() => room.broadcast(bea.player.id, { big: 'y'.repeat(MP_LIMITS.maxPayloadBytes) }), /32 KiB/);
  assert.throws(() => room.relay(hostId, { x: 1 }), /Empfänger/);
});

test('Trennung behält den Platz, bis der Gast geht', () => {
  const room = new GameRoom({ appId: 'song', maxPlayers: 4, hostName: 'Host', now: 0, random: rng(3) });
  const guest = room.admit({ appId: 'song', room: room.roomCode, token: room.token, name: 'Bea' }, 0);
  assert.strictEqual(guest.ok, true);
  assert.ok(!JSON.stringify(room.players()).includes(guest.secret));
  assert.notStrictEqual(room.roomId, room.token);
  assert.strictEqual(room.disconnect(guest.player.id, 1000), true);
  assert.strictEqual(room.players().find((player) => player.id === guest.player.id).connected, false);
  const stolen = room.admit({
    appId: 'song', room: room.roomCode, token: room.token, name: 'Fremd', playerId: guest.player.id, secret: '0123456789abcdef',
  }, 2000);
  assert.strictEqual(stolen.code, 'auth');
  const again = room.admit({
    appId: 'song', room: room.roomCode, token: room.token, name: 'Jemand', playerId: guest.player.id, secret: guest.secret,
  }, 5000);
  assert.strictEqual(again.ok && again.resumed, true);
  assert.strictEqual(again.player.name, 'Bea');
  room.disconnect(guest.player.id, 5000);
  const late = room.tick(5000 + MP_LIMITS.roomTtlMs);
  assert.ok(room.players().some((player) => player.id === guest.player.id));
  assert.strictEqual(late.drop.length, 0);
  assert.strictEqual(room.leave(guest.player.id), true);
  assert.ok(!room.players().some((player) => player.id === guest.player.id));
  assert.strictEqual(room.admit({
    appId: 'song', room: room.roomCode, token: room.token, name: 'Bea', playerId: guest.player.id, secret: guest.secret,
  }, 99999).code, 'auth');
});

test('Stille Verbindung wird nach dem Timeout getrennt', () => {
  const room = new GameRoom({ appId: 'song', maxPlayers: 4, hostName: 'Host', now: 0, random: rng(9) });
  const guest = room.admit({ appId: 'song', room: room.roomCode, token: room.token, name: 'Bea' }, 0);
  room.seen(guest.player.id, 1000);
  const quiet = room.tick(1000 + MP_LIMITS.timeoutMs);
  assert.deepStrictEqual(quiet.drop, [guest.player.id]);
  assert.strictEqual(room.players().find((player) => player.id === guest.player.id).connected, false);
});

test('Verlassen gibt den Platz sofort frei', () => {
  const room = new GameRoom({ appId: 'song', maxPlayers: 2, hostName: 'Host', now: 0, random: rng(11) });
  const guest = room.admit({ appId: 'song', room: room.roomCode, token: room.token, name: 'Bea' }, 0);
  assert.strictEqual(room.leave(guest.player.id), true);
  assert.strictEqual(room.players().length, 1);
  const next = room.admit({ appId: 'song', room: room.roomCode, token: room.token, name: 'Ced' }, 10);
  assert.strictEqual(next.ok, true);
  assert.notStrictEqual(next.player.id, guest.player.id);
});

test('Bridge erlaubt Mehrspieler nur mit der passenden Berechtigung', () => {
  assert.ok(PERMISSION_INFO.multiplayer);
  const host = bridgeMethod('multiplayer.host');
  assert.strictEqual(host.category, 'multiplayer');
  assert.strictEqual(host.action, 'host');
  assert.deepStrictEqual(host.validate([]), [{ maxPlayers: undefined, name: undefined, discoverable: undefined, joinApproval: undefined }]);
  assert.deepStrictEqual(host.validate([{ maxPlayers: 4, name: 'Ada', discoverable: true, joinApproval: false }]), [{ maxPlayers: 4, name: 'Ada', discoverable: true, joinApproval: false }]);
  assert.throws(() => host.validate([{ maxPlayers: 99 }]), /maxPlayers/);
  const join = bridgeMethod('multiplayer.join');
  assert.deepStrictEqual(join.validate(['everyapp-mp://join']), ['everyapp-mp://join']);
  assert.deepStrictEqual(join.validate([{ scan: true, name: 'Bea' }]), [{ scan: true, payload: undefined, qrPayload: undefined, name: 'Bea', room: undefined }]);
  assert.deepStrictEqual(join.validate([{ room: 'aabb@svc', name: 'Bea' }]), [{ scan: undefined, payload: undefined, qrPayload: undefined, name: 'Bea', room: 'aabb@svc' }]);
  const send = bridgeMethod('multiplayer.send');
  assert.deepStrictEqual(send.validate([{ a: 1 }, { to: 'abcd' }]), [{ a: 1 }, { to: 'abcd' }]);
  assert.throws(() => bridgeMethod('multiplayer.broadcast').validate([]), /Argumente/);
  assert.strictEqual(parseBridgeMessage({ type: 'event', event: 'multiplayer.message', action: 'on' }).kind, 'event');
  assert.strictEqual(parseBridgeMessage({ type: 'event', event: 'multiplayer.secret', action: 'on' }).kind, 'reject');
  clearRate('wolf');
  const rule = host.rate;
  for (let i = 0; i < rule.max; i++) assert.strictEqual(takeRate('wolf', 'multiplayer.host', rule, 1000), true);
  assert.strictEqual(takeRate('wolf', 'multiplayer.host', rule, 1000), false);
  clearRate('wolf');
});
