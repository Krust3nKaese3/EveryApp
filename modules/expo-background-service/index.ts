import { NativeModulesProxy } from 'expo-modules-core';

const ExpoBackgroundService = NativeModulesProxy.ExpoBackgroundService;

export async function startServiceAsync(): Promise<void> {
  await ExpoBackgroundService.startService();
}

export async function stopServiceAsync(): Promise<void> {
  await ExpoBackgroundService.stopService();
}
