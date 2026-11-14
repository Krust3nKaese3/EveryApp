/**
 * Browser-Attrappe für window.EveryAppBridge.multiplayer.
 * Ein Tab ist ein Gerät. Die Tabs sprechen über BroadcastChannel, der Host-Tab verteilt.
 * Am PC: zwei Tabs auf dieselbe HTML-Datei, jeder lädt dieses Skript vor der Mini-App.
 * join({ scan: true }) gibt es hier nicht. Stattdessen den Raumcode oder die qrPayload übergben.
 * In Node: const { installEveryAppMock } = require('./everyapp-mock.js')
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.installEveryAppMock = api.installEveryAppMock;
    api.installEveryAppMock();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_BYTES = 32 * 1024;
  const CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function bytesOf(value) {
    return unescape(encodeURIComponent(value)).length;
  }

  function checkPayload(data) {
    let json;
    try {
      json = JSON.stringify(data);
    } catch (error) {
      throw new Error('Nachricht lässt sich nicht lesen.');
    }
    if (json == null || json === undefined) throw new Error('Nachricht enthält einen nicht unterstützten Wert.');
    if (bytesOf(json) > MAX_BYTES) throw new Error('Nachricht ist zu groß (höchstens 32 KiB).');
    return JSON.parse(json);
  }

  function roomCode() {
    let out = '';
    for (let i = 0; i < 4; i++) out += CODE[Math.floor(Math.random() * CODE.length)];
    return out;
  }

  function hex(count) {
    let out = '';
    for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  }

  function installEveryAppMock(options) {
    const opts = options || {};
    const appId = opts.appId || 'multiplayer-lobby';
    const channel = new BroadcastChannel(opts.channel || 'everyapp-mp-mock-v1');
    if (typeof channel.unref === 'function') channel.unref();
    const tabId = hex(8);
    const messageListeners = new Set();
    const playerListeners = new Set();
    const rooms = new Map();
    let hosted = null;
    let self = null;
    let welcomeWait = null;

    function post(message) {
      channel.postMessage({ ...message, appId: appId });
    }

    function emitMessage(message) {
      messageListeners.forEach((cb) => cb(message));
    }

    function emitPlayers(players) {
      const roster = { players: players, selfId: self ? self.id : '', roomCode: self ? self.roomCode : (hosted ? hosted.roomCode : '') };
      playerListeners.forEach((cb) => cb(roster));
    }

    function publicPlayers(members) {
      return members.map((member) => ({ id: member.id, name: member.name, host: member.host, connected: member.connected }));
    }

    function qrFor(room) {
      const query = new URLSearchParams({
        v: '1', host: '192.168.1.20', port: '4040', room: room.roomCode, token: room.token, app: appId,
      });
      return 'everyapp-mp://join?' + query.toString();
    }

    function snapshot() {
      const members = hosted ? hosted.members : [];
      return {
        roomCode: hosted ? hosted.roomCode : (self ? self.roomCode : ''),
        qrPayload: hosted ? hosted.qrPayload : (self ? self.qrPayload : ''),
        playerId: self ? self.id : (hosted ? hosted.hostId : ''),
        players: publicPlayers(members),
      };
    }

    channel.onmessage = (event) => {
      const message = event.data;
      if (!message || message.appId !== appId) return;
      if (message.kind === 'announce') {
        rooms.set(message.roomCode, message);
        return;
      }
      if (message.kind === 'hello' && hosted && message.roomCode === hosted.roomCode) {
        if (message.token !== hosted.token) {
          post({ kind: 'error', to: message.tabId, code: 'auth', message: 'Raumcode oder Token passt nicht.' });
          return;
        }
        let member = hosted.members.find((item) => item.id === message.playerId);
        if (message.playerId) {
          if (!member || member.secret !== message.secret || member.host) {
            post({ kind: 'error', to: message.tabId, code: 'auth', message: 'Raumcode oder Token passt nicht.' });
            return;
          }
          member.connected = true;
          member.tabId = message.tabId;
        } else {
          if (hosted.members.length >= hosted.maxPlayers) {
            post({ kind: 'error', to: message.tabId, code: 'full', message: 'Der Raum ist voll.' });
            return;
          }
          member = {
            id: hex(8),
            secret: hex(16),
            name: String(message.name || 'Spieler').replace(/[\u0000-\u001f<>&"'`]/g, '').slice(0, 24) || 'Spieler',
            host: false,
            connected: true,
            tabId: message.tabId,
          };
          hosted.members.push(member);
        }
        post({ kind: 'welcome', to: message.tabId, playerId: member.id, secret: member.secret, players: publicPlayers(hosted.members), roomCode: hosted.roomCode, qrPayload: hosted.qrPayload });
        post({ kind: 'players', roomCode: hosted.roomCode, players: publicPlayers(hosted.members) });
        emitPlayers(publicPlayers(hosted.members));
        return;
      }
      if (message.kind === 'welcome' && message.to === tabId && welcomeWait) {
        welcomeWait(message);
        return;
      }
      if (message.kind === 'error' && message.to === tabId && welcomeWait) {
        welcomeWait(message);
        return;
      }
      if (message.kind === 'players' && self && message.roomCode === self.roomCode) {
        emitPlayers(message.players);
        return;
      }
      if (message.kind === 'drop' && hosted && message.secret) {
        const member = hosted.members.find((item) => item.tabId === message.tabId && item.secret === message.secret);
        if (member) {
          member.connected = false;
          post({ kind: 'players', roomCode: hosted.roomCode, players: publicPlayers(hosted.members) });
          emitPlayers(publicPlayers(hosted.members));
        }
        return;
      }
      if (message.kind === 'client-msg' && hosted && message.roomCode === hosted.roomCode) {
        const member = hosted.members.find((item) => item.tabId === message.tabId && item.secret === message.secret && item.connected);
        if (!member) return;
        const targets = message.all
          ? hosted.members.filter((item) => item.connected && item.id !== member.id)
          : hosted.members.filter((item) => item.connected && item.id === (message.to || hosted.hostId) && item.id !== member.id);
        if (targets.some((item) => item.host)) emitMessage({ from: member.id, data: message.data });
        post({
          kind: 'msg',
          roomCode: hosted.roomCode,
          from: member.id,
          data: message.data,
          targets: targets.filter((item) => !item.host).map((item) => item.tabId),
        });
        return;
      }
      if (message.kind === 'msg' && self && message.roomCode === self.roomCode && message.targets && message.targets.indexOf(tabId) >= 0) {
        emitMessage({ from: message.from, data: message.data });
      }
    };

    function waitWelcome() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          welcomeWait = null;
          reject(new Error('Der Host antwortet nicht.'));
        }, 1000);
        welcomeWait = (message) => {
          clearTimeout(timer);
          welcomeWait = null;
          if (message.kind === 'error') reject(new Error(message.message));
          else resolve(message);
        };
      });
    }

    async function findRoom(raw) {
      let code = '';
      let token = '';
      if (/^[A-Z2-9]{4}$/i.test(raw)) code = raw.toUpperCase();
      else {
        const url = new URL(raw);
        code = (url.searchParams.get('room') || '').toUpperCase();
        token = (url.searchParams.get('token') || '').toLowerCase();
      }
      const start = Date.now();
      while (Date.now() - start < 500) {
        const found = rooms.get(code);
        if (found) {
          if (token && token !== found.token) throw new Error('Raumcode oder Token passt nicht.');
          return found;
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      throw new Error('Kein Raum mit diesem Code. Zuerst den Host-Tab öffnen.');
    }

    const multiplayer = {
      async host(hostOptions) {
        const settings = hostOptions || {};
        const maxPlayers = settings.maxPlayers || 8;
        const code = roomCode();
        const token = hex(16);
        const hostId = hex(8);
        const hostMember = { id: hostId, secret: hex(16), name: String(settings.name || 'Spieler').slice(0, 24), host: true, connected: true, tabId: tabId };
        hosted = { roomCode: code, token: token, maxPlayers: maxPlayers, hostId: hostId, members: [hostMember], qrPayload: '' };
        hosted.qrPayload = qrFor(hosted);
        self = { id: hostId, secret: hostMember.secret, roomCode: code, qrPayload: hosted.qrPayload };
        post({ kind: 'announce', roomCode: code, token: token, maxPlayers: maxPlayers, qrPayload: hosted.qrPayload });
        emitPlayers(publicPlayers(hosted.members));
        return snapshot();
      },
      async join(input) {
        if (input && typeof input === 'object' && input.scan) {
          throw new Error('Im Browser den Raumcode übergeben. Die Kamera gibt es nur in EveryApp.');
        }
        const raw = typeof input === 'string' ? input : ((input && (input.payload || input.qrPayload || input.roomCode)) || '');
        const name = input && typeof input === 'object' ? input.name : '';
        const found = await findRoom(String(raw));
        const pending = waitWelcome();
        post({
          kind: 'hello',
          tabId: tabId,
          roomCode: found.roomCode,
          token: found.token,
          name: name || 'Spieler',
          playerId: self && self.roomCode === found.roomCode ? self.id : undefined,
          secret: self && self.roomCode === found.roomCode ? self.secret : undefined,
        });
        const welcome = await pending;
        self = { id: welcome.playerId, secret: welcome.secret, roomCode: welcome.roomCode, qrPayload: welcome.qrPayload || found.qrPayload };
        emitPlayers(welcome.players);
        return {
          roomCode: self.roomCode,
          qrPayload: self.qrPayload,
          playerId: self.id,
          players: welcome.players,
        };
      },
      async send(data, sendOptions) {
        const clean = checkPayload(data);
        if (hosted) {
          if (!sendOptions || !sendOptions.to) throw new Error('Der Host braucht einen Empfänger oder broadcast.');
          const target = hosted.members.find((member) => member.id === sendOptions.to && member.connected);
          if (!target) throw new Error('Empfänger ist nicht verbunden.');
          post({ kind: 'msg', roomCode: hosted.roomCode, from: hosted.hostId, data: clean, targets: [target.tabId] });
          return { seq: 1 };
        }
        if (!self) throw new Error('Keine Verbindung zum Raum.');
        post({ kind: 'client-msg', tabId: tabId, roomCode: self.roomCode, secret: self.secret, data: clean, to: sendOptions && sendOptions.to, all: false });
        return { seq: 0 };
      },
      async broadcast(data) {
        const clean = checkPayload(data);
        if (hosted) {
          const targets = hosted.members.filter((member) => member.connected && !member.host).map((member) => member.tabId);
          post({ kind: 'msg', roomCode: hosted.roomCode, from: hosted.hostId, data: clean, targets: targets });
          return { seq: 1 };
        }
        if (!self) throw new Error('Keine Verbindung zum Raum.');
        post({ kind: 'client-msg', tabId: tabId, roomCode: self.roomCode, secret: self.secret, data: clean, all: true });
        return { seq: 0 };
      },
      onMessage(callback) {
        messageListeners.add(callback);
        return () => messageListeners.delete(callback);
      },
      onPlayersChanged(callback) {
        playerListeners.add(callback);
        return () => playerListeners.delete(callback);
      },
      async leave() {
        if (self) post({ kind: 'leave', tabId: tabId, roomCode: self.roomCode, secret: self.secret });
        hosted = null;
        self = null;
        channel.close();
        return { left: true };
      },
      async showQr() {
        if (!hosted) throw new Error('Nur der Host zeigt den QR-Code.');
        return { roomCode: hosted.roomCode, qrPayload: hosted.qrPayload };
      },
    };

    const target = opts.global || (typeof window !== 'undefined' ? window : root);
    target.EveryAppBridge = target.EveryAppBridge || {};
    target.EveryAppBridge.multiplayer = multiplayer;
    return {
      multiplayer: multiplayer,
      debug: {
        drop() {
          if (!self || hosted) return;
          post({ kind: 'drop', tabId: tabId, roomCode: self.roomCode, secret: self.secret });
        },
        resume() {
          return multiplayer.join(self.roomCode);
        },
      },
    };
  }

  return { installEveryAppMock: installEveryAppMock };
});
