import { NativeModules, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKGROUND_APPS_KEY = '@everyapp_background_apps';

export class BackgroundService {
  static async start(appId: string): Promise<void> {
    if (Platform.OS !== 'android') {
      throw new Error('Background service is only supported on Android');
    }

    const ExpoBackgroundService: any = requireOptionalNativeModule('ExpoBackgroundService');
    if (!ExpoBackgroundService) {
      throw new Error('Background service module not available');
    }

    const runningApps = await this.getRunningApps();
    if (!runningApps.includes(appId)) {
      runningApps.push(appId);
      await AsyncStorage.setItem(BACKGROUND_APPS_KEY, JSON.stringify(runningApps));
    }

    await ExpoBackgroundService.startService();
  }

  static async stop(appId: string): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }

    const runningApps = await this.getRunningApps();
    const filtered = runningApps.filter(id => id !== appId);
    await AsyncStorage.setItem(BACKGROUND_APPS_KEY, JSON.stringify(filtered));

    if (filtered.length === 0) {
      const ExpoBackgroundService: any = requireOptionalNativeModule('ExpoBackgroundService');
      if (ExpoBackgroundService) {
        await ExpoBackgroundService.stopService();
      }
    }
  }

  static async isRunning(appId: string): Promise<boolean> {
    const runningApps = await this.getRunningApps();
    return runningApps.includes(appId);
  }

  static async getRunningApps(): Promise<string[]> {
    const data = await AsyncStorage.getItem(BACKGROUND_APPS_KEY);
    return data ? JSON.parse(data) : [];
  }
}
