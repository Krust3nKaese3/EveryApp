// Vorlage für eine Mini-App. Nur textContent, keine HTML-Namen.
// Callbacks stehen vor host() und join(), sonst fehlt die erste Spielerliste.
const mp = window.EveryAppBridge.multiplayer;
const statusNode = document.getElementById('status');
const playersNode = document.getElementById('players');
const roundNode = document.getElementById('round');

let selfId = '';
let isHost = false;
let state = createLobby();
let roster = [];

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

function fail(error) {
  setText(statusNode, error && error.message ? error.message : 'Das hat nicht geklappt.');
}

document.getElementById('host').onclick = async () => {
  try {
    const room = await mp.host({ maxPlayers: 8, name: document.getElementById('name').value });
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
  await mp.leave();
  isHost = false;
  selfId = '';
  roster = [];
  state = createLobby();
  setText(statusNode, 'Raum verlassen.');
  render();
};
