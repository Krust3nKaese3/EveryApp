import { requireOptionalNativeModule } from 'expo-modules-core';

const ExpoBackgroundService: any = requireOptionalNativeModule('ExpoBackgroundService');

export async function startServiceAsync(): Promise<void> {
  await ExpoBackgroundService.startService();
}

export async function stopServiceAsync(): Promise<void> {
  await ExpoBackgroundService.stopService();
}
