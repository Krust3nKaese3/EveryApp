const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { MULTIPLAYER_BRIDGE_METHODS } = require('../src/services/multiplayer/bridgeClient.ts');
const { installEveryAppMock } = require('../examples/multiplayer-mock/everyapp-mock.js');
const lobby = require('../examples/multiplayer-lobby/logic.js');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Doku und Vorlage nutzen dieselben Bridge-Methoden', () => {
  const guide = read('docs/MINIAPP_AI_GUIDE.md');
  const example = read('examples/multiplayer-lobby/app.js');
  const mock = read('examples/multiplayer-mock/everyapp-mock.js');
  const manifest = JSON.parse(read('examples/multiplayer-lobby/everyapp.json'));
  assert.deepStrictEqual(manifest.permissions, ['multiplayer']);
  assert.strictEqual(manifest.entrypoint, 'index.html');
  for (const name of MULTIPLAYER_BRIDGE_METHODS) {
    assert.match(example, new RegExp('mp\\.' + name + '\\('));
    assert.match(mock, new RegExp(name + '\\('));
    assert.match(guide, new RegExp(name));
  }
  assert.match(read('llms.txt'), /raw\.githubusercontent\.com\/Krust3nKaese3\/EveryApp\/main\/docs\/MINIAPP_AI_GUIDE\.md/);
  assert.match(example, /textContent/);
  assert.doesNotMatch(example, /innerHTML/);
});

test('Lobby-Regeln und zwei Tabs sprechen hin und zurück', async () => {
  let state = lobby.createLobby();
  state = lobby.applyLobbyMessage(state, { type: 'start' });
  state = lobby.applyLobbyMessage(state, { type: 'count' });
  state = lobby.applyLobbyMessage(state, { type: 'vote', choice: 'ja', from: 'p1' });
  state = lobby.applyLobbyMessage(state, { type: 'vote', choice: 'sonst', from: 'p2' });
  assert.strictEqual(state.phase, 'round');
  assert.strictEqual(state.count, 1);
  assert.strictEqual(state.votes.p1, 'ja');
  assert.strictEqual(state.votes.p2, 'nein');
  assert.deepStrictEqual(lobby.reconnectedIds(
    [{ id: 'p1', connected: false }, { id: 'p2', connected: true }],
    [{ id: 'p1', connected: true }, { id: 'p2', connected: true }],
  ), ['p1']);
  const restored = lobby.applyLobbyMessage(lobby.createLobby(), { type: 'state', state: state });
  assert.strictEqual(restored.count, 1);

  const host = installEveryAppMock({ appId: 'lobby-test', global: {}, channel: 'everyapp-mp-test-lobby' });
  const guest = installEveryAppMock({ appId: 'lobby-test', global: {}, channel: 'everyapp-mp-test-lobby' });
  const stranger = installEveryAppMock({ appId: 'andere-app', global: {}, channel: 'everyapp-mp-test-lobby' });
  const guestMessages = [];
  const hostMessages = [];
  const rosters = [];
  host.multiplayer.onMessage((message) => hostMessages.push(message));
  host.multiplayer.onPlayersChanged((roster) => rosters.push(roster));
  guest.multiplayer.onMessage((message) => guestMessages.push(message));
  guest.multiplayer.onPlayersChanged(() => {});

  const room = await host.multiplayer.host({ maxPlayers: 4, name: 'Ada' });
  const joined = await guest.multiplayer.join({ payload: room.roomCode, name: 'Bea' });
  assert.strictEqual(joined.roomCode, room.roomCode);
  assert.notStrictEqual(joined.playerId, room.playerId);
  await assert.rejects(() => stranger.multiplayer.join(room.roomCode), /Kein Raum/);
  await assert.rejects(() => guest.multiplayer.join({ scan: true }), /Raumcode/);

  await host.multiplayer.broadcast({ type: 'count' });
  await guest.multiplayer.send({ type: 'vote', choice: 'ja' });
  await delay(40);
  assert.strictEqual(guestMessages.some((message) => message.data && message.data.type === 'count'), true);
  const vote = hostMessages.find((message) => message.data && message.data.type === 'vote');
  assert.ok(vote);
  assert.strictEqual(vote.from, joined.playerId);
  let round = lobby.applyLobbyMessage(lobby.createLobby(), { type: 'start' });
  round = lobby.applyLobbyMessage(round, { type: 'vote', choice: vote.data.choice, from: vote.from });
  assert.strictEqual(round.votes[joined.playerId], 'ja');

  guest.debug.drop();
  await delay(40);
  assert.strictEqual(rosters[rosters.length - 1].players.find((player) => player.id === joined.playerId).connected, false);
  await guest.debug.resume();
  await delay(40);
  assert.strictEqual(rosters[rosters.length - 1].players.find((player) => player.id === joined.playerId).connected, true);

  await assert.rejects(() => guest.multiplayer.send('x'.repeat(40000)), /32 KiB/);
  await guest.multiplayer.leave();
  await host.multiplayer.leave();
});

function fakeDocument() {
  const nodes = new Map();
  function make(id) {
    const node = {
      textContent: '',
      value: id === 'name' ? 'Spieler' : '',
      onclick: null,
      children: [],
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
    };
    if (id) nodes.set(id, node);
    return node;
  }
  ['status', 'players', 'round', 'name', 'code', 'host', 'join', 'leave', 'start', 'plus', 'yes', 'no'].forEach((id) => make(id));
  return {
    getElementById(id) { return nodes.get(id) || null; },
    createElement() { return make(''); },
  };
}

function bootLobby(channel) {
  const window = {};
  const handle = installEveryAppMock({ global: window, appId: 'multiplayer-lobby', channel: channel });
  const document = fakeDocument();
  const context = vm.createContext({
    window: window,
    document: document,
    createLobby: lobby.createLobby,
    applyLobbyMessage: lobby.applyLobbyMessage,
    reconnectedIds: lobby.reconnectedIds,
  });
  vm.runInContext(read('examples/multiplayer-lobby/app.js'), context);
  return { document: document, handle: handle };
}

function listText(document) {
  return document.getElementById('players').children.map((item) => item.textContent).join('\n');
}

test('Zwei Lobby-Seiten zählen und stimmen über die Attrappe', async () => {
  const channel = 'everyapp-mp-test-ui';
  const host = bootLobby(channel);
  const guest = bootLobby(channel);
  host.document.getElementById('name').value = 'Ada';
  guest.document.getElementById('name').value = 'Bea';
  await host.document.getElementById('host').onclick();
  const code = /Raum ([A-Z2-9]{4})/.exec(host.document.getElementById('status').textContent);
  assert.ok(code);
  guest.document.getElementById('code').value = code[1];
  await guest.document.getElementById('join').onclick();
  assert.match(listText(host.document), /Bea · Gast · da/);
  assert.match(guest.document.getElementById('status').textContent, /Beigetreten/);

  await host.document.getElementById('start').onclick();
  await delay(40);
  assert.match(guest.document.getElementById('round').textContent, /Runde 1/);
  await host.document.getElementById('plus').onclick();
  await delay(40);
  assert.match(host.document.getElementById('round').textContent, /Zähler 1/);
  assert.match(guest.document.getElementById('round').textContent, /Zähler 1/);

  await guest.document.getElementById('yes').onclick();
  await delay(80);
  assert.match(host.document.getElementById('round').textContent, /Ja 1/);
  assert.match(guest.document.getElementById('round').textContent, /Ja 1/);
  await host.document.getElementById('no').onclick();
  await delay(40);
  assert.match(guest.document.getElementById('round').textContent, /Nein 1/);

  guest.handle.debug.drop();
  await delay(40);
  assert.match(listText(host.document), /Bea · Gast · kurz weg/);
  await guest.handle.debug.resume();
  await delay(80);
  assert.match(listText(host.document), /Bea · Gast · da/);
  assert.match(guest.document.getElementById('round').textContent, /Zähler 1/);
  assert.strictEqual(host.document.getElementById('players').innerHTML, undefined);
});
