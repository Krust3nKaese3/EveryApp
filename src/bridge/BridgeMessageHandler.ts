import { Permission } from '../types';
import { NativeCapabilities } from './NativeCapabilities';

export class BridgeMessageHandler {
  private appId: string;
  private grantedPermissions: Permission[];
  private capabilities: NativeCapabilities;
  private inject?: (js: string) => void;

  constructor(appId: string, grantedPermissions: Permission[], capabilities: NativeCapabilities, inject?: (js: string) => void) {
    this.inject = inject;
    this.appId = appId;
    this.grantedPermissions = grantedPermissions;
    this.capabilities = capabilities;
  }

  async handleMessage(message: any): Promise<any> {
    const { id, method, args, type } = message;

    if (type === 'event') {
      this.handleEventSubscription(message);
      return { id, success: true };
    }

    try {
      const result = await this.executeMethod(method, args);
      return { id, success: true, result };
    } catch (error: any) {
      return { id, success: false, error: error.message };
    }
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

  private async executeMethod(method: string, args: any[]): Promise<any> {
    const parts = method.split('.');
    const category = parts[0];
    const action = parts.slice(1).join('.');

    if (category === 'events') {
      return this.handleEventsMethod(action, args);
    }

    if (!this.grantedPermissions.includes(category as Permission)) {
      throw new Error(`Permission denied: ${category}`);
    }

    return await this.executeCapabilityMethod(category, action, args);
  }

  private handleEventsMethod(action: string, args: any[]): any {
    return null;
  }

  private async executeCapabilityMethod(category: string, action: string, args: any[]): Promise<any> {
    const handler = (this.capabilities as any)[category];
    if (!handler || typeof handler !== 'object') {
      throw new Error(`Category not found: ${category}`);
    }

    const method = handler[action];
    if (!method || typeof method !== 'function') {
      throw new Error(`Method not found: ${category}.${action}`);
    }

    return await method.apply(handler, args);
  }

  generateBridgeScript(): string {
    return `
      (function() {
        let messageId = 0;
        const pendingMessages = {};
        const eventListeners = {};

        window.EveryAppBridge = {
          storage: {
            get: (key) => sendMessage('storage.get', [key]),
            set: (key, value) => sendMessage('storage.set', [key, value]),
            remove: (key) => sendMessage('storage.remove', [key]),
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
            getConnectedDevices: () => sendMessage('bluetooth.getConnectedDevices', []),
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

        setTimeout(() => {
          window.dispatchBridgeEvent('app.start', { timestamp: Date.now() });
        }, 100);
      })();
    `;
  }
}
