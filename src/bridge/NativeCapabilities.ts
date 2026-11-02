import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NativeCapabilities {
  private appId: string;

  constructor(appId: string) {
    this.appId = appId;
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
}
