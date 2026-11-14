import { checkBridgePermission, permissionDecision } from './permissions';
import { Permission } from '../types';
import { NativeCapabilities } from './NativeCapabilities';
import { BRIDGE_EVENTS, RATE_LIMIT_ERROR, bridgeMethod, parseBridgeMessage, takeRate } from './allowlist';

export type ConsentAsk = (category: Permission) => Promise<boolean>;

export class BridgeMessageHandler {
  private appId: string;
  private grantedPermissions: Permission[];
  private deniedPermissions: Permission[];
  private capabilities: NativeCapabilities;
  private inject?: (js: string) => void;
  private ask?: ConsentAsk;

  constructor(
    appId: string,
    grantedPermissions: Permission[],
    capabilities: NativeCapabilities,
    inject?: (js: string) => void,
    consent?: { denied: Permission[]; ask?: ConsentAsk },
  ) {
    this.inject = inject;
    this.appId = appId;
    this.grantedPermissions = grantedPermissions;
    this.deniedPermissions = consent?.denied || [];
    this.ask = consent?.ask;
    this.capabilities = capabilities;
  }

  async handleMessage(message: any): Promise<any> {
    const parsed = parseBridgeMessage(message);
    if (parsed.kind === 'reject') return { id: parsed.id, success: false, error: parsed.error };

    if (parsed.kind === 'event') {
      try {
        const needed = BRIDGE_EVENTS[parsed.event];
        if (needed) await this.ensurePermission(needed);
        this.handleEventSubscription({ event: parsed.event, action: parsed.action });
        return { id: parsed.id, success: true };
      } catch (error: any) {
        return { id: parsed.id, success: false, error: error.message };
      }
    }

    const spec = bridgeMethod(parsed.method);
    if (!spec) return { id: parsed.id, success: false, error: `Unbekannte Methode: ${parsed.method}` };
    let args: unknown[];
    try {
      args = spec.validate(parsed.args);
    } catch (error: any) {
      return { id: parsed.id, success: false, error: error.message || 'Ungültige Argumente.' };
    }
    if (!takeRate(this.appId, parsed.method, spec.rate)) {
      return { id: parsed.id, success: false, error: RATE_LIMIT_ERROR };
    }
    try {
      await this.ensurePermission(spec.category);
      const result = await this.executeCapabilityMethod(spec.category, spec.action, args);
      return { id: parsed.id, success: true, result };
    } catch (error: any) {
      return { id: parsed.id, success: false, error: error.message };
    }
  }

  private async ensurePermission(category: string): Promise<void> {
    const decision = permissionDecision(category, this.grantedPermissions, this.deniedPermissions);
    if (decision === 'allow') return;
    if (decision === 'deny') {
      throw new Error(`„${category}“ ist für diese Mini-App nicht erlaubt. Du kannst das in den App-Infos ändern.`);
    }
    if (!this.ask) {
      checkBridgePermission(category, this.grantedPermissions);
      return;
    }
    const ok = await this.ask(category as Permission);
    if (!ok) throw new Error(`„${category}“ wurde nicht erlaubt.`);
    if (!this.grantedPermissions.includes(category as Permission)) this.grantedPermissions.push(category as Permission);
    this.deniedPermissions = this.deniedPermissions.filter((item) => item !== category);
  }

  private handleEventSubscription(message: any) {
    const { event, action, callbackId } = message;

    const caps: any = this.capabilities;
    caps.__forwarded = caps.__forwarded || {};
    if (action === 'on') {
      // Forward each event only once; the WebView fans out to its own listeners
      if (caps.__forwarded[event]) return;
      const inject = this.inject;
      const fn = (data: any) => {
        console.log('[EveryApp] event -> webview', event, JSON.stringify(data));
        inject?.(`window.dispatchBridgeEvent && window.dispatchBridgeEvent(${JSON.stringify(event)}, ${JSON.stringify(data ?? null)}); true;`);
      };
      caps.__forwarded[event] = fn;
      this.capabilities.eventEmitter.on(event, fn);
    } else if (action === 'off') {
      const fn = caps.__forwarded[event];
      if (fn) this.capabilities.eventEmitter.off(event, fn);
      delete caps.__forwarded[event];
    }
  }

  private async executeCapabilityMethod(category: string, action: string, args: unknown[]): Promise<any> {
    const handler = (this.capabilities as any)[category];
    if (!handler || typeof handler !== 'object' || !Object.prototype.hasOwnProperty.call(handler, action)) {
      throw new Error(`Unbekannte Methode: ${category}.${action}`);
    }
    const method = handler[action];
    if (typeof method !== 'function') throw new Error(`Unbekannte Methode: ${category}.${action}`);
    return await method.apply(handler, args);
  }

  generateBridgeScript(): string {
    return `
      (function() {
        let messageId = 0;
        const pendingMessages = {};
        // SVG → white alpha-mask PNG data URL (96px) for tile icons
        window.__eaSvgToPng = async function(spec) {
          let src = spec;
          if (/^<svg/i.test(spec)) src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(spec);
          else if (!/^data:/i.test(spec)) src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(await sendMessage('tiles.fetchSvg', [spec]));
          const img = new Image();
          await new Promise(function(res, rej) { img.onload = res; img.onerror = function() { rej(new Error('SVG-Icon konnte nicht gerendert werden')); }; img.src = src; });
          const c = document.createElement('canvas'); c.width = 96; c.height = 96;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0, 96, 96);
          g.globalCompositeOperation = 'source-in'; g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 96);
          return c.toDataURL('image/png');
        };
        const eventListeners = {};

        window.EveryAppBridge = {
          buildInfo: { isDev: ${__DEV__ ? 'true' : 'false'}, devClient: ${__DEV__ ? 'true' : 'false'}, environment: '${__DEV__ ? 'development' : 'production'}', buildType: '${__DEV__ ? 'SrvEveryApp' : 'EveryApp'}' },
          storage: {
            get: (key) => sendMessage('storage.get', [key]),
            set: (key, value) => sendMessage('storage.set', [key, value]),
            remove: (key) => sendMessage('storage.remove', [key]),
          },
          secrets: {
            get: (key) => sendMessage('secrets.get', [key]),
            set: (key, value) => sendMessage('secrets.set', [key, value]),
            delete: (key) => sendMessage('secrets.delete', [key]),
            list: () => sendMessage('secrets.list', []),
            info: () => sendMessage('secrets.info', []),
          },
          http: {
            request: async (req) => {
              return await sendMessage('http.request', [req]);
            },
            fetch: async (url, options) => {
              const response = await sendMessage('http.fetch', [url, options]);
              return {
                ok: response.ok,
                status: response.status,
                json: async () => JSON.parse(response.body),
                text: async () => response.body,
              };
            },
          },
          bluetooth: {
            scan: () => sendMessage('bluetooth.scan', []),
            connect: (deviceId) => sendMessage('bluetooth.connect', [deviceId]),
            disconnect: (deviceId) => sendMessage('bluetooth.disconnect', [deviceId]),
            getConnectedDevices: (includePaired) => sendMessage('bluetooth.getConnectedDevices', [!!includePaired]),
          },
          notifications: {
            schedule: (title, body, seconds) => sendMessage('notifications.schedule', [title, body, seconds]),
          },
          camera: {
            takePicture: () => sendMessage('camera.takePicture', []),
          },
          sensors: {
            getAccelerometer: () => sendMessage('sensors.getAccelerometer', []),
            getGyroscope: () => sendMessage('sensors.getGyroscope', []),
          },
          vibration: {
            vibrate: (pattern) => sendMessage('vibration.vibrate', [pattern]),
          },
          background: {
            enable: () => sendMessage('background.enable', []),
            disable: () => sendMessage('background.disable', []),
            isEnabled: () => sendMessage('background.isEnabled', []),
            handlesTriggers: () => sendMessage('background.handlesTriggers', []),
            getLog: () => sendMessage('background.getLog', []),
            clearLog: () => sendMessage('background.clearLog', []),
            registerTask: (task) => sendMessage('background.registerTask', [task]),
            unregisterTask: (id) => sendMessage('background.unregisterTask', [id]),
            unregisterAll: () => sendMessage('background.unregisterAll', []),
            listTasks: () => sendMessage('background.listTasks', []),
            getTileSlots: () => sendMessage('background.getTileSlots', []),
            setUi: (conf) => sendMessage('background.setUi', [conf]),
            getUi: () => sendMessage('background.getUi', []),
            tileUpdate: (s, patch) => sendMessage('background.tileUpdate', [s, patch]),
            widgetUpdate: (id, patch) => sendMessage('background.widgetUpdate', [id, patch]),
          },
          spotify: {
            isAvailable: () => sendMessage('spotify.isAvailable', []),
            login: () => sendMessage('spotify.login', []),
            logout: () => sendMessage('spotify.logout', []),
            connect: () => sendMessage('spotify.connect', []),
            disconnect: () => sendMessage('spotify.disconnect', []),
            play: (uri, options) => sendMessage('spotify.play', [uri, options || {}]),
            pause: () => sendMessage('spotify.pause', []),
            resume: () => sendMessage('spotify.resume', []),
            stop: () => sendMessage('spotify.stop', []),
            skipNext: () => sendMessage('spotify.skipNext', []),
            skipPrevious: () => sendMessage('spotify.skipPrevious', []),
            seek: (positionMs) => sendMessage('spotify.seek', [positionMs]),
            getPlayerState: () => sendMessage('spotify.getPlayerState', []),
            search: (query, options) => sendMessage('spotify.search', [query, options || {}]),
            getMe: () => sendMessage('spotify.getMe', []),
            getMyPlaylists: (options) => sendMessage('spotify.getMyPlaylists', [options || {}]),
            getSavedTracks: (options) => sendMessage('spotify.getSavedTracks', [options || {}]),
            setClientId: (clientId) => sendMessage('spotify.setClientId', [clientId]),
            getClientId: () => sendMessage('spotify.getClientId', []),
          },
          media: {
            play: () => sendMessage('media.play', []),
            pause: () => sendMessage('media.pause', []),
            toggle: () => sendMessage('media.toggle', []),
            next: () => sendMessage('media.next', []),
            previous: () => sendMessage('media.previous', []),
            stop: () => sendMessage('media.stop', []),
          },
          network: {
            isAvailable: () => sendMessage('network.isAvailable', []),
            getInfo: () => sendMessage('network.getInfo', []),
            getWifi: () => sendMessage('network.getWifi', []),
          },
          popup: {
            open: (spec) => sendMessage('popup.open', [spec]),
            send: (id, data) => sendMessage('popup.send', [id, data]),
            close: (id) => sendMessage('popup.close', [id]),
            state: (id) => sendMessage('popup.state', [id]),
          },
          // tile(n).set({icon,label,subtitle,state}) – SVG icons are rasterized here (WebView canvas) to PNG
          tile: (n) => ({
            set: async (patch) => {
              patch = Object.assign({}, patch || {});
              if (typeof patch.icon === 'string' && /^<svg|^data:image[/]svg|[.]svg([?]|#|$)/i.test(patch.icon.trim())) patch.icon = await window.__eaSvgToPng(patch.icon.trim());
              return sendMessage('tiles.set', [n, patch]);
            },
            get: () => sendMessage('tiles.get', [n]),
            release: () => sendMessage('tiles.release', [n]),
          }),
          net: {
            isAvailable: () => sendMessage('net.isAvailable', []),
            tcp: async (host, port, o) => {
              const id = await sendMessage('net.tcpOpen', [host, port, o || {}]);
              return { id, send: (d) => sendMessage('net.tcpSend', [id, d]), receive: (r) => sendMessage('net.tcpReceive', [id, r || {}]),
                close: () => sendMessage('net.tcpClose', [id]) };
            },
            udpSend: (h, p, d, o) => sendMessage('net.udpSend', [h, p, d, o || {}]),
            udpListen: (ports, ms) => sendMessage('net.udpListen', [ports, ms]),
            tuyaStatus: (cfg) => sendMessage('net.tuyaStatus', [cfg]),
            tuyaSet: (cfg, dps) => sendMessage('net.tuyaSet', [cfg, dps]),
            tuyaDiscover: (ms) => sendMessage('net.tuyaDiscover', [ms]),
          },
          crypto: {
            isAvailable: () => sendMessage('crypto.isAvailable', []),
            aesEcb: (e, k, d) => sendMessage('crypto.aesEcb', [e, k, d]),
            aesGcm: (e, k, iv, aad, d) => sendMessage('crypto.aesGcm', [e, k, iv, aad || '', d]),
            hmacSha256: (k, d) => sendMessage('crypto.hmacSha256', [k, d]),
            md5: (d) => sendMessage('crypto.md5', [d]),
            crc32: (d) => sendMessage('crypto.crc32', [d]),
            randomHex: (n) => sendMessage('crypto.randomHex', [n]),
          },
          ble: {
            isAvailable: () => sendMessage('ble.isAvailable', []),
            scan: (o) => sendMessage('ble.scan', [o || {}]),
            connect: (a, o) => sendMessage('ble.connect', [a, o || {}]),
            disconnect: (a) => sendMessage('ble.disconnect', [a]),
            write: (a, s, c, d, o) => sendMessage('ble.write', [a, s, c, d, o || {}]),
            read: (a, s, c, o) => sendMessage('ble.read', [a, s, c, o || {}]),
            notify: (a, s, c, e, o) => sendMessage('ble.notify', [a, s, c, e !== false, o || {}]),
          },
          clipboard: {
            setString: (text) => sendMessage('clipboard.setString', [text]),
            getString: () => sendMessage('clipboard.getString', []),
          },
          multiplayer: {
            host: (opts) => sendMessage('multiplayer.host', opts ? [opts] : []),
            join: (input) => sendMessage('multiplayer.join', [input]),
            send: (data, opts) => sendMessage('multiplayer.send', opts ? [data, opts] : [data]),
            broadcast: (data) => sendMessage('multiplayer.broadcast', [data]),
            leave: () => sendMessage('multiplayer.leave', []),
            showQr: () => sendMessage('multiplayer.showQr', []),
            onMessage: (callback) => {
              window.EveryAppBridge.events.on('multiplayer.message', callback);
              return () => window.EveryAppBridge.events.off('multiplayer.message', callback);
            },
            onPlayersChanged: (callback) => {
              window.EveryAppBridge.events.on('multiplayer.players', callback);
              return () => window.EveryAppBridge.events.off('multiplayer.players', callback);
            },
          },
          events: {
            on: (event, callback) => {
              if (!eventListeners[event]) {
                eventListeners[event] = [];
              }
              eventListeners[event].push(callback);
              
              const callbackId = messageId++;
              sendEventSubscription(event, 'on', callbackId);
            },
            off: (event, callback) => {
              if (eventListeners[event]) {
                const index = eventListeners[event].indexOf(callback);
                if (index > -1) {
                  eventListeners[event].splice(index, 1);
                }
                if (eventListeners[event].length === 0) {
                  delete eventListeners[event];
                  sendEventSubscription(event, 'off');
                }
              }
            },
          },
        };

        window.dispatchBridgeEvent = function(event, data) {
          const listeners = eventListeners[event];
          if (listeners) {
            listeners.forEach(callback => {
              try {
                callback(data);
              } catch (error) {
                console.error('Event callback error:', error);
              }
            });
          }
        };

        function sendMessage(method, args) {
          return new Promise((resolve, reject) => {
            const id = messageId++;
            pendingMessages[id] = { resolve, reject };
            window.ReactNativeWebView.postMessage(JSON.stringify({ id, method, args }));
          });
        }

        function sendEventSubscription(event, action, callbackId) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'event',
            event,
            action,
            callbackId
          }));
        }

        window.handleBridgeResponse = function(response) {
          const pending = pendingMessages[response.id];
          if (pending) {
            delete pendingMessages[response.id];
            if (response.success) {
              pending.resolve(response.result);
            } else {
              pending.reject(new Error(response.error));
            }
          }
        };

        window.__eaReadAsset = function(url) {
          return sendMessage('__asset.read', [String(url == null ? '' : url)]);
        };

        setTimeout(() => {
          window.dispatchBridgeEvent('app.start', { timestamp: Date.now() });
        }, 100);
      })();
    `;
  }
}
