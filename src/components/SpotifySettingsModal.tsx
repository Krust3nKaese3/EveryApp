import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SPOTIFY_REDIRECT_URI, spotifyClientIdSourceLabel } from '../services/spotifyClientId';
import { getSpotifyClientId, setSpotifySettingsClientId } from '../services/spotifySettings';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Container settings. This value wins over a mini-app setClientId and over the build prefill. */
export const SpotifySettingsModal: React.FC<Props> = ({ visible, onClose }) => {
  const [value, setValue] = useState('');
  const [active, setActive] = useState('wird geladen …');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let gone = false;
    (async () => {
      try {
        const info = await getSpotifyClientId();
        if (gone) return;
        setValue(info.settingsClientId ?? '');
        const shown = info.clientId ? `${info.clientId} (${spotifyClientIdSourceLabel(info.source)})` : 'keine';
        setActive(shown);
      } catch (e: any) {
        if (!gone) setActive(e?.message || 'Konnte die Client ID nicht lesen');
      }
    })();
    return () => { gone = true; };
  }, [visible]);

  const save = async (next: string) => {
    setBusy(true);
    try {
      const info = await setSpotifySettingsClientId(next);
      setValue(info.settingsClientId ?? '');
      const shown = info.clientId ? `${info.clientId} (${spotifyClientIdSourceLabel(info.source)})` : 'keine';
      setActive(shown);
      if (info.needsBuild) {
        Alert.alert('Spotify', 'Client ID im Container gespeichert. Login und Wiedergabe brauchen den Build mit dem Spotify-Modul.');
      }
    } catch (e: any) {
      Alert.alert('Spotify', e?.message || 'Speichern fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Spotify</Text>
          <Text style={styles.body}>
            Client ID aus dem Spotify Developer Dashboard. Leer lassen ist normal, bis du eine App angelegt hast.
            Die hier gespeicherte ID gilt sofort, ohne neuen Build, und hat Vorrang vor Mini-Apps und vor einem optionalen Build-Prefill.
          </Text>
          <Text style={styles.label}>Client ID in den Einstellungen</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder="32 Hex-Zeichen"
            editable={!busy}
          />
          <Text selectable style={styles.meta}>Aktiv: {active}</Text>
          <Text selectable style={styles.meta}>Redirect-URI: {SPOTIFY_REDIRECT_URI}</Text>
          {busy ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.secondary} onPress={() => save('')} disabled={busy}>
              <Text style={styles.secondaryText}>Leeren</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={() => save(value)} disabled={busy}>
              <Text style={styles.primaryText}>Speichern</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.secondaryText}>Schließen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 13, color: '#333', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontFamily: 'monospace' },
  meta: { fontSize: 12, color: '#444', marginTop: 8 },
  row: { flexDirection: 'row', marginTop: 16 },
  secondary: { flex: 1, backgroundColor: '#f0f0f0', padding: 12, borderRadius: 8, marginRight: 8 },
  primary: { flex: 1, backgroundColor: '#1DB954', padding: 12, borderRadius: 8, marginLeft: 8 },
  secondaryText: { textAlign: 'center', fontWeight: '600', color: '#333' },
  primaryText: { textAlign: 'center', fontWeight: '700', color: 'white' },
  close: { marginTop: 10, padding: 10 },
});
