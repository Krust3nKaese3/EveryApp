import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BLE_BACKOFF_CAP_MS,
  bleBackoffMs,
  bleShouldRetry,
  decideWifi,
  decideWifiAlarm,
  initialWifiState,
  needsForegroundService,
  serviceDecisionLine,
  WIFI_DEBOUNCE_MS,
} from './backgroundPolicy.ts';
import { normalizePopupSpec, normalizeTilePatch } from './popupTiles.ts';

test('ble backoff grows and caps at 5 minutes', () => {
  assert.equal(bleBackoffMs(1), 1000);
  assert.equal(bleBackoffMs(2), 2000);
  assert.equal(bleBackoffMs(3), 4000);
  assert.equal(bleBackoffMs(9), 256000);
  assert.equal(bleBackoffMs(10), BLE_BACKOFF_CAP_MS);
  assert.equal(bleBackoffMs(11), BLE_BACKOFF_CAP_MS);
  assert.equal(BLE_BACKOFF_CAP_MS, 300000);
});

test('ble stops after 10 failures', () => {
  assert.equal(bleShouldRetry(0), true);
  assert.equal(bleShouldRetry(9), true);
  assert.equal(bleShouldRetry(10), false);
});

test('foreground service ignores wifi and idle ble backoff', () => {
  assert.deepEqual(needsForegroundService({ intervalCount: 0, dueOrConnectedBle: 0 }), {
    needed: false,
    reasons: [],
  });
  assert.deepEqual(needsForegroundService({ intervalCount: 2, dueOrConnectedBle: 0 }), {
    needed: true,
    reasons: ['interval'],
  });
  assert.deepEqual(needsForegroundService({ intervalCount: 0, dueOrConnectedBle: 1 }), {
    needed: true,
    reasons: ['bleNotify'],
  });
  const line = serviceDecisionLine(
    'boot',
    { intervalCount: 0, dueOrConnectedBle: 0, waitingBle: 1, exhaustedBle: 2, wifiWatchers: 3 },
    true,
  );
  assert.match(line, /^DIENST STOPP \|/);
  assert.match(line, /WLAN ohne Vordergrunddienst/);
  assert.match(line, /Quelle: boot/);
  const start = serviceDecisionLine(
    'setTasks',
    { intervalCount: 1, dueOrConnectedBle: 0, waitingBle: 0, exhaustedBle: 0, wifiWatchers: 0 },
    false,
  );
  assert.match(start, /^DIENST START \| Gründe: interval \|/);
});

test('wifi duplicate callbacks do not emit', () => {
  const first = decideWifi(initialWifiState(), { ssid: 'Home', bssid: 'aa' }, 1_000);
  assert.equal(first.type, 'emit');
  const dup = decideWifi(first.state, { ssid: 'Home', bssid: 'aa' }, 1_500);
  assert.equal(dup.type, 'ignore');
  assert.match(dup.reason, /doppelter Callback/);
  assert.equal(dup.state.lastEmitAt, first.state.lastEmitAt);
});

test('wifi change is debounced then emitted once', () => {
  const first = decideWifi(initialWifiState(), { ssid: 'Home', bssid: 'aa' }, 10_000);
  assert.equal(first.type, 'emit');
  const next = decideWifi(first.state, { ssid: 'Cafe', bssid: 'bb' }, 12_000);
  assert.equal(next.type, 'schedule');
  if (next.type !== 'schedule') return;
  assert.equal(next.at, 10_000 + WIFI_DEBOUNCE_MS);
  const dup = decideWifi(next.state, { ssid: 'Cafe', bssid: 'bb' }, 15_000);
  assert.equal(dup.type, 'ignore');
  const alarm = decideWifiAlarm(next.state, 10_000 + WIFI_DEBOUNCE_MS);
  assert.equal(alarm.type, 'emit');
  if (alarm.type !== 'emit') return;
  assert.equal(alarm.identity.ssid, 'Cafe');
  assert.equal(alarm.state.pending, false);
});

test('unreadable wifi baseline does not emit', () => {
  const base = decideWifi(initialWifiState(), { ssid: null, bssid: null }, 5);
  assert.equal(base.type, 'ignore');
  const again = decideWifi(base.state, { ssid: null, bssid: null }, 6);
  assert.equal(again.type, 'ignore');
  assert.match(again.reason, /doppelter Callback/);
});

test('allowLocked is accepted on tiles and popups', () => {
  const tile = normalizeTilePatch({ label: 'Tür', allowLocked: true, popup: { html: '<p>x</p>', allowLocked: true } });
  assert.equal(tile.allowLocked, true);
  const popup = normalizePopupSpec(tile.popup, 'app-1');
  assert.equal(popup.allowLocked, true);
  assert.equal(popup.appId, 'app-1');
  assert.throws(() => normalizeTilePatch({ nope: 1 }), /unbekanntes Feld/);
});
