const test = require('node:test'); const assert = require('node:assert'); const nc = require('node:crypto');
const T = require('../src/services/TuyaLocal.ts');
const B = (h) => Buffer.from(h, 'hex'), H = (b) => Buffer.from(b).toString('hex');
const C = {
  aesEcb: async (e, k, d) => { const c = (e ? nc.createCipheriv : nc.createDecipheriv)('aes-128-ecb', B(k), null); c.setAutoPadding(false); return H(Buffer.concat([c.update(B(d)), c.final()])); },
  aesGcm: async (e, k, iv, aad, d) => {
    if (e) { const c = nc.createCipheriv('aes-128-gcm', B(k), B(iv)); if (aad) c.setAAD(B(aad)); const ct = Buffer.concat([c.update(B(d)), c.final()]); return H(Buffer.concat([ct, c.getAuthTag()])); }
    const buf = B(d); const c = nc.createDecipheriv('aes-128-gcm', B(k), B(iv)); if (aad) c.setAAD(B(aad)); c.setAuthTag(buf.subarray(buf.length - 16));
    return H(Buffer.concat([c.update(buf.subarray(0, buf.length - 16)), c.final()]));
  },
  hmacSha256: async (k, d) => H(nc.createHmac('sha256', B(k)).update(B(d)).digest()),
  md5: async (d) => H(nc.createHash('md5').update(B(d)).digest()),
  crc32: async (d) => require('zlib').crc32(B(d)),
  randomHex: async (n) => H(nc.randomBytes(n)),
};
const KEY = 'abcdefghijklmnop', KH = Buffer.from(KEY).toString('hex');

test('crc32 known value', async () => { assert.strictEqual(await C.crc32(Buffer.from('123456789').toString('hex')), 0xcbf43926); });
test('pkcs7 roundtrip', () => { const h = '01020304'; assert.strictEqual(T.unpkcs7(T.pkcs7(h)), h); assert.strictEqual(T.pkcs7('').length, 32); });
test('55AA 3.3 frame roundtrip', async () => {
  const f = await T.pack55(C, 7, 10, 'deadbeef'.repeat(4), null);
  assert.ok(f.startsWith('000055aa') && f.endsWith('0000aa55'));
  const { frames, rest } = await T.unpackAll(C, f + '0000', '3.3', null);
  assert.strictEqual(frames[0].cmd, 10); assert.strictEqual(frames[0].seq, 7); assert.strictEqual(rest, '0000');
});
test('55AA 3.4 hmac verified', async () => {
  const f = await T.pack55(C, 1, 13, 'ab'.repeat(32), KH);
  const { frames } = await T.unpackAll(C, f, '3.4', KH); assert.strictEqual(frames[0].payloadHex, 'ab'.repeat(32));
  await assert.rejects(T.unpackAll(C, f, '3.4', 'ff'.repeat(16)), /HMAC ungültig/);
});
test('6699 3.5 GCM roundtrip', async () => {
  const pt = Buffer.from('{"dps":{"20":true}}').toString('hex');
  const f = await T.pack66(C, 3, 8, pt, KH);
  const { frames } = await T.unpackAll(C, f, '3.5', KH); assert.strictEqual(frames[0].payloadHex, pt); assert.strictEqual(frames[0].cmd, 8);
});
test('6667 broadcast decode', async () => {
  const udpKey = await C.md5(Buffer.from(T.UDP_KEY_SEED).toString('hex'));
  const js = Buffer.from(JSON.stringify({ ip: '192.168.178.40', gwId: 'bf123', version: '3.4' })).toString('hex');
  const enc = await C.aesEcb(true, udpKey, T.pkcs7(js));
  const pkt = await T.pack55(C, 0, 19, '00000000' + enc, null);
  const d = await T.decodeBroadcast(C, pkt); assert.strictEqual(d.gwId, 'bf123'); assert.strictEqual(d.ip, '192.168.178.40');
});
test('localKey validation', () => { assert.throws(() => T.keyHex('short'), /16 Zeichen/); });

// fake 3.3 device: answers DP_QUERY with encrypted status, CONTROL with empty ack
test('3.3 client status + set against fake device', async () => {
  let pending = '';
  const net = { tcp: async () => ({
    send: async (hex) => {
      const { frames } = await T.unpackAll(C, hex, '3.3', null); const f = frames[0];
      if (f.cmd === 10) {
        const enc = await C.aesEcb(true, KH, T.pkcs7(Buffer.from('{"devId":"x","dps":{"20":false,"22":500}}').toString('hex')));
        pending += await T.pack55(C, f.seq, 10, '00000000' + enc, null);
      } else if (f.cmd === 7) {
        assert.ok(f.payloadHex.startsWith(Buffer.from('3.3').toString('hex'))); pending += await T.pack55(C, f.seq, 7, '00000000', null);
      }
    },
    receive: async () => { const p = pending; pending = ''; return p; }, close: async () => {} }) };
  const t = T.makeTuyaLocal(C, net, { ip: '1.2.3.4', id: 'x', localKey: KEY, version: '3.3' });
  assert.deepStrictEqual(await t.status(), { 20: false, 22: 500 });
  await t.set({ 20: true });
});
