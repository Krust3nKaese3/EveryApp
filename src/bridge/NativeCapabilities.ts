import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';
import { NativeModules } from 'react-native';
import * as ClassicBluetooth from '../../modules/expo-classic-bluetooth';
import { BluetoothDevice, HttpRequest, HttpResponse } from '../types';
import { EventEmitter } from './EventEmitter';
import { BackgroundService } from '../services/BackgroundService';
import { getNativeLog, registerTasks, revokeLockGrant, setTile } from '../services/BackgroundTasks';
import { deliverBackgroundEvent, subscribeBackgroundEvents } from '../services/backgroundEvents';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NativeCapabilities {
  private appId: string;
  public eventEmitter: EventEmitter;
  private bluetoothConnectedSub: any;
  private bluetoothDisconnectedSub: any;
  private unsubscribeBackground: (() => void) | null = null;

  constructor(appId: string) {
    this.appId = appId;
    this.eventEmitter = new EventEmitter();
    this.unsubscribeBackground = subscribeBackgroundEvents((event, data) => {
      this.eventEmitter.emit(event, data);
    });
    this.setupBluetoothListeners();
  }

  private setupBluetoothListeners() {
    this.bluetoothConnectedSub = ClassicBluetooth.addBluetoothConnectedListener((device) => {
      deliverBackgroundEvent('bluetooth.connected', device);
    });

    this.bluetoothDisconnectedSub = ClassicBluetooth.addBluetoothDisconnectedListener((device) => {
      deliverBackgroundEvent('bluetooth.disconnected', device);
    });
  }

  cleanup() {
    this.bluetoothConnectedSub?.remove();
    this.bluetoothDisconnectedSub?.remove();
    this.unsubscribeBackground?.();
    this.unsubscribeBackground = null;
    this.eventEmitter.removeAllListeners();
  }

  getStorageKey(key: string): string {
    return `@miniapp_${this.appId}_${key}`;
  }

  storage = {
    get: async (key: string): Promise<string | null> => {
      return await AsyncStorage.getItem(this.getStorageKey(key));
    },
    
    set: async (key: string, value: string): Promise<void> => {
      await AsyncStorage.setItem(this.getStorageKey(key), value);
    },
    
    remove: async (key: string): Promise<void> => {
      await AsyncStorage.removeItem(this.getStorageKey(key));
    },
  };

  http = {
    request: async (req: HttpRequest): Promise<HttpResponse> => {
      const controller = new AbortController();
      const timeoutId = req.timeoutMs 
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;

      try {
        const response = await fetch(req.url, {
          method: req.method || 'GET',
          headers: req.headers,
          body: req.body,
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        const body = await response.text();
        const headers: Record<string, string> = {};
        
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          headers,
          body,
        };
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new Error(error.message || 'HTTP request failed');
      }
    },

    fetch: async (url: string, options?: any): Promise<any> => {
      const response = await fetch(url, options);
      const body = await response.text();
      
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
  };

  bluetooth = {
    scan: async (): Promise<any[]> => {
      try {
        await BleManager.scan({ scanDuration: 5 } as any);
        return new Promise((resolve) => {
          setTimeout(async () => {
            const peripherals = await BleManager.getDiscoveredPeripherals();
            resolve(peripherals);
          }, 5000);
        });
      } catch (error) {
        console.error('Bluetooth scan error:', error);
        return [];
      }
    },

    connect: async (deviceId: string): Promise<void> => {
      await BleManager.connect(deviceId, { autoconnect: false });
      try {
        NativeModules.ExpoBackgroundService?.noteBleConnected?.(deviceId);
      } catch (error: any) {
        console.error(`FEHLER noteBleConnected ${deviceId}: ${error?.message || error}`);
      }
    },

    disconnect: async (deviceId: string): Promise<void> => {
      await BleManager.disconnect(deviceId);
    },

    getConnectedDevices: async (): Promise<BluetoothDevice[]> => {
      try {
        return await ClassicBluetooth.getConnectedDevicesAsync();
      } catch (error) {
        console.error('Get connected devices error:', error);
        return [];
      }
    },
  };

  notifications = {
    schedule: async (title: string, body: string, seconds: number): Promise<void> => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
        },
        trigger: { seconds } as any,
      });
    },
  };

  camera = {
    takePicture: async (): Promise<string> => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Camera permission not granted');
      }
      return 'Camera feature requires UI component';
    },
  };

  sensors = {
    getAccelerometer: async (): Promise<{ x: number; y: number; z: number }> => {
      return new Promise((resolve, reject) => {
        const subscription = Accelerometer.addListener((data) => {
          subscription.remove();
          resolve(data);
        });
        
        setTimeout(() => {
          subscription.remove();
          reject(new Error('Timeout'));
        }, 1000);
      });
    },

    getGyroscope: async (): Promise<{ x: number; y: number; z: number }> => {
      return new Promise((resolve, reject) => {
        const subscription = Gyroscope.addListener((data) => {
          subscription.remove();
          resolve(data);
        });
        
        setTimeout(() => {
          subscription.remove();
          reject(new Error('Timeout'));
        }, 1000);
      });
    },
  };

  vibration = {
    vibrate: (pattern?: number[]): void => {
      if (pattern && pattern.length > 0) {
        pattern.forEach((duration, index) => {
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }, pattern.slice(0, index).reduce((a, b) => a + b, 0));
        });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
  };

  background = {
    enable: async (): Promise<void> => {
      await BackgroundService.start(this.appId);
    },

    disable: async (): Promise<void> => {
      await BackgroundService.stop(this.appId);
    },

    isEnabled: async (): Promise<boolean> => {
      return await BackgroundService.isRunning(this.appId);
    },

    registerTasks: async (tasks: any[]): Promise<any> => {
      return await registerTasks(this.appId, tasks);
    },

    setTile: async (slot: number, patch: any): Promise<any> => {
      return await setTile(this.appId, slot, patch);
    },

    revokeLock: async (): Promise<void> => {
      await revokeLockGrant(this.appId);
    },

    getLog: async (): Promise<string> => {
      return await getNativeLog();
    },
  };

  events = {
    on: (event: string, callback: (data: any) => void): void => {
      this.eventEmitter.on(event, callback);
    },

    off: (event: string, callback: (data: any) => void): void => {
      this.eventEmitter.off(event, callback);
    },
  };
}
