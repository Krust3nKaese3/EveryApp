import { requireOptionalNativeModule } from 'expo-modules-core';

type EmitterSubscription = { remove: () => void };
const ExpoClassicBluetooth: any = requireOptionalNativeModule('ExpoClassicBluetooth');

export interface BluetoothDevice {
  name: string;        // original device name
  alias: string;       // user-set name (Android 11+), falls back to name
  address: string;     // MAC
  type: 'classic' | 'le' | 'dual' | 'unknown';
  bondState: 'bonded' | 'bonding' | 'none';
  majorClass: string;  // e.g. AUDIO_VIDEO
  deviceClass: number;
  uuids: string[];
  connected: boolean;
}

export type BluetoothEventPayload = BluetoothDevice;

const noopEmitter = { addListener: () => ({ remove: () => {} }) };
function getEventEmitter(): any {
  if (!ExpoClassicBluetooth) {
    console.warn('ExpoClassicBluetooth module not available - bluetooth events disabled');
    return noopEmitter;
  }
  return ExpoClassicBluetooth;
}

export async function getConnectedDevicesAsync(includePaired = false): Promise<BluetoothDevice[]> {
  if (!ExpoClassicBluetooth) {
    throw new Error('ExpoClassicBluetooth module not available');
  }
  return await ExpoClassicBluetooth.getConnectedDevices(includePaired);
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
