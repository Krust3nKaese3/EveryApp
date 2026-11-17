import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';

const GUIDE_URL = 'https://github.com/Krust3nKaese3/OpenScr/blob/main/docs/MINIAPP_AI_GUIDE.md';
const README_URL = 'https://github.com/Krust3nKaese3/OpenScr/blob/main/README.md';

interface FirstOpenScrappModalProps {
  visible: boolean;
  onClose: () => void;
}

export const FirstOpenScrappModal: React.FC<FirstOpenScrappModalProps> = ({ visible, onClose }) => {
  const open = (url: string) => { Linking.openURL(url).catch(() => {}); };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView>
            <Text style={styles.title}>Dein erstes OpenScrapp</Text>
            <Text style={styles.body}>
              Ein OpenScrapp ist eine kleine Seite aus HTML und JavaScript in deinem eigenen GitHub-Repository.
              OpenScr lädt sie und führt sie auf diesem Gerät aus.
            </Text>
            <Text style={styles.step}>1. Lege ein GitHub-Repository an. Der Branch heißt main.</Text>
            <Text style={styles.step}>2. Lege openscr.json an. Darin stehen name, version, description und entrypoint mit dem Wert index.html.</Text>
            <Text style={styles.step}>3. Lege index.html an und schreibe dort dein HTML und JavaScript.</Text>
            <Text style={styles.step}>4. Übertrage die Dateien nach GitHub.</Text>
            <Text style={styles.step}>5. Melde dich hier mit dem GitHub-Konto an, dem das Repository gehört. Füge die Adresse ein oder scanne einen QR-Code.</Text>
            <TouchableOpacity onPress={() => open(GUIDE_URL)}>
              <Text style={styles.link}>Anleitung auf GitHub</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => open(README_URL)}>
              <Text style={styles.link}>README auf GitHub</Text>
            </TouchableOpacity>
          </ScrollView>
          <TouchableOpacity style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Schließen</Text>
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
  step: { fontSize: 14, color: '#333', marginBottom: 8 },
  link: { color: '#1565C0', fontWeight: '700', marginTop: 10 },
  close: { padding: 12, marginTop: 8 },
  closeText: { textAlign: 'center', color: '#1565C0', fontWeight: '700' },
});
