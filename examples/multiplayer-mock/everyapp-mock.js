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
    const roomListeners = new Set();
    const joinListeners = new Set();
    const resumeListeners = new Set();
    const awayListeners = new Set();
    const rooms = new Map();
    const memory = opts.store || new Map();
    let hosted = null;
    let self = null;
    let welcomeWait = null;
    let discoverStop = null;

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

    function load() {
      return memory.get(appId) || null;
    }

    function save(record) {
      if (!record) memory.delete(appId);
      else memory.set(appId, record);
    }

    function publicView(record, status) {
      if (!record) return { status: 'none', role: '', roomCode: '', selfId: '', players: [] };
      return {
        status: status,
        role: record.role,
        roomCode: record.roomCode,
        selfId: record.selfId,
        players: record.roster || [],
      };
    }

    function rememberHost() {
      if (!hosted || !self) return;
      save({
        role: 'host',
        roomId: hosted.roomId,
        roomCode: hosted.roomCode,
        token: hosted.token,
        hostName: hosted.hostName,
        maxPlayers: hosted.maxPlayers,
        discoverable: hosted.discoverable,
        joinApproval: hosted.joinApproval,
        selfId: self.id,
        secret: self.secret,
        members: hosted.members,
        roster: publicPlayers(hosted.members),
        updatedAt: Date.now(),
      });
    }

    function rememberGuest(roster) {
      if (!self || hosted) return;
      const known = rooms.get(self.roomCode) || {};
      save({
        role: 'guest',
        roomId: known.roomId || self.roomId || '',
        roomCode: self.roomCode,
        token: known.token || self.token || '',
        hostName: known.hostName || '',
        selfId: self.id,
        secret: self.secret,
        roster: roster || [],
        updatedAt: Date.now(),
      });
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
        const list = [];
        rooms.forEach((room) => {
          if (room.discoverable === false) return;
          list.push({
            id: room.roomId,
            roomCode: room.roomCode,
            hostName: room.hostName,
            players: room.players,
            maxPlayers: room.maxPlayers,
          });
        });
        roomListeners.forEach((cb) => cb(list));
        return;
      }
      if (message.kind === 'discover' && hosted && hosted.discoverable) {
        post({
          kind: 'announce',
          roomCode: hosted.roomCode,
          roomId: hosted.roomId,
          token: hosted.token,
          maxPlayers: hosted.maxPlayers,
          qrPayload: hosted.qrPayload,
          hostName: hosted.hostName,
          players: hosted.members.filter((member) => member.connected).length,
          discoverable: true,
        });
        return;
      }
      if (message.kind === 'ask' && hosted && message.roomId === hosted.roomId) {
        const name = String(message.name || 'Spieler').replace(/[\u0000-\u001f<>&"'`]/g, '').slice(0, 24) || 'Spieler';
        if (!hosted.joinApproval) {
          admit(message.tabId, name);
          return;
        }
        const id = hex(8);
        hosted.asks.set(id, { tabId: message.tabId, name: name });
        joinListeners.forEach((cb) => cb({ id: id, name: name, roomCode: hosted.roomCode, hostName: hosted.hostName }));
        return;
      }
      if (message.kind === 'ended' && self && message.roomCode === self.roomCode) {
        save(null);
        self = null;
        if (welcomeWait) welcomeWait(message);
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
        post({ kind: 'welcome', to: message.tabId, playerId: member.id, secret: member.secret, players: publicPlayers(hosted.members), roomCode: hosted.roomCode, roomId: hosted.roomId, token: hosted.token, qrPayload: hosted.qrPayload });
        post({ kind: 'players', roomCode: hosted.roomCode, players: publicPlayers(hosted.members) });
        emitPlayers(publicPlayers(hosted.members));
        rememberHost();
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

    function admit(tabId, name) {
      if (hosted.members.length >= hosted.maxPlayers) {
        post({ kind: 'error', to: tabId, code: 'full', message: 'Der Raum ist voll.' });
        return;
      }
      const member = {
        id: hex(8),
        secret: hex(16),
        name: name,
        host: false,
        connected: true,
        tabId: tabId,
      };
      hosted.members.push(member);
      post({ kind: 'welcome', to: tabId, playerId: member.id, secret: member.secret, players: publicPlayers(hosted.members), roomCode: hosted.roomCode, roomId: hosted.roomId, token: hosted.token, qrPayload: hosted.qrPayload });
      post({ kind: 'players', roomCode: hosted.roomCode, players: publicPlayers(hosted.members) });
      emitPlayers(publicPlayers(hosted.members));
      rememberHost();
    }

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
        const saved = load();
        if (saved && saved.role === 'guest') throw new Error('Du bist noch in einem Raum. Verlasse ihn zuerst.');
        const restoring = saved && saved.role === 'host' ? saved : null;
        const maxPlayers = restoring ? restoring.maxPlayers : (settings.maxPlayers || 8);
        const code = restoring ? restoring.roomCode : roomCode();
        const token = restoring ? restoring.token : hex(16);
        const roomId = restoring ? restoring.roomId : hex(16);
        const hostId = restoring ? restoring.selfId : hex(8);
        const hostSecret = restoring ? restoring.secret : hex(16);
        const hostName = String((restoring && restoring.hostName) || settings.name || 'Spieler').slice(0, 24);
        const members = restoring && restoring.members ? restoring.members : [{ id: hostId, secret: hostSecret, name: hostName, host: true, connected: true, tabId: tabId }];
        members.forEach((member) => {
          member.connected = member.host;
          if (member.host) member.tabId = tabId;
        });
        hosted = {
          roomCode: code,
          token: token,
          roomId: roomId,
          maxPlayers: maxPlayers,
          hostName: hostName,
          discoverable: restoring ? restoring.discoverable !== false : settings.discoverable !== false,
          joinApproval: restoring ? restoring.joinApproval !== false : settings.joinApproval !== false,
          hostId: hostId,
          members: members,
          asks: new Map(),
          qrPayload: '',
        };
        hosted.qrPayload = qrFor(hosted);
        self = { id: hostId, secret: hostSecret, roomCode: code, qrPayload: hosted.qrPayload };
        post({
          kind: 'announce',
          roomCode: code,
          roomId: roomId,
          token: token,
          maxPlayers: maxPlayers,
          qrPayload: hosted.qrPayload,
          hostName: hostName,
          players: members.filter((member) => member.connected).length,
          discoverable: hosted.discoverable,
        });
        emitPlayers(publicPlayers(hosted.members));
        rememberHost();
        if (restoring) resumeListeners.forEach((cb) => cb(publicView(load(), 'ready')));
        return snapshot();
      },
      async join(input) {
        if (input && typeof input === 'object' && input.scan) {
          throw new Error('Im Browser den Raumcode übergeben. Die Kamera gibt es nur in EveryApp.');
        }
        const name = input && typeof input === 'object' ? input.name : '';
        if (input && typeof input === 'object' && input.room) {
          const start = Date.now();
          let found = null;
          while (Date.now() - start < 500) {
            rooms.forEach((room) => {
              if (room.roomId === input.room) found = room;
            });
            if (found) break;
            post({ kind: 'discover' });
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
          if (!found) throw new Error('Kein Raum in der Nähe.');
          const pending = waitWelcome();
          post({ kind: 'ask', roomId: found.roomId, name: name || 'Spieler' });
          const welcome = await pending;
          if (welcome.kind === 'error' || welcome.kind === 'ended') throw new Error(welcome.message || 'Beitritt abgelehnt.');
          self = { id: welcome.playerId, secret: welcome.secret, roomCode: welcome.roomCode, roomId: welcome.roomId, token: welcome.token, qrPayload: welcome.qrPayload };
          emitPlayers(welcome.players);
          rememberGuest(welcome.players);
          return { roomCode: self.roomCode, qrPayload: self.qrPayload, playerId: self.id, players: welcome.players };
        }
        const raw = typeof input === 'string' ? input : ((input && (input.payload || input.qrPayload || input.roomCode)) || '');
        const found = await findRoom(String(raw));
        const pending = waitWelcome();
        const saved = load();
        const known = self && self.roomCode === found.roomCode
          ? self
          : (saved && saved.role === 'guest' && saved.roomCode === found.roomCode ? saved : null);
        post({
          kind: 'hello',
          tabId: tabId,
          roomCode: found.roomCode,
          token: found.token,
          name: name || 'Spieler',
          playerId: known ? (known.id || known.selfId) : undefined,
          secret: known ? known.secret : undefined,
        });
        const welcome = await pending;
        self = { id: welcome.playerId, secret: welcome.secret, roomCode: welcome.roomCode, roomId: welcome.roomId, token: welcome.token, qrPayload: welcome.qrPayload || found.qrPayload };
        emitPlayers(welcome.players);
        rememberGuest(welcome.players);
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
        if (hosted) {
          channel.close();
          return { left: false };
        }
        if (self) post({ kind: 'leave', tabId: tabId, roomCode: self.roomCode, secret: self.secret });
        save(null);
        hosted = null;
        self = null;
        channel.close();
        return { left: true };
      },
      async showQr() {
        if (!hosted) throw new Error('Nur der Host zeigt den QR-Code.');
        return { roomCode: hosted.roomCode, qrPayload: hosted.qrPayload };
      },
      async discover(options) {
        const onRooms = options && options.onRooms;
        if (typeof onRooms === 'function') roomListeners.add(onRooms);
        post({ kind: 'discover' });
        discoverStop = () => {
          if (typeof onRooms === 'function') roomListeners.delete(onRooms);
        };
        return discoverStop;
      },
      async stopDiscovery() {
        if (discoverStop) discoverStop();
        discoverStop = null;
        return { stopped: true };
      },
      async setDiscoverable(on) {
        if (!hosted) throw new Error('Nur der Host ändert die Suche.');
        hosted.discoverable = !!on;
        rememberHost();
        if (hosted.discoverable) {
          post({
            kind: 'announce', roomCode: hosted.roomCode, roomId: hosted.roomId, token: hosted.token,
            maxPlayers: hosted.maxPlayers, qrPayload: hosted.qrPayload, hostName: hosted.hostName,
            players: hosted.members.filter((member) => member.connected).length, discoverable: true,
          });
        }
        return { discoverable: hosted.discoverable };
      },
      async approveJoin(id) {
        if (!hosted) throw new Error('Nur der Host lässt Gäste zu.');
        const ask = hosted.asks.get(id);
        if (!ask) throw new Error('Die Anfrage ist abgelaufen.');
        hosted.asks.delete(id);
        admit(ask.tabId, ask.name);
        return { approved: true };
      },
      async denyJoin(id) {
        if (!hosted) throw new Error('Nur der Host lehnt Gäste ab.');
        const ask = hosted.asks.get(id);
        if (!ask) return { denied: false };
        hosted.asks.delete(id);
        post({ kind: 'error', to: ask.tabId, code: 'denied', message: 'Der Host hat abgelehnt.' });
        return { denied: true };
      },
      onJoinRequest(callback) {
        joinListeners.add(callback);
        return () => joinListeners.delete(callback);
      },
      async endRoom() {
        if (hosted) {
          post({ kind: 'ended', roomCode: hosted.roomCode, message: 'Der Host hat den Raum beendet.' });
        } else if (load() && load().role === 'host') {
          save(null);
        }
        save(null);
        hosted = null;
        self = null;
        channel.close();
        return { ended: true };
      },
      async resume() {
        const saved = load();
        if (!saved || !saved.secret) return { status: 'none', role: '', roomCode: '', selfId: '', players: [] };
        if (saved.role === 'host') {
          const room = await multiplayer.host({ name: saved.hostName });
          return { status: 'ready', role: 'host', roomCode: room.roomCode, selfId: room.playerId, players: room.players };
        }
        try {
          const room = await multiplayer.join({ payload: saved.roomCode, name: 'Spieler' });
          return { status: 'ready', role: 'guest', roomCode: room.roomCode, selfId: room.playerId, players: room.players };
        } catch (error) {
          const away = { roomCode: saved.roomCode, message: 'Host ist kurz weg' };
          awayListeners.forEach((cb) => cb(away));
          return { status: 'hostAway', role: 'guest', roomCode: saved.roomCode, selfId: saved.selfId, players: saved.roster || [] };
        }
      },
      onResumed(callback) {
        resumeListeners.add(callback);
        return () => resumeListeners.delete(callback);
      },
      onHostAway(callback) {
        awayListeners.add(callback);
        return () => awayListeners.delete(callback);
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
