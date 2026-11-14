const test = require('node:test');
const assert = require('node:assert');
const { MP_LIMITS, encodeFrame, decodeFrames, playerName } = require('../src/services/multiplayer/protocol.ts');
const { decodeJoinUrl, encodeJoinUrl, isPrivateIPv4 } = require('../src/services/multiplayer/qr.ts');
const { GameRoom } = require('../src/services/multiplayer/room.ts');
const { sameSecret, handshakeExpired, HelloGuard } = require('../src/services/multiplayer/guard.ts');
const { scriptJson } = require('../src/bridge/scriptJson.ts');
const { hostMultiplayer, resetMultiplayerForTests } = require('../src/services/multiplayer/session.ts');

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function baseUrl(overrides) {
  return encodeJoinUrl({
    v: 1,
    host: '192.168.1.20',
    port: 38421,
    room: 'K7QP',
    token: '0123456789abcdef',
    appId: 'wolf',
    ...overrides,
  });
}

test('QR lehnt öffentliche Ziele, Namen und Sonderports ab', () => {
  assert.strictEqual(isPrivateIPv4('169.254.169.254'), false);
  assert.strictEqual(isPrivateIPv4('169.254.1.1'), true);
  assert.strictEqual(isPrivateIPv4('192.168.001.1'), false);
  const url = baseUrl();
  assert.throws(() => decodeJoinUrl('everyapp-mp://join?v=1&host=spiel.example&port=38421&room=K7QP&token=0123456789abcdef&app=wolf'), /lokalen Netz/);
  assert.throws(() => decodeJoinUrl(url.replace('host=192.168.1.20', 'host=8.8.8.8')), /lokalen Netz/);
  assert.throws(() => decodeJoinUrl(url.replace('host=192.168.1.20', 'host=169.254.169.254')), /lokalen Netz/);
  assert.throws(() => decodeJoinUrl(url.replace('port=38421', 'port=0')), /Port/);
  assert.throws(() => decodeJoinUrl(url.replace('port=38421', 'port=80')), /Port/);
  assert.throws(() => decodeJoinUrl(url.replace('port=38421', 'port=1e4')), /Port/);
  assert.throws(() => decodeJoinUrl(url.replace('port=38421', 'port=0x1f90')), /Port/);
  assert.throws(() => decodeJoinUrl(`${url}&pad=${'a'.repeat(MP_LIMITS.maxQrChars)}`), /zu lang/);
  assert.throws(() => decodeJoinUrl(url.replace('app=wolf', 'app=%3Cscript%3E')), /Mini-App/);
  assert.strictEqual(playerName('<img onerror=alert(1)>'), 'img onerror=alert(1)');
  assert.ok(!playerName('<b>Ada</b>').includes('<'));
});

test('Tokenvergleich bricht nicht vorzeitig ab und Hellos werden gesperrt', () => {
  assert.strictEqual(sameSecret('0123456789abcdef', '0123456789abcdef'), true);
  assert.strictEqual(sameSecret('0123456789abcdef', '0123456789abcdee'), false);
  assert.strictEqual(sameSecret('kurz', '0123456789abcdef'), false);
  assert.strictEqual(handshakeExpired(0, MP_LIMITS.handshakeMs - 1), false);
  assert.strictEqual(handshakeExpired(0, MP_LIMITS.handshakeMs), true);
  const guard = new HelloGuard();
  for (let i = 0; i < MP_LIMITS.maxFailedHellos - 1; i++) guard.recordFailure(1000);
  assert.strictEqual(guard.isLocked(1000), false);
  guard.recordFailure(1000);
  assert.strictEqual(guard.isLocked(1000), true);
  assert.strictEqual(guard.isLocked(1000 + MP_LIMITS.lockoutMs), false);
});

test('Raum begrenzt die Rate und gibt das Spielergeheimnis nicht heraus', () => {
  const room = new GameRoom({ appId: 'wolf', maxPlayers: 4, hostName: 'Ada', now: 0, random: rng(4) });
  const guest = room.admit({ appId: 'wolf', room: room.roomCode, token: room.token, name: '<script>Ada</script>' }, 0);
  assert.strictEqual(guest.ok, true);
  assert.ok(!guest.player.name.includes('<'));
  assert.ok(guest.secret && guest.secret !== room.token);
  assert.ok(!JSON.stringify(room.players()).includes(guest.secret));
  for (let i = 0; i < MP_LIMITS.maxMessagesPer10s; i++) room.relay(guest.player.id, { i }, undefined, 50);
  assert.throws(() => room.relay(guest.player.id, { i: 'x' }, undefined, 50), /Zu viele/);
});

function makeLink() {
  const data = [];
  const closes = [];
  let dead = false;
  return {
    sent: [],
    closed: false,
    send(frame) { this.sent.push(frame); },
    close() {
      if (dead) return;
      dead = true;
      this.closed = true;
      closes.forEach((cb) => cb());
    },
    onData(cb) { data.push(cb); },
    onClose(cb) { closes.push(cb); },
    push(text) { data.forEach((cb) => cb(text)); },
  };
}

function readFrames(link) {
  return link.sent.flatMap((chunk) => decodeFrames(chunk).frames);
}

test('TCP-Sitzung weist Raten, Übernahme, Flut und offene Sockets ab', async () => {
  await resetMultiplayerForTests();
  let accept = () => {};
  let closed = false;
  const transport = {
    async localIpv4() { return '192.168.1.20'; },
    listen(onConnection) {
      accept = onConnection;
      return Promise.resolve({
        port: 4040,
        close() { closed = true; },
      });
    },
    async connect() { throw new Error('nein'); },
  };
  const events = [];
  try {
    const hosted = await hostMultiplayer('wolf', (event, data) => events.push({ event, data }), { name: 'Ada', maxPlayers: 4 }, transport);
    const target = decodeJoinUrl(hosted.qrPayload);
    const hello = (extra) => encodeFrame({
      t: 'hello', v: 1, appId: 'wolf', room: target.room, token: target.token, name: 'Bea', ...extra,
    });

    const bad = makeLink();
    accept(bad);
    bad.push(hello({ token: '0000000000000000' }));
    assert.strictEqual(readFrames(bad).some((frame) => frame.t === 'error' && frame.code === 'auth'), true);
    assert.strictEqual(bad.closed, true);

    const otherApp = makeLink();
    accept(otherApp);
    otherApp.push(hello({ appId: 'song' }));
    assert.strictEqual(readFrames(otherApp).some((frame) => frame.t === 'error' && frame.code === 'auth'), true);
    assert.ok(!events.some((item) => item.event === 'multiplayer.message'));

    const guest = makeLink();
    accept(guest);
    guest.push(hello({ name: '<script>Bea</script>' }));
    const welcome = readFrames(guest).find((frame) => frame.t === 'welcome');
    assert.ok(welcome.secret);
    assert.ok(!JSON.stringify(welcome.players).includes(welcome.secret));
    assert.ok(!welcome.players.some((player) => player.name.includes('<')));
    guest.push(encodeFrame({ t: 'msg', from: hosted.playerId, all: true, data: { n: 1 } }));
    const message = events.find((item) => item.event === 'multiplayer.message');
    assert.strictEqual(message.data.from, welcome.playerId);
    assert.notStrictEqual(message.data.from, hosted.playerId);

    guest.close();
    const thief = makeLink();
    accept(thief);
    thief.push(hello({ playerId: welcome.playerId, secret: 'ffffffffffffffff' }));
    assert.strictEqual(readFrames(thief).some((frame) => frame.t === 'error' && frame.code === 'auth'), true);

    const back = makeLink();
    accept(back);
    back.push(hello({ playerId: welcome.playerId, secret: welcome.secret }));
    const resumed = readFrames(back).find((frame) => frame.t === 'welcome');
    assert.strictEqual(resumed.playerId, welcome.playerId);

    const flood = makeLink();
    accept(flood);
    flood.push('x'.repeat(MP_LIMITS.maxFrameBytes + 5));
    assert.strictEqual(flood.closed, true);

    const held = [];
    for (let i = 0; i < MP_LIMITS.maxPending + 4; i++) {
      const link = makeLink();
      accept(link);
      held.push(link);
    }
    const overflow = makeLink();
    accept(overflow);
    assert.strictEqual(overflow.closed, true);

    await resetMultiplayerForTests();
    closed = false;
    const again = await hostMultiplayer('wolf', () => {}, { name: 'Ada' }, transport);
    assert.ok(again.qrPayload);
    for (let i = 0; i < MP_LIMITS.maxFailedHellos; i++) {
      const link = makeLink();
      accept(link);
      link.push(hello({ token: '0000000000000000' }));
    }
    const locked = makeLink();
    accept(locked);
    assert.strictEqual(locked.closed, true);
    assert.strictEqual(locked.sent.length, 0);

    await resetMultiplayerForTests();
    assert.strictEqual(closed, true);
    const late = makeLink();
    accept(late);
    assert.strictEqual(late.closed, true);
  } finally {
    await resetMultiplayerForTests();
  }
});
