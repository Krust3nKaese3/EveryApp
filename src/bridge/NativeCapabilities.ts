import { classifyIcon } from '../services/popupTiles';
import { StorageService } from '../services/StorageService';
import * as Notifications from 'expo-notifications';
import { Camera } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BleManager from 'react-native-ble-manager';
import * as ClassicBluetooth from '../../modules/expo-classic-bluetooth';
import { BluetoothDevice, HttpRequest, HttpResponse } from '../types';
import { EventEmitter } from './EventEmitter';
import { BackgroundService } from '../services/BackgroundService';
import { BackgroundTasks, restartTimers, getTileSlots, setUi, updateTile, updateWidget, getUi, wifiInfo, tileHandle, popupApi } from '../services/BackgroundTasks';
import { PermissionsAndroid, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as NetworkInfo from '../../modules/expo-network-info';
import * as Ble from '../../modules/expo-ble-gatt';
import * as RawNet from '../../modules/expo-raw-net';
import { makeTuyaLocal, discover as tuyaDiscover } from '../services/TuyaLocal';
import { sendMediaKey } from '../../modules/expo-media-control';
import { SecretStore } from '../services/SecretStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NativeCapabilities {
  private appId: string;
  public eventEmitter: EventEmitter;
  private bluetoothConnectedSub: any;
  private bluetoothDisconnectedSub: any;

  constructor(appId: string) {
    this.appId = appId;
    this.eventEmitter = new EventEmitter();
    this.setupBluetoothListeners();
  }

  private setupBluetoothListeners() {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT' as any)
        .then((r) => console.log('[EveryApp] BLUETOOTH_CONNECT:', r))
        .catch((e) => console.warn('[EveryApp] BLUETOOTH_CONNECT request failed', e));
    }
    this.bluetoothConnectedSub = ClassicBluetooth.addBluetoothConnectedListener((device) => {
      this.eventEmitter.emit('bluetooth.connected', device);
    });

    this.bluetoothDisconnectedSub = ClassicBluetooth.addBluetoothDisconnectedListener((device) => {
      this.eventEmitter.emit('bluetooth.disconnected', device);
    });
  }

  cleanup() {
    this.bluetoothConnectedSub?.remove();
    this.bluetoothDisconnectedSub?.remove();
    this.eventEmitter.removeAllListeners();
  }

  getStorageKey(key: string): string {
    return `@miniapp_${this.appId}_${key}`;
  }

  storage = {
    get: async (key: string): Promise<string | null> => {
      return await AsyncStorage.getItem(this.getStorageKey(key));
    },
    
    set: async (key: string, value: string): Promise<void> => {
      await AsyncStorage.setItem(this.getStorageKey(key), value);
    },
    
    remove: async (key: string): Promise<void> => {
      await AsyncStorage.removeItem(this.getStorageKey(key));
    },
  };

  // Secrets: keyed by secret key per app. Lite = AsyncStorage, next build = expo-secure-store (+auto migration)
  secrets = {
    get: async (key: string) => SecretStore.get(this.appId, key),
    set: async (key: string, value: string) => SecretStore.set(this.appId, key, value),
    delete: async (key: string) => SecretStore.delete(this.appId, key),
    list: async () => SecretStore.list(this.appId),
    info: async () => SecretStore.info(),
  };

  http = {
    request: async (req: HttpRequest): Promise<HttpResponse> => {
      const controller = new AbortController();
      const timeoutId = req.timeoutMs 
        ? setTimeout(() => controller.abort(), req.timeoutMs)
        : null;

      try {
        const response = await fetch(req.url, {
          method: req.method || 'GET',
          headers: req.headers,
          body: req.body,
          signal: controller.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        const body = await response.text();
        const headers: Record<string, string> = {};
        
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          headers,
          body,
        };
      } catch (error: any) {
        if (timeoutId) clearTimeout(timeoutId);
        throw new Error(error.message || 'HTTP request failed');
      }
    },

    fetch: async (url: string, options?: any): Promise<any> => {
      const response = await fetch(url, options);
      const body = await response.text();
      
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
  };

  bluetooth = {
    scan: async (): Promise<any[]> => {
      try {
        await BleManager.scan({ scanDuration: 5 } as any);
        return new Promise((resolve) => {
          setTimeout(async () => {
            const peripherals = await BleManager.getDiscoveredPeripherals();
            resolve(peripherals);
          }, 5000);
        });
      } catch (error) {
        console.error('Bluetooth scan error:', error);
        return [];
      }
    },

    connect: async (deviceId: string): Promise<void> => {
      await BleManager.connect(deviceId);
    },

    disconnect: async (deviceId: string): Promise<void> => {
      await BleManager.disconnect(deviceId);
    },

    // Throws (copyable message) instead of silently returning [] so mini-apps can show the error
    getConnectedDevices: async (includePaired?: boolean): Promise<any[]> => {
      try {
        return await ClassicBluetooth.getConnectedDevicesAsync(!!includePaired);
      } catch (error: any) {
        console.error('[EveryApp] getConnectedDevices error:', error?.message);
        throw new Error(`Bluetooth-Geräte konnten nicht gelesen werden: ${error?.message || error}`);
      }
    },
  };

  notifications = {
    schedule: async (title: string, body: string, seconds: number): Promise<void> => {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
        },
        trigger: seconds && seconds > 0
          ? ({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false } as any)
          : null,
      });
    },
  };

  camera = {
    takePicture: async (): Promise<string> => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Camera permission not granted');
      }
      return 'Camera feature requires UI component';
    },
  };

  sensors = {
    getAccelerometer: async (): Promise<{ x: number; y: number; z: number }> => {
      return new Promise((resolve, reject) => {
        const subscription = Accelerometer.addListener((data) => {
          subscription.remove();
          resolve(data);
        });
        
        setTimeout(() => {
          subscription.remove();
          reject(new Error('Timeout'));
        }, 1000);
      });
    },

    getGyroscope: async (): Promise<{ x: number; y: number; z: number }> => {
      return new Promise((resolve, reject) => {
        const subscription = Gyroscope.addListener((data) => {
          subscription.remove();
          resolve(data);
        });
        
        setTimeout(() => {
          subscription.remove();
          reject(new Error('Timeout'));
        }, 1000);
      });
    },
  };

  vibration = {
    vibrate: (pattern?: number[]): void => {
      if (pattern && pattern.length > 0) {
        pattern.forEach((duration, index) => {
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }, pattern.slice(0, index).reduce((a, b) => a + b, 0));
        });
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
  };

  background = {
    enable: async (): Promise<void> => {
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const r = await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as any);
        console.log('[EveryApp] POST_NOTIFICATIONS:', r);
      }
      await BackgroundService.start(this.appId);
      restartTimers();
    },

    disable: async (): Promise<void> => {
      await BackgroundService.stop(this.appId);
      restartTimers();
    },

    isEnabled: async (): Promise<boolean> => {
      return await BackgroundService.isRunning(this.appId);
    },

    // Generic background tasks (docs/BACKGROUND.md)
    handlesTriggers: async (): Promise<boolean> => true,
    // slot -> name of Quick Settings tiles ("EveryApp 1..5"); tiles need the next native build
    getTileSlots: async (): Promise<Record<string, string>> => getTileSlots(),
    setUi: async (conf: any) => setUi(this.appId, conf || {}),
    getUi: async () => getUi(),
    tileUpdate: async (slotOrName: any, patch: any) => updateTile(slotOrName, patch || {}),
    widgetUpdate: async (id: string, patch: any) => updateWidget(id, patch || {}),
    registerTask: async (task: any): Promise<void> => { await BackgroundTasks.register(this.appId, task); },
    unregisterTask: async (taskId: string): Promise<void> => { await BackgroundTasks.unregister(this.appId, taskId); },
    unregisterAll: async (): Promise<void> => { await BackgroundTasks.unregisterAll(this.appId); },
    listTasks: async (): Promise<any[]> => BackgroundTasks.list(this.appId),
    getLog: async (): Promise<string> => BackgroundTasks.getLog(this.appId),
    clearLog: async (): Promise<void> => BackgroundTasks.clearLog(this.appId),
  };

  // Pending native module (next build). Guarded: throws readable error on the current APK.
  network = {
    isAvailable: async (): Promise<boolean> => NetworkInfo.isAvailable(),
    getInfo: async (): Promise<any> => {
      if (!NetworkInfo.isAvailable()) throw new Error('Netzwerk-Info nicht verfügbar (braucht nächsten Build)');
      if (Platform.OS === 'android') {
        try { await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION); } catch {}
      }
      return await NetworkInfo.getInfoAsync();
    },
    getWifi: async (): Promise<any> => wifiInfo(),
    // Two-step location prompt: fine first; background ('Immer erlauben') only via settings on Android 11+.
    requestLocation: async (background?: boolean): Promise<any> => {
      if (Platform.OS !== 'android') return { fine: true, background: true };
      const P = PermissionsAndroid.PERMISSIONS as any;
      const fine = (await PermissionsAndroid.request(P.ACCESS_FINE_LOCATION, {
        title: 'Standort für WLAN', message: 'Android gibt WLAN-Name und Access-Point (BSSID) nur mit genauer Standort-Berechtigung heraus. EveryApp nutzt den Standort nicht.', buttonPositive: 'Weiter' })) === 'granted';
      let bg = P.ACCESS_BACKGROUND_LOCATION ? await PermissionsAndroid.check(P.ACCESS_BACKGROUND_LOCATION) : true;
      if (fine && background && !bg && P.ACCESS_BACKGROUND_LOCATION) {
        const r = await PermissionsAndroid.request(P.ACCESS_BACKGROUND_LOCATION, {
          title: 'Standort im Hintergrund', message: 'Für den Trigger wifiChanged bei geschlossener App: in den Einstellungen „Immer zulassen“ wählen.', buttonPositive: 'Zu den Einstellungen' });
        bg = r === 'granted';
      }
      return { fine, background: bg };
    },
  };

  // BLE GATT (pending native module, next build). Guarded: throws 'braucht nächsten Build'.
  ble = {
    isAvailable: async (): Promise<boolean> => Ble.isAvailable(),
    scan: async (o: any) => Ble.scan(o, true),
    connect: async (a: string, o: any) => Ble.connect(a, o, true),
    disconnect: async (a: string) => Ble.disconnect(a),
    write: async (a: string, s: string, c: string, d: any, o: any) => Ble.write(a, s, c, d, o),
    read: async (a: string, s: string, c: string, o: any) => Ble.read(a, s, c, o),
    notify: async (a: string, s: string, c: string, e: boolean, o: any) => Ble.notify(a, s, c, e, o),
  };

  // Raw TCP/UDP + Tuya LAN (permission 'net'); crypto is free. Native module: next build.
  private tcpConns = new Map<number, RawNet.TcpConn>();
  private tcpSeq = 1;
  net = {
    isAvailable: async () => RawNet.isAvailable(),
    tcpOpen: async (host: string, port: number, o: any) => {
      const c = await RawNet.nativeNet.tcp(host, port, o || {}); const id = this.tcpSeq++; this.tcpConns.set(id, c); return id;
    },
    tcpSend: async (id: number, data: any) => { await this.tcp(id).send(RawNet.toHex(data)); },
    tcpReceive: async (id: number, o: any) => this.tcp(id).receive(o || {}),
    tcpClose: async (id: number) => { const c = this.tcpConns.get(id); this.tcpConns.delete(id); await c?.close(); },
    udpSend: async (host: string, port: number, data: any, o: any) => RawNet.nativeNet.udpSend(host, port, RawNet.toHex(data), o || {}),
    udpListen: async (ports: number[], durationMs: number) => RawNet.nativeNet.udpListen(ports, durationMs),
    tuyaStatus: async (cfg: any) => makeTuyaLocal(RawNet.nativeCrypto, RawNet.nativeNet, cfg).status(),
    tuyaSet: async (cfg: any, dps: any) => makeTuyaLocal(RawNet.nativeCrypto, RawNet.nativeNet, cfg).set(dps),
    tuyaDiscover: async (ms?: number) => tuyaDiscover(RawNet.nativeCrypto, RawNet.nativeNet, ms || 6000),
  };
  private tcp(id: number) { const c = this.tcpConns.get(id); if (!c) throw new Error(`TCP-Socket ${id} nicht offen`); return c; }

  popup = {
    open: async (spec: any) => popupApi(this.appId).open(spec),
    send: async (id: string, data: any) => popupApi(this.appId).send(id, data),
    close: async (id?: string) => popupApi(this.appId).close(id),
    state: async (id: string) => popupApi(this.appId).state(id),
  };
  tiles = {
    set: async (n: number, patch: any) => tileHandle(this.appId, n).set(patch),
    get: async (n: number) => tileHandle(this.appId, n).get(),
    release: async (n: number) => tileHandle(this.appId, n).release(),
    fetchSvg: async (spec: string) => {
      
      const m = (await StorageService.getApps()).find((a) => a.id === this.appId)?.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      const k = classifyIcon(spec, m ? `https://raw.githubusercontent.com/${m[1]}/${m[2].replace(/\.git$/, '')}/main` : null);
      if (k.kind !== 'svg' || !/^https:\/\//.test(k.value)) throw new Error(`Kein SVG-Pfad: ${spec}`);
      const r = await fetch(k.value); if (!r.ok) throw new Error(`SVG-Icon HTTP ${r.status}: ${k.value}`);
      return r.text();
    },
  };

  crypto = {
    isAvailable: async () => RawNet.isAvailable(),
    aesEcb: async (e: boolean, k: string, d: string) => RawNet.nativeCrypto.aesEcb(e, k, d),
    aesGcm: async (e: boolean, k: string, iv: string, aad: string, d: string) => RawNet.nativeCrypto.aesGcm(e, k, iv, aad || '', d),
    hmacSha256: async (k: string, d: string) => RawNet.nativeCrypto.hmacSha256(k, d),
    md5: async (d: string) => RawNet.nativeCrypto.md5(d),
    crc32: async (d: string) => RawNet.nativeCrypto.crc32(d),
    randomHex: async (n: number) => RawNet.nativeCrypto.randomHex(n),
  };

  media = {
    play: () => sendMediaKey('play'),
    pause: () => sendMediaKey('pause'),
    toggle: () => sendMediaKey('toggle'),
    next: () => sendMediaKey('next'),
    previous: () => sendMediaKey('previous'),
    stop: () => sendMediaKey('stop'),
  };

  clipboard = {
    getString: async (): Promise<string> => await Clipboard.getStringAsync(),
    setString: async (text: string): Promise<boolean> => {
      try {
        await Clipboard.setStringAsync(String(text ?? ''));
        console.log('[EveryApp] clipboard.setString ok,', String(text ?? '').length, 'chars');
        return true;
      } catch (e: any) {
        console.error('[EveryApp] clipboard.setString FEHLER:', e?.message);
        throw new Error(`Zwischenablage-Fehler (expo-clipboard): ${e?.message || e}`);
      }
    },
  };

  events = {
    on: (event: string, callback: (data: any) => void): void => {
      this.eventEmitter.on(event, callback);
    },

    off: (event: string, callback: (data: any) => void): void => {
      this.eventEmitter.off(event, callback);
    },
  };
}
