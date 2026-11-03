import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, StatusBar, BackHandler, ActivityIndicator, Text, ScrollView, TouchableOpacity } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { MiniApp, Permission } from '../types';
import { StorageService } from '../services/StorageService';
import { PermissionRequestModal } from './PermissionRequestModal';
import { BridgeMessageHandler } from '../bridge/BridgeMessageHandler';
import { NativeCapabilities } from '../bridge/NativeCapabilities';
import { setupGlobalErrorHandler, removeGlobalErrorHandler } from '../utils/errorHandler';

interface MiniAppRunnerProps {
  app: MiniApp;
  onClose: () => void;
}

export const MiniAppRunner: React.FC<MiniAppRunnerProps> = ({ app, onClose }) => {
  const webViewRef = useRef<WebView<any>>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string>('');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([]);
  const capabilitiesRef = useRef<NativeCapabilities | null>(null);
  const [error, setError] = useState<{ message: string; stack?: string } | null>(null);

  useEffect(() => {
    setupGlobalErrorHandler((error, isFatal) => {
      setError({
        message: error.message || 'Unknown error',
        stack: error.stack,
      });
    });

    initApp().catch((error) => {
      setError({
        message: `Failed to initialize app: ${error.message || 'Unknown error'}`,
        stack: error.stack,
      });
      setLoading(false);
    });

    ScreenOrientation.unlockAsync();

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    
    return () => {
      backSub.remove();
      removeGlobalErrorHandler();
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      if (capabilitiesRef.current) {
        capabilitiesRef.current.cleanup();
      }
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

      if (!capabilitiesRef.current) {
        capabilitiesRef.current = new NativeCapabilities(app.id);
      }
      
      const bridgeHandler = new BridgeMessageHandler(app.id, permissions, capabilitiesRef.current);
      const bridgeScript = bridgeHandler.generateBridgeScript();

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            html, body { margin: 0; padding: 0; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior-y: contain; }
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
    } catch (error: any) {
      console.error('Failed to load mini-app:', error);
      setError({
        message: `Failed to load mini-app: ${error.message || 'Unknown error'}`,
        stack: error.stack,
      });
      setLoading(false);
    }
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (!capabilitiesRef.current) {
        capabilitiesRef.current = new NativeCapabilities(app.id);
      }

      const bridgeHandler = new BridgeMessageHandler(app.id, grantedPermissions, capabilitiesRef.current, (js) => webViewRef.current?.injectJavaScript(js));
      const response = await bridgeHandler.handleMessage(message);
      
      if (response) {
        webViewRef.current?.injectJavaScript(
          `window.handleBridgeResponse(${JSON.stringify(response)}); true;`
        );
      }
    } catch (error: any) {
      console.error('Bridge message error:', error);
      setError({
        message: `Bridge error: ${error.message || 'Unknown error'}`,
        stack: error.stack,
      });
    }
  };

  const handleWebViewError = (event: any) => {
    console.error('WebView error:', event.nativeEvent);
    setError({
      message: `WebView error: ${event.nativeEvent?.description || 'Unknown error'}`,
      stack: `URL: ${event.nativeEvent?.url || 'N/A'}\nCode: ${event.nativeEvent?.code || 'N/A'}`,
    });
  };

  const handleHttpError = (event: any) => {
    console.error('WebView HTTP error:', event.nativeEvent);
    setError({
      message: `HTTP error: ${event.nativeEvent?.statusCode || 'Unknown'} ${event.nativeEvent?.description || ''}`,
      stack: `URL: ${event.nativeEvent?.url || 'N/A'}`,
    });
  };

  const handleRenderProcessGone = () => {
    console.error('WebView render process gone');
    setError({
      message: 'WebView render process crashed',
      stack: 'The WebView rendering process has terminated unexpectedly',
    });
  };

  const handleCopyError = async () => {
    if (error) {
      const errorText = `${error.message}\n\n${error.stack || 'No stack trace available'}`;
      await Clipboard.setStringAsync(errorText);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar hidden />
        <View style={styles.errorHeader}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorSubtitle}>{app.manifest.name}</Text>
        </View>
        <ScrollView style={styles.errorContainer}>
          <Text style={styles.errorText} selectable>
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ''}
          </Text>
        </ScrollView>
        <View style={styles.errorButtons}>
          <TouchableOpacity style={styles.errorButton} onPress={handleCopyError}>
            <Text style={styles.errorButtonText}>Copy Error</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.errorButton, styles.closeButton]} onPress={onClose}>
            <Text style={styles.errorButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
          onError={handleWebViewError}
          onHttpError={handleHttpError}
          onRenderProcessGone={handleRenderProcessGone}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled
          nestedScrollEnabled
          overScrollMode="content"
          bounces={false}
          setSupportMultipleWindows={false}
          onLoad={() => setLoading(false)}
        />
      )}

      <TouchableOpacity
        onPress={onClose}
        style={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>✕</Text>
      </TouchableOpacity>

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
  errorHeader: {
    padding: 20,
    backgroundColor: '#d32f2f',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  errorSubtitle: {
    fontSize: 14,
    color: '#ffebee',
  },
  errorContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#fff',
    lineHeight: 18,
  },
  errorButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#1a1a1a',
  },
  errorButton: {
    flex: 1,
    backgroundColor: '#424242',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButton: {
    backgroundColor: '#2196F3',
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
