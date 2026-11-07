import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import BleManager from 'react-native-ble-manager';
import { AppState, Platform } from 'react-native';
import { recheckLockGrants } from './src/services/BackgroundTasks';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      BleManager.start({ showAlert: false }).catch((error) => {
        console.error('BleManager start error:', error);
      });
    }
    const checkLocks = () => {
      recheckLockGrants().catch((error) => {
        console.error('allowLocked recheck:', error);
      });
    };
    checkLocks();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkLocks();
    });
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style="light" />
      <HomeScreen />
    </ErrorBoundary>
  );
}
