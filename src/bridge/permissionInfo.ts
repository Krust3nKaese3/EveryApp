import { Permission } from '../types';

export const PERMISSION_INFO: Record<Permission, { title: string; description: string }> = {
  storage: {
    title: 'Speicher',
    description: 'Text nur für diese Mini-App auf diesem Gerät speichern',
  },
  http: {
    title: 'Internet',
    description: 'Anfragen an Server im Internet oder im lokalen Netz senden',
  },
  bluetooth: {
    title: 'Bluetooth',
    description: 'Bluetooth-Geräte suchen und verbinden',
  },
  notifications: {
    title: 'Benachrichtigungen',
    description: 'Lokale Benachrichtigungen anzeigen',
  },
  camera: {
    title: 'Kamera',
    description: 'Die Kamera verwenden',
  },
  sensors: {
    title: 'Sensoren',
    description: 'Beschleunigung und Drehung des Geräts lesen',
  },
  vibration: {
    title: 'Vibration',
    description: 'Das Gerät vibrieren lassen',
  },
  background: {
    title: 'Hintergrund',
    description: 'Weiterarbeiten, wenn EveryApp nicht geöffnet ist',
  },
  ble: {
    title: 'Bluetooth LE',
    description: 'BLE-Geräte suchen, verbinden und lesen oder schreiben',
  },
  net: {
    title: 'Lokales Netzwerk',
    description: 'Direkte Verbindungen im lokalen Netz, zum Beispiel zu Lampen',
  },
  popup: {
    title: 'Popups',
    description: 'Einblendungen über Kacheln oder Widgets öffnen',
  },
  tiles: {
    title: 'Kacheln',
    description: 'Schnellkacheln ändern',
  },
  spotify: {
    title: 'Spotify',
    description: 'Die installierte Spotify-App durchsuchen und die Wiedergabe steuern',
  },
  clipboard: {
    title: 'Zwischenablage',
    description: 'Text in die Zwischenablage legen oder daraus lesen',
  },
  network: {
    title: 'WLAN-Info',
    description: 'Verbindungsdaten wie den WLAN-Namen lesen. Keine GPS-Koordinaten',
  },
  media: {
    title: 'Medientasten',
    description: 'Wiedergabe anderer Apps steuern, zum Beispiel Play oder Pause',
  },
  secrets: {
    title: 'Geheimnisse',
    description: 'Zugangsdaten nur für diese Mini-App auf diesem Gerät speichern',
  },
  crypto: {
    title: 'Kryptografie',
    description: 'Verschlüsselung und Prüfsummen auf dem Gerät berechnen',
  },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_INFO) as Permission[];

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PERMISSION_INFO, value);
}
