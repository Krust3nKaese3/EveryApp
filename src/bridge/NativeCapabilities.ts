import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';
import * as ClassicBluetooth from '../../modules/expo-classic-bluetooth';
import { BluetoothDevice, HttpRequest, HttpResponse } from '../types';
import { EventEmitter } from './EventEmitter';
import { BackgroundService } from '../services/BackgroundService';
import { BackgroundTasks, restartTimers } from '../services/BackgroundTasks';
import { PermissionsAndroid, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

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

  constructor(appId: string) {
    this.appId = appId;
    this.eventEmitter = new EventEmitter();
    this.setupBluetoothListeners();
  }

  private setupBluetoothListeners() {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT' as any)
        .then((r) => console.log('[EveryApp] BLUETOOTH_CONNECT:', r))
        .catch((e) => console.warn('[EveryApp] BLUETOOTH_CONNECT request failed', e));
    }
    this.bluetoothConnectedSub = ClassicBluetooth.addBluetoothConnectedListener((device) => {
      this.eventEmitter.emit('bluetooth.connected', device);
    });

    this.bluetoothDisconnectedSub = ClassicBluetooth.addBluetoothDisconnectedListener((device) => {
      this.eventEmitter.emit('bluetooth.disconnected', device);
    });
  }

  cleanup() {
    this.bluetoothConnectedSub?.remove();
    this.bluetoothDisconnectedSub?.remove();
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
      await BleManager.connect(deviceId);
    },

    disconnect: async (deviceId: string): Promise<void> => {
      await BleManager.disconnect(deviceId);
    },

    // Throws (copyable message) instead of silently returning [] so mini-apps can show the error
    getConnectedDevices: async (includePaired?: boolean): Promise<any[]> => {
      try {
        return await ClassicBluetooth.getConnectedDevicesAsync(!!includePaired);
      } catch (error: any) {
        console.error('[EveryApp] getConnectedDevices error:', error?.message);
        throw new Error(`Bluetooth-Geräte konnten nicht gelesen werden: ${error?.message || error}`);
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
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const r = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
        console.log('[EveryApp] POST_NOTIFICATIONS:', r);
      }
      await BackgroundService.start(this.appId);
      restartTimers();
    },

    disable: async (): Promise<void> => {
      await BackgroundService.stop(this.appId);
      restartTimers();
    },

    isEnabled: async (): Promise<boolean> => {
      return await BackgroundService.isRunning(this.appId);
    },

    // Generic background tasks (docs/BACKGROUND.md)
    handlesTriggers: async (): Promise<boolean> => true,
    registerTask: async (task: any): Promise<void> => { await BackgroundTasks.register(this.appId, task); },
    unregisterTask: async (taskId: string): Promise<void> => { await BackgroundTasks.unregister(this.appId, taskId); },
    unregisterAll: async (): Promise<void> => { await BackgroundTasks.unregisterAll(this.appId); },
    listTasks: async (): Promise<any[]> => BackgroundTasks.list(this.appId),
    getLog: async (): Promise<string> => BackgroundTasks.getLog(this.appId),
    clearLog: async (): Promise<void> => BackgroundTasks.clearLog(this.appId),
  };

  clipboard = {
    setString: async (text: string): Promise<boolean> => {
      try {
        await Clipboard.setStringAsync(String(text ?? ''));
        console.log('[EveryApp] clipboard.setString ok,', String(text ?? '').length, 'chars');
        return true;
      } catch (e: any) {
        console.error('[EveryApp] clipboard.setString FEHLER:', e?.message);
        throw new Error(`Zwischenablage-Fehler (expo-clipboard): ${e?.message || e}`);
      }
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
