import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { initBackgroundTasks } from './src/services/BackgroundTasks';
import { HomeScreen } from './src/screens/HomeScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import BleManager from 'react-native-ble-manager';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

export default function App() {
  useEffect(() => { initBackgroundTasks(true); }, []);
  useEffect(() => {
    if (Platform.OS === 'android') {
      BleManager.start({ showAlert: false }).catch((error) => {
        console.error('BleManager start error:', error);
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <HomeScreen />
    </ErrorBoundary>
  );
}
