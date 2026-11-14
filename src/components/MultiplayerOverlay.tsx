import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'qrcode';
import { decodeJoinUrl } from '../services/multiplayer/qr';
import type { MpUiState } from '../services/multiplayer/session';

interface MultiplayerOverlayProps {
  state: MpUiState | null;
  onDone: () => void;
  onLeave: () => void;
  onScanned: (text: string) => void;
  onCancel: () => void;
}

/** Großer QR für den Host, Scanner für den Beitritt. Die Mini-App zeichnet das nicht selbst. */
export function MultiplayerOverlay({ state, onDone, onLeave, onScanned, onCancel }: MultiplayerOverlayProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanHint, setScanHint] = useState('');
  const matrix = useMemo(() => {
    if (state?.mode !== 'host' || !state.qrPayload) return null;
    const code = QRCode.create(state.qrPayload, { errorCorrectionLevel: 'M' });
    const size = code.modules.size;
    const cells: number[] = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) cells.push(code.modules.get(row, col));
    }
    return { size, cells };
  }, [state]);

  if (!state) return null;

  if (state.mode === 'scan') {
    const allowed = permission?.granted;
    return (
      <View style={styles.screen}>
        {allowed ? (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(event) => {
              const text = event?.data || '';
              try {
                decodeJoinUrl(text);
              } catch (error) {
                setScanHint(error instanceof Error ? error.message : 'Das ist kein Spielraum.');
                return;
              }
              onScanned(text);
            }}
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.title}>Kamera für den QR-Code</Text>
            <TouchableOpacity style={styles.primary} onPress={() => { void requestPermission(); }}>
              <Text style={styles.primaryText}>Kamera erlauben</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.hintBar}>
          <Text style={styles.hint}>{scanHint || 'QR-Code des Hosts scannen'}</Text>
          <TouchableOpacity style={styles.secondary} onPress={onCancel}>
            <Text style={styles.secondaryText}>Abbrechen</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const cell = matrix ? Math.max(3, Math.floor(260 / matrix.size)) : 0;
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Mitspieler einladen</Text>
      <Text style={styles.code}>{state.roomCode}</Text>
      {matrix ? (
        <View style={styles.qrPad}>
          <View style={{ width: cell * matrix.size, height: cell * matrix.size, flexDirection: 'row', flexWrap: 'wrap' }}>
            {matrix.cells.map((bit, index) => (
              <View key={index} style={{ width: cell, height: cell, backgroundColor: bit ? '#000' : '#fff' }} />
            ))}
          </View>
        </View>
      ) : null}
      <Text style={styles.hint}>Gleiches WLAN oder Hotspot. Der Code enthält die lokale Adresse.</Text>
      <TouchableOpacity style={styles.primary} onPress={onDone}>
        <Text style={styles.primaryText}>Fertig</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={onLeave}>
        <Text style={styles.secondaryText}>Raum beenden</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 30,
    backgroundColor: '#0f1115',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  camera: { flex: 1, alignSelf: 'stretch', marginBottom: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  code: { color: '#fff', fontSize: 40, letterSpacing: 6, fontWeight: '800', marginBottom: 16 },
  qrPad: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 16 },
  hint: { color: '#d5d8e0', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  hintBar: { position: 'absolute', left: 16, right: 16, bottom: 28, alignItems: 'center' },
  primary: { backgroundColor: '#2f6fed', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, marginBottom: 10 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondary: { paddingVertical: 10, paddingHorizontal: 16 },
  secondaryText: { color: '#fff', fontSize: 16 },
});
