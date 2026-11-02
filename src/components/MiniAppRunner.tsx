import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system';
import { MiniApp, Permission } from '../types';
import { StorageService } from '../services/StorageService';
import { PermissionRequestModal } from './PermissionRequestModal';
import { BridgeMessageHandler } from '../bridge/BridgeMessageHandler';
import { NativeCapabilities } from '../bridge/NativeCapabilities';

interface MiniAppRunnerProps {
  app: MiniApp;
  onClose: () => void;
}

export const MiniAppRunner: React.FC<MiniAppRunnerProps> = ({ app, onClose }) => {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string>('');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    initApp();
    ScreenOrientation.unlockAsync();
    
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const initApp = async () => {
    const existingPermissions = await StorageService.getAppPermissions(app.id);
    
    if (existingPermissions.length === 0 && app.manifest.permissions.length > 0) {
      setShowPermissionModal(true);
    } else {
      setGrantedPermissions(existingPermissions);
      await loadApp(existingPermissions);
    }
  };

  const handleGrantPermissions = async () => {
    await StorageService.saveGrantedPermissions(app.id, app.manifest.permissions);
    setGrantedPermissions(app.manifest.permissions);
    setShowPermissionModal(false);
    await loadApp(app.manifest.permissions);
  };

  const handleDenyPermissions = () => {
    setShowPermissionModal(false);
    onClose();
  };

  const loadApp = async (permissions: Permission[]) => {
    try {
      const entrypointPath = `${app.localPath}${app.manifest.entrypoint}`;
      const htmlContent = await FileSystem.readAsStringAsync(entrypointPath);

      const capabilities = new NativeCapabilities(app.id);
      const bridgeHandler = new BridgeMessageHandler(app.id, permissions, capabilities);
      const bridgeScript = bridgeHandler.generateBridgeScript();

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            body { margin: 0; padding: 0; overflow: hidden; }
            * { -webkit-tap-highlight-color: transparent; }
          </style>
        </head>
        <body>
          <script>${bridgeScript}</script>
          ${htmlContent}
        </body>
        </html>
      `;

      setHtml(fullHtml);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load mini-app:', error);
      onClose();
    }
  };

  const handleMessage = async (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      const capabilities = new NativeCapabilities(app.id);
      const bridgeHandler = new BridgeMessageHandler(app.id, grantedPermissions, capabilities);
      
      const response = await bridgeHandler.handleMessage(message);
      
      webViewRef.current?.injectJavaScript(
        `window.handleBridgeResponse(${JSON.stringify(response)}); true;`
      );
    } catch (error) {
      console.error('Bridge message error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html }}
          style={styles.webview}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          onLoad={() => setLoading(false)}
        />
      )}

      <PermissionRequestModal
        visible={showPermissionModal}
        appName={app.manifest.name}
        requestedPermissions={app.manifest.permissions}
        onGrant={handleGrantPermissions}
        onDeny={handleDenyPermissions}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
