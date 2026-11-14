// Die Mini-App speichert den Spielstand selbst. EveryApp merkt sich nur den Raum.
const mp = window.EveryAppBridge.multiplayer;
const storage = window.EveryAppBridge.storage;
const statusNode = document.getElementById('status');
const playersNode = document.getElementById('players');
const roundNode = document.getElementById('round');
const roomsNode = document.getElementById('rooms');
const askText = document.getElementById('asktext');

let selfId = '';
let isHost = false;
let state = createLobby();
let roster = [];
let pendingAsk = '';
let seenRooms = [];

function setText(node, value) {
  node.textContent = value == null ? '' : String(value);
}

function render() {
  playersNode.replaceChildren();
  roster.forEach((player) => {
    const item = document.createElement('li');
    const role = player.host ? 'Host' : 'Gast';
    const online = player.connected ? 'da' : 'kurz weg';
    setText(item, player.name + ' · ' + role + ' · ' + online);
    playersNode.appendChild(item);
  });
  if (roomsNode) {
    roomsNode.replaceChildren();
    seenRooms.forEach((room) => {
      const item = document.createElement('li');
      setText(item, room.hostName + ' · Raum ' + room.roomCode + ' · ' + room.players + '/' + room.maxPlayers);
      item.onclick = () => { void joinRoom(room.id); };
      roomsNode.appendChild(item);
    });
  }
  if (state.phase === 'lobby') {
    setText(roundNode, 'Runde noch nicht gestartet.');
    return;
  }
  const ja = Object.values(state.votes).filter((choice) => choice === 'ja').length;
  const nein = Object.values(state.votes).filter((choice) => choice === 'nein').length;
  setText(roundNode, 'Runde ' + state.round + ' · Zähler ' + state.count + ' · Ja ' + ja + ' · Nein ' + nein);
}

function apply(message) {
  state = applyLobbyMessage(state, message);
  if (storage && storage.set) void storage.set('lobby-state', state);
  render();
}

// Der Host schickt den Stand an alle anderen. Gäste übernehmen ihn.
async function publishState() {
  if (!isHost) return;
  await mp.broadcast({ type: 'state', state: state });
}

mp.onMessage((message) => {
  const data = message.data || {};
  if (data.type === 'state') {
    if (!isHost) apply(data);
    return;
  }
  if (data.type === 'vote') {
    apply({ type: 'vote', choice: data.choice, from: message.from });
    if (isHost) void publishState();
    return;
  }
  if (!isHost) apply(data);
});

mp.onPlayersChanged((next) => {
  const returned = reconnectedIds(roster, next.players);
  roster = next.players || [];
  selfId = next.selfId || selfId;
  render();
  // Nachrichten aus der Pause kommen nicht nach. Der Host sendet den Stand neu.
  if (isHost && state.phase === 'round' && returned.length) void publishState();
});

mp.onJoinRequest((request) => {
  pendingAsk = request.id;
  setText(askText, request.name + ' möchte in Raum ' + request.roomCode + ' bei ' + request.hostName + '.');
});

mp.onHostAway((info) => {
  setText(statusNode, info.message || 'Host ist kurz weg');
});

mp.onResumed((info) => {
  void adopt(info);
});

async function adopt(info) {
  if (!info || !info.role) return;
  isHost = info.role === 'host';
  selfId = info.selfId || selfId;
  roster = info.players || roster;
  if (storage && storage.get) {
    const saved = await storage.get('lobby-state');
    if (saved && saved.phase) state = saved;
  }
  setText(statusNode, info.status === 'hostAway' ? 'Host ist kurz weg' : 'Wieder im Raum ' + info.roomCode + '.');
  render();
  if (isHost) await publishState();
}

function fail(error) {
  setText(statusNode, error && error.message ? error.message : 'Das hat nicht geklappt.');
}

document.getElementById('host').onclick = async () => {
  try {
    const room = await mp.host({
      maxPlayers: 8,
      name: document.getElementById('name').value,
      discoverable: true,
      joinApproval: true,
    });
    await mp.setDiscoverable(true);
    await mp.showQr();
    isHost = true;
    selfId = room.playerId;
    roster = room.players || [];
    setText(statusNode, 'Raum ' + room.roomCode + '. Den QR-Code zeigen.');
    render();
  } catch (error) {
    fail(error);
  }
};

document.getElementById('discover').onclick = async () => {
  try {
    await mp.stopDiscovery();
    await mp.discover({
      onRooms: (rooms) => {
        seenRooms = rooms || [];
        render();
      },
    });
    setText(statusNode, 'Suche Spiele in der Nähe.');
  } catch (error) {
    fail(error);
  }
};

async function joinRoom(roomId) {
  const room = await mp.join({ room: roomId, name: document.getElementById('name').value });
  isHost = false;
  selfId = room.playerId;
  roster = room.players || [];
  setText(statusNode, 'Beigetreten, Raum ' + room.roomCode + '.');
  render();
}

document.getElementById('allow').onclick = async () => {
  if (!pendingAsk) return;
  const id = pendingAsk;
  pendingAsk = '';
  setText(askText, '');
  await mp.approveJoin(id);
};

document.getElementById('deny').onclick = async () => {
  if (!pendingAsk) return;
  const id = pendingAsk;
  pendingAsk = '';
  setText(askText, '');
  await mp.denyJoin(id);
};

document.getElementById('join').onclick = async () => {
  try {
    const name = document.getElementById('name').value;
    const code = document.getElementById('code').value.trim();
    // Leer: EveryApp öffnet die Kamera. Ein Code oder die everyapp-mp-Zeichenkette ist für die Browser-Attrappe.
    const room = code ? await mp.join({ payload: code, name: name }) : await mp.join({ scan: true, name: name });
    isHost = false;
    selfId = room.playerId;
    roster = room.players || [];
    setText(statusNode, 'Beigetreten, Raum ' + room.roomCode + '.');
    render();
  } catch (error) {
    fail(error);
  }
};

document.getElementById('start').onclick = async () => {
  if (!isHost) {
    setText(statusNode, 'Nur der Host startet die Runde.');
    return;
  }
  try {
    state = applyLobbyMessage(state, { type: 'start' });
    render();
    await mp.broadcast({ type: 'start' });
  } catch (error) {
    fail(error);
  }
};

document.getElementById('plus').onclick = async () => {
  if (!isHost || state.phase !== 'round') return;
  try {
    state = applyLobbyMessage(state, { type: 'count' });
    render();
    await mp.broadcast({ type: 'count' });
  } catch (error) {
    fail(error);
  }
};

async function vote(choice) {
  if (state.phase !== 'round' || !selfId) return;
  try {
    if (isHost) {
      apply({ type: 'vote', choice: choice, from: selfId });
      await publishState();
      return;
    }
    await mp.send({ type: 'vote', choice: choice });
  } catch (error) {
    fail(error);
  }
}

document.getElementById('yes').onclick = () => { void vote('ja'); };
document.getElementById('no').onclick = () => { void vote('nein'); };

document.getElementById('leave').onclick = async () => {
  if (isHost) await mp.endRoom();
  else await mp.leave();
  isHost = false;
  selfId = '';
  roster = [];
  state = createLobby();
  if (storage && storage.set) void storage.set('lobby-state', state);
  setText(statusNode, 'Raum verlassen.');
  render();
};

void mp.resume().then((info) => {
  if (info && info.status && info.status !== 'none') void adopt(info);
});
