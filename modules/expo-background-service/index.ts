import { NativeModulesProxy } from 'expo-modules-core';

const ExpoBackgroundService = NativeModulesProxy.ExpoBackgroundService;

export async function startServiceAsync(): Promise<void> {
  await ExpoBackgroundService.startService();
}

export async function stopServiceAsync(): Promise<void> {
  await ExpoBackgroundService.stopService();
}

export async function enableAppAsync(appId: string): Promise<void> {
  await ExpoBackgroundService.enableApp(appId);
}

export async function disableAppAsync(appId: string): Promise<void> {
  await ExpoBackgroundService.disableApp(appId);
}
