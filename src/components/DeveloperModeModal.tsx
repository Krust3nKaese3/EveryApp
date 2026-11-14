import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Linking, ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { GithubSession } from '../services/GithubSession';
import { githubOAuthClientId } from '../services/developerMode';

const TOKEN_INFO =
  'Ein persönliches Token ist ein langes Passwort, das du selbst auf GitHub erzeugst. Du brauchst es nur, wenn die Anmeldung mit Code nicht klappt. Erzeugen: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token, nur Lesezugriff auf deine Repositories (Contents: Read-only). Das Token bleibt nur auf diesem Gerät gespeichert.';

interface DeveloperModeModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}

export const DeveloperModeModal: React.FC<DeveloperModeModalProps> = ({ visible, onClose, onChanged }) => {
  const [enabled, setEnabled] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [userCode, setUserCode] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const cancelPoll = useRef(false);
  const clientId = githubOAuthClientId();

  const refresh = async () => {
    const session = await GithubSession.load();
    setEnabled(session.developerMode);
    setLogin(session.login);
  };

  useEffect(() => {
    if (!visible) {
      cancelPoll.current = true;
      setUserCode(null);
      setTokenDraft('');
      setStatus('');
      return;
    }
    cancelPoll.current = false;
    refresh().catch(() => {});
  }, [visible]);

  const changed = async () => {
    await refresh();
    onChanged();
  };

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await GithubSession.setDeveloperMode(on);
      await changed();
    } catch (error: any) {
      Alert.alert('Entwicklermodus', error.message || 'Konnte nicht gespeichert werden.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      cancelPoll.current = true;
      await GithubSession.signOut();
      setUserCode(null);
      await changed();
    } finally {
      setBusy(false);
    }
  };

  const savePat = async () => {
    setBusy(true);
    setStatus('');
    try {
      await GithubSession.saveToken(tokenDraft);
      setTokenDraft('');
      await changed();
      setStatus('Angemeldet.');
    } catch (error: any) {
      Alert.alert('GitHub', error.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  const startDevice = async () => {
    if (!clientId) return;
    cancelPoll.current = false;
    setBusy(true);
    setStatus('');
    setUserCode(null);
    try {
      const start = await GithubSession.beginDeviceFlow(clientId);
      if (cancelPoll.current) return;
      setUserCode(start.userCode);
      Linking.openURL(start.verificationUri).catch(() => {});
      const deadline = Date.now() + start.expiresIn * 1000;
      let interval = start.interval;
      while (!cancelPoll.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
        if (cancelPoll.current) return;
        const poll = await GithubSession.pollDeviceFlow(clientId, start.deviceCode);
        if (poll.status === 'pending') continue;
        if (poll.status === 'slow_down') {
          interval = poll.interval;
          continue;
        }
        if (poll.status === 'success') {
          await GithubSession.saveToken(poll.accessToken);
          setUserCode(null);
          await changed();
          setStatus('Angemeldet.');
          return;
        }
        setUserCode(null);
        Alert.alert('GitHub', poll.message);
        return;
      }
    } catch (error: any) {
      setUserCode(null);
      if (!cancelPoll.current) Alert.alert('GitHub', error.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView>
            <Text style={styles.title}>Entwicklermodus</Text>
            <Text style={styles.body}>
              Der Katalog bleibt für alle nutzbar. Der Entwicklermodus ist zusätzlich und freiwillig.
              Danach kannst du nur Repositories laden, deren Besitzer das angemeldete GitHub-Konto ist,
              auch private. Fremde Links und QR-Codes werden abgelehnt. Das Token bleibt auf diesem Gerät.
              Abmelden schaltet diese Mini-Apps aus.
            </Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.choice, enabled ? styles.choiceOn : null]} disabled={busy} onPress={() => { void toggle(true); }}>
                <Text style={enabled ? styles.choiceOnText : styles.choiceText}>Ein</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, !enabled ? styles.choiceOn : null]} disabled={busy} onPress={() => { void toggle(false); }}>
                <Text style={!enabled ? styles.choiceOnText : styles.choiceText}>Aus</Text>
              </TouchableOpacity>
            </View>
            {login ? <Text style={styles.login}>Angemeldet als {login}</Text> : <Text style={styles.login}>Nicht angemeldet</Text>}
            {userCode ? (
              <View style={styles.codeBox}>
                <Text style={styles.codeLabel}>Code auf github.com/login/device eingeben</Text>
                <Text selectable style={styles.code}>{userCode}</Text>
                <TouchableOpacity onPress={() => { void Clipboard.setStringAsync(userCode); }}>
                  <Text style={styles.link}>Code kopieren</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {clientId ? (
              <>
                <Text style={styles.label}>Normal: Anmeldung mit Code</Text>
                <TouchableOpacity style={styles.primary} disabled={busy} onPress={() => { void startDevice(); }}>
                  <Text style={styles.primaryText}>Mit GitHub anmelden</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.hint}>
                Die Anmeldung mit Code ist in diesem Build nicht eingerichtet (EXPO_PUBLIC_GITHUB_CLIENT_ID).
                Die Alternative ist ein persönliches Token.
              </Text>
            )}
            <View style={styles.labelRow}>
              <Text style={styles.labelInRow}>Alternative: persönliches Token</Text>
              <TouchableOpacity
                onPress={() => Alert.alert('Persönliches Token', TOKEN_INFO)}
                accessibilityLabel="Erklärung zum persönlichen Token"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.infoButton}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={tokenDraft}
              onChangeText={setTokenDraft}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="ghp_… oder github_pat_…"
            />
            <TouchableOpacity style={styles.tokenSave} disabled={busy || !tokenDraft.trim()} onPress={() => { void savePat(); }}>
              <Text style={styles.tokenSaveText}>Token auf diesem Gerät speichern</Text>
            </TouchableOpacity>
            {login ? (
              <TouchableOpacity style={styles.danger} disabled={busy} onPress={() => { void signOut(); }}>
                <Text style={styles.dangerText}>Abmelden</Text>
              </TouchableOpacity>
            ) : null}
            {status ? <Text style={styles.hint}>{status}</Text> : null}
            {busy ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          </ScrollView>
          <TouchableOpacity style={styles.secondary} onPress={onClose}>
            <Text style={styles.secondaryText}>Schließen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: 'white', borderRadius: 12, maxHeight: '90%', padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 14, color: '#333', marginBottom: 12 },
  row: { flexDirection: 'row', marginBottom: 12 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginRight: 8, alignItems: 'center' },
  choiceOn: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  choiceText: { fontWeight: '700', color: '#333' },
  choiceOnText: { fontWeight: '700', color: 'white' },
  login: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  codeBox: { backgroundColor: '#f2f2f2', borderRadius: 8, padding: 12, marginBottom: 12 },
  codeLabel: { fontSize: 13, color: '#333' },
  code: { fontSize: 28, fontWeight: '700', letterSpacing: 2, marginVertical: 8 },
  link: { color: '#1565C0', fontWeight: '600' },
  hint: { fontSize: 13, color: '#555', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  labelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 4 },
  labelInRow: { fontSize: 13, fontWeight: '600', flex: 1 },
  infoButton: { fontSize: 20, color: '#1565C0', fontWeight: '700', paddingLeft: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 8 },
  primary: { backgroundColor: '#2196F3', borderRadius: 8, padding: 12, marginTop: 8 },
  primaryText: { color: 'white', textAlign: 'center', fontWeight: '700' },
  tokenSave: { borderWidth: 1, borderColor: '#2196F3', borderRadius: 8, padding: 12, marginTop: 8 },
  tokenSaveText: { color: '#1565C0', textAlign: 'center', fontWeight: '700' },
  danger: { borderRadius: 8, padding: 12, marginTop: 8, backgroundColor: '#f3e5e5' },
  dangerText: { color: '#b71c1c', textAlign: 'center', fontWeight: '700' },
  secondary: { padding: 12, marginTop: 8 },
  secondaryText: { textAlign: 'center', color: '#1565C0', fontWeight: '700' },
});
