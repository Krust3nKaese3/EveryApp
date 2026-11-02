import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import BleManager from 'react-native-ble-manager';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      BleManager.start({ showAlert: false }).catch((error) => {
        console.error('BleManager start error:', error);
      });
    }
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <HomeScreen />
    </>
  );
}
