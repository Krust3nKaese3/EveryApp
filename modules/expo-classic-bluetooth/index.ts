import { requireOptionalNativeModule } from 'expo-modules-core';

type EmitterSubscription = { remove: () => void };
const ExpoClassicBluetooth: any = requireOptionalNativeModule('ExpoClassicBluetooth');

export interface BluetoothDevice {
  name: string;
  address: string;
}

export interface BluetoothEventPayload {
  name: string;
  address: string;
}

const noopEmitter = { addListener: () => ({ remove: () => {} }) };
function getEventEmitter(): any {
  if (!ExpoClassicBluetooth) {
    console.warn('ExpoClassicBluetooth module not available - bluetooth events disabled');
    return noopEmitter;
  }
  return ExpoClassicBluetooth;
}

export async function getConnectedDevicesAsync(): Promise<BluetoothDevice[]> {
  if (!ExpoClassicBluetooth) {
    throw new Error('ExpoClassicBluetooth module not available');
  }
  return await ExpoClassicBluetooth.getConnectedDevices();
}

export function addBluetoothConnectedListener(
  listener: (event: BluetoothEventPayload) => void
): EmitterSubscription {
  return getEventEmitter().addListener('onBluetoothConnected', listener as any);
}

export function addBluetoothDisconnectedListener(
  listener: (event: BluetoothEventPayload) => void
): EmitterSubscription {
  return getEventEmitter().addListener('onBluetoothDisconnected', listener as any);
}
