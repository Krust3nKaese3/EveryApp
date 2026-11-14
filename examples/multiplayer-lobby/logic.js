/**
 * Spielregeln der Lobby-Vorlage, ohne DOM.
 * Der Host ist die Quelle des Spielstands. Nach einem Reconnect schickt er den Stand neu.
 */
function createLobby() {
  return { phase: 'lobby', round: 0, count: 0, votes: {} };
}

function applyLobbyMessage(state, message) {
  const current = state || createLobby();
  if (!message || typeof message !== 'object') return current;
  if (message.type === 'state' && message.state && typeof message.state === 'object') {
    return normalizeState(message.state);
  }
  if (message.type === 'start') {
    return { phase: 'round', round: (current.round || 0) + 1, count: 0, votes: {} };
  }
  if (message.type === 'count' && current.phase === 'round') {
    return { ...current, count: (current.count || 0) + 1 };
  }
  if (message.type === 'vote' && current.phase === 'round') {
    const choice = message.choice === 'ja' ? 'ja' : 'nein';
    const from = typeof message.from === 'string' ? message.from : '';
    if (!from) return current;
    return { ...current, votes: { ...current.votes, [from]: choice } };
  }
  return current;
}

function normalizeState(raw) {
  const votes = {};
  const source = raw.votes && typeof raw.votes === 'object' ? raw.votes : {};
  Object.keys(source).forEach((key) => {
    votes[key] = source[key] === 'ja' ? 'ja' : 'nein';
  });
  return {
    phase: raw.phase === 'round' ? 'round' : 'lobby',
    round: Number.isFinite(raw.round) ? raw.round : 0,
    count: Number.isFinite(raw.count) ? raw.count : 0,
    votes,
  };
}

/** Ids, die vorher getrennt waren und jetzt wieder verbunden sind. */
function reconnectedIds(before, players) {
  const previous = new Map((before || []).map((player) => [player.id, player.connected]));
  return (players || [])
    .filter((player) => player.connected && previous.get(player.id) === false)
    .map((player) => player.id);
}

const lobbyApi = { createLobby, applyLobbyMessage, reconnectedIds };
if (typeof module === 'object' && module.exports) module.exports = lobbyApi;
