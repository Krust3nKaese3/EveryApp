import { NativeModulesProxy } from 'expo-modules-core';
import { NativeEventEmitter, NativeModules, EmitterSubscription } from 'react-native';

const ExpoClassicBluetooth = NativeModulesProxy.ExpoClassicBluetooth || NativeModules.ExpoClassicBluetooth;

export interface BluetoothDevice {
  name: string;
  address: string;
}

export interface BluetoothEventPayload {
  name: string;
  address: string;
}

let eventEmitter: NativeEventEmitter | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter && ExpoClassicBluetooth) {
    eventEmitter = new NativeEventEmitter(ExpoClassicBluetooth as any);
  }
  if (!eventEmitter) {
    throw new Error('ExpoClassicBluetooth module not available');
  }
  return eventEmitter;
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
