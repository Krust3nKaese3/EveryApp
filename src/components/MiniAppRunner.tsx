import React, { useState, useRef, useEffect } from 'react';
import { View, StyleSheet, StatusBar, BackHandler, ActivityIndicator, Text, ScrollView, TouchableOpacity } from 'react-native';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import { MiniApp, Permission } from '../types';
import { isPermission } from '../bridge/permissionInfo';
import { StorageService } from '../services/StorageService';
import { PermissionRequestModal } from './PermissionRequestModal';
import { BridgeMessageHandler } from '../bridge/BridgeMessageHandler';
import { NativeCapabilities } from '../bridge/NativeCapabilities';
import { takeDeepLink, onDeepLinkQueued, deepLinkInjection } from '../services/deepLinks';
import { setupGlobalErrorHandler, removeGlobalErrorHandler } from '../utils/errorHandler';
import { MultiplayerOverlay } from './MultiplayerOverlay';
import { cancelMpScan, detachMultiplayer, dismissMpUi, endRoom, submitMpScan, subscribeMpUi, approveJoin, denyJoin, resumeMultiplayer, type MpUiState } from '../services/multiplayer/session';
import {
  assetRuntimeSource,
  assetUri,
  isStoredRelPath,
  isTextMime,
  mimeForPath,
  normalizeEntrypoint,
  parentDir,
  resolveAssetPath,
  rewriteHtmlAssets,
  virtualHost,
} from '../services/miniAppFiles';

interface MiniAppRunnerProps {
  app: MiniApp;
  onClose: () => void;
}

export const MiniAppRunner: React.FC<MiniAppRunnerProps> = ({ app, onClose }) => {
  const webViewRef = useRef<WebView<any>>(null);
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState<string>('');
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [installPermissions, setInstallPermissions] = useState<Permission[]>([]);
  const [runtimeConsent, setRuntimeConsent] = useState<Permission[] | null>(null);
  const [grantedPermissions, setGrantedPermissions] = useState<Permission[]>([]);
  const [mpUi, setMpUi] = useState<MpUiState | null>(null);
  const grantedRef = useRef<Permission[]>([]);
  const deniedRef = useRef<Permission[]>([]);
  const consentChain = useRef<Promise<unknown>>(Promise.resolve());
  const consentResolve = useRef<((ok: boolean) => void) | null>(null);
  const capabilitiesRef = useRef<NativeCapabilities | null>(null);
  const [error, setError] = useState<{ message: string; stack?: string } | null>(null);

  const webLoadedRef = useRef(false);
  const deliverDeepLink = () => {
    if (!webLoadedRef.current) return;
    const link = takeDeepLink(app.id);
    if (link) webViewRef.current?.injectJavaScript(deepLinkInjection(link));
  };
  useEffect(() => onDeepLinkQueued((id) => { if (id === app.id) deliverDeepLink(); }), [app.id]);

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
      void detachMultiplayer(app.id);
    };
  }, []);

  useEffect(() => subscribeMpUi(setMpUi), []);

  const declaredPermissions = () => (app.manifest.permissions || []).filter(isPermission);

  const initApp = async () => {
    const existingPermissions = await StorageService.getAppPermissions(app.id);
    const deniedPermissions = await StorageService.getDeniedPermissions(app.id);
    grantedRef.current = existingPermissions;
    deniedRef.current = deniedPermissions;
    setGrantedPermissions(existingPermissions);
    const undecided = declaredPermissions().filter((permission) => !existingPermissions.includes(permission) && !deniedPermissions.includes(permission));
    if (undecided.length > 0) {
      setInstallPermissions(undecided);
      setShowPermissionModal(true);
    } else {
      await loadApp(existingPermissions);
    }
  };

  const handleGrantPermissions = async () => {
    const selected = installPermissions;
    for (const permission of selected) {
      await StorageService.setPermissionDecision(app.id, permission, 'granted');
    }
    const next = Array.from(new Set([...grantedRef.current, ...selected]));
    grantedRef.current = next;
    deniedRef.current = deniedRef.current.filter((permission) => !selected.includes(permission));
    setGrantedPermissions(next);
    setShowPermissionModal(false);
    await loadApp(next);
  };

  const handleDenyPermissions = async () => {
    for (const permission of installPermissions) {
      await StorageService.setPermissionDecision(app.id, permission, 'denied');
    }
    deniedRef.current = Array.from(new Set([...deniedRef.current, ...installPermissions]));
    setShowPermissionModal(false);
    await loadApp(grantedRef.current);
  };

  const askConsent = (category: Permission): Promise<boolean> => {
    const run = () => {
      if (grantedRef.current.includes(category)) return Promise.resolve(true);
      if (deniedRef.current.includes(category)) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        consentResolve.current = resolve;
        setRuntimeConsent([category]);
      });
    };
    const pending = consentChain.current.then(run, run);
    consentChain.current = pending.then(() => undefined, () => undefined);
    return pending;
  };

  const finishConsent = async (ok: boolean) => {
    const category = runtimeConsent?.[0];
    const resolve = consentResolve.current;
    consentResolve.current = null;
    setRuntimeConsent(null);
    if (category) {
      await StorageService.setPermissionDecision(app.id, category, ok ? 'granted' : 'denied');
      if (ok) {
        grantedRef.current = Array.from(new Set([...grantedRef.current, category]));
        deniedRef.current = deniedRef.current.filter((permission) => permission !== category);
      } else {
        deniedRef.current = Array.from(new Set([...deniedRef.current, category]));
        grantedRef.current = grantedRef.current.filter((permission) => permission !== category);
      }
      setGrantedPermissions(grantedRef.current);
    }
    resolve?.(ok);
  };

  const baseDirRef = useRef('');
  const docRef = useRef('');

  const loadApp = async (permissions: Permission[], entryOverride?: string, hash?: string) => {
    try {
      const entryRel = entryOverride || normalizeEntrypoint(app.manifest.entrypoint);
      if (!isStoredRelPath(entryRel)) throw new Error('Entrypoint is outside the mini-app');
      const entryUri = assetUri(app.localPath, entryRel);
      if (!entryUri) throw new Error('Entrypoint is outside the mini-app');
      const entryDir = parentDir(entryRel);
      baseDirRef.current = entryDir;
      docRef.current = entryRel;
      const htmlContent = await FileSystem.readAsStringAsync(entryUri);
      const cache = new Map<string, Promise<{ mime: string; base64: string; text: string | null } | null>>();
      const host = virtualHost(app.id);
      const rewritten = await rewriteHtmlAssets(htmlContent, entryDir, host, (rel) => {
        if (!isStoredRelPath(rel)) return Promise.resolve(null);
        const pending = cache.get(rel) || readMiniAppAsset(app.localPath, rel);
        cache.set(rel, pending);
        return pending;
      });

      if (!capabilitiesRef.current) {
        capabilitiesRef.current = new NativeCapabilities(app.id);
        if (grantedRef.current.includes('multiplayer')) {
          void resumeMultiplayer(app.id, (event, data) => capabilitiesRef.current?.eventEmitter.emit(event, data));
        }
      }
      const bridgeHandler = new BridgeMessageHandler(app.id, grantedRef.current, capabilitiesRef.current);
      const bridgeScript = bridgeHandler.generateBridgeScript();
      const hashLine = hash ? `location.hash=${JSON.stringify(hash)};` : '';

      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
          <style>
            html, body { margin: 0; padding: 0; }
            html { overflow-x: hidden; }
            * { -webkit-tap-highlight-color: transparent; }
          </style>
        </head>
        <body>
          <script>${bridgeScript}
          ${assetRuntimeSource(host)}
          ${hashLine}</script>
          ${rewritten}
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

  const navigateLocal = async (raw: string) => {
    const hashAt = raw.indexOf('#');
    const before = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
    const hash = hashAt >= 0 ? raw.slice(hashAt) : '';
    if (!before) {
      if (hash) webViewRef.current?.injectJavaScript(`location.hash=${JSON.stringify(hash)}; true;`);
      return;
    }
    const rel = resolveAssetPath(before, baseDirRef.current, virtualHost(app.id));
    if (!rel || !isStoredRelPath(rel) || !/\.html?$/i.test(rel)) return;
    if (rel === docRef.current) {
      if (hash) webViewRef.current?.injectJavaScript(`location.hash=${JSON.stringify(hash)}; true;`);
      return;
    }
    await loadApp(grantedPermissions, rel, hash || undefined);
  };

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);

      if (message?.type === 'navigate' && typeof message.url === 'string') {
        await navigateLocal(message.url);
        return;
      }

      if (message?.method === '__asset.read') {
        const rel = resolveAssetPath(String(message.args?.[0] ?? ''), baseDirRef.current, virtualHost(app.id));
        if (!rel || !isStoredRelPath(rel)) {
          webViewRef.current?.injectJavaScript(`window.handleBridgeResponse(${JSON.stringify({ id: message.id, success: false, error: 'Asset path is outside the mini-app' })}); true;`);
          return;
        }
        const file = await readMiniAppAsset(app.localPath, rel);
        const payload = file
          ? { id: message.id, success: true, result: { mime: file.mime, base64: file.base64 } }
          : { id: message.id, success: false, error: 'Asset not found' };
        const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
        webViewRef.current?.injectJavaScript(`window.handleBridgeResponse(${json}); true;`);
        return;
      }
      
      if (!capabilitiesRef.current) {
        capabilitiesRef.current = new NativeCapabilities(app.id);
      }

      const bridgeHandler = new BridgeMessageHandler(
        app.id,
        grantedRef.current,
        capabilitiesRef.current,
        (js) => webViewRef.current?.injectJavaScript(js),
        { denied: deniedRef.current, ask: askConsent },
      );
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
          onLoadEnd={() => { webLoadedRef.current = true; setTimeout(deliverDeepLink, 300); }}
          onError={handleWebViewError}
          onHttpError={handleHttpError}
          onRenderProcessGone={handleRenderProcessGone}
          originWhitelist={['http://*', 'https://*']}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          onShouldStartLoadWithRequest={(request) => {
            const url = request?.url || '';
            if (/^(file|content):/i.test(url)) return false;
            const rel = resolveAssetPath(url, baseDirRef.current, virtualHost(app.id));
            if (rel) {
              void navigateLocal(url);
              return false;
            }
            return true;
          }}
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
        requestedPermissions={installPermissions}
        onGrant={handleGrantPermissions}
        onDeny={handleDenyPermissions}
      />
      <PermissionRequestModal
        visible={!!runtimeConsent}
        appName={app.manifest.name}
        requestedPermissions={runtimeConsent || []}
        title="Zugriff erlauben?"
        intro="Die Mini-App möchte diese Funktion jetzt zum ersten Mal nutzen."
        grantLabel="Einmal erlauben"
        denyLabel="Nicht erlauben"
        onGrant={() => { void finishConsent(true); }}
        onDeny={() => { void finishConsent(false); }}
      />
      <MultiplayerOverlay
        state={mpUi}
        onDone={dismissMpUi}
        onEnd={() => { void endRoom(app.id); }}
        onScanned={submitMpScan}
        onCancel={cancelMpScan}
        onApprove={(id) => { void approveJoin(app.id, id); }}
        onDeny={(id) => { void denyJoin(app.id, id); }}
      />
    </View>
  );
};

async function readMiniAppAsset(localPath: string, rel: string): Promise<{ mime: string; base64: string; text: string | null } | null> {
  const uri = assetUri(localPath, rel);
  if (!uri) return null;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) return null;
  const mime = mimeForPath(rel);
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const text = isTextMime(mime) ? await FileSystem.readAsStringAsync(uri) : null;
  return { mime, base64, text };
}

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
