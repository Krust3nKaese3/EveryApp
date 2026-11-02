import { Permission } from '../types';

export interface BridgeAPI {
  storage: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
    remove: (key: string) => Promise<void>;
  };
  http: {
    fetch: (url: string, options?: RequestInit) => Promise<Response>;
  };
  bluetooth: {
    scan: () => Promise<any[]>;
    connect: (deviceId: string) => Promise<void>;
    disconnect: (deviceId: string) => Promise<void>;
  };
  notifications: {
    schedule: (title: string, body: string, seconds: number) => Promise<void>;
  };
  camera: {
    takePicture: () => Promise<string>;
  };
  sensors: {
    getAccelerometer: () => Promise<{ x: number; y: number; z: number }>;
    getGyroscope: () => Promise<{ x: number; y: number; z: number }>;
  };
  vibration: {
    vibrate: (pattern?: number[]) => void;
  };
}

export class BridgeMessageHandler {
  private appId: string;
  private grantedPermissions: Permission[];
  private handlers: any;

  constructor(appId: string, grantedPermissions: Permission[], handlers: any) {
    this.appId = appId;
    this.grantedPermissions = grantedPermissions;
    this.handlers = handlers;
  }

  async handleMessage(message: any): Promise<any> {
    const { id, method, args } = message;

    try {
      const result = await this.executeMethod(method, args);
      return { id, success: true, result };
    } catch (error: any) {
      return { id, success: false, error: error.message };
    }
  }

  private async executeMethod(method: string, args: any[]): Promise<any> {
    const [category, action] = method.split('.');

    if (!this.grantedPermissions.includes(category as Permission)) {
      throw new Error(`Permission denied: ${category}`);
    }

    const handler = this.handlers[category];
    if (!handler || !handler[action]) {
      throw new Error(`Method not found: ${method}`);
    }

    return await handler[action](...args);
  }

  generateBridgeScript(): string {
    return `
      (function() {
        let messageId = 0;
        const pendingMessages = {};

        window.EveryAppBridge = {
          storage: {
            get: (key) => sendMessage('storage.get', [key]),
            set: (key, value) => sendMessage('storage.set', [key, value]),
            remove: (key) => sendMessage('storage.remove', [key]),
          },
          http: {
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
        };

        function sendMessage(method, args) {
          return new Promise((resolve, reject) => {
            const id = messageId++;
            pendingMessages[id] = { resolve, reject };
            window.ReactNativeWebView.postMessage(JSON.stringify({ id, method, args }));
          });
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
      })();
    `;
  }
}
