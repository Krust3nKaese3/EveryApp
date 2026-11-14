import React from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { PRIVACY_MD, TERMS_MD } from '../legal/documents';

interface LegalModalProps {
  document: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ document, onClose }) => {
  const title = document === 'privacy' ? 'Datenschutzerklärung' : 'Nutzungsbedingungen';
  const body = document === 'privacy' ? PRIVACY_MD : TERMS_MD;
  return (
    <Modal visible={document != null} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <Text style={styles.title}>{title}</Text>
        <ScrollView contentContainerStyle={styles.content}>
          <Text selectable style={styles.body}>{body}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Schließen</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white', paddingTop: 48, paddingHorizontal: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  content: { paddingBottom: 24 },
  body: { fontSize: 14, lineHeight: 21, color: '#222' },
  close: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, marginBottom: 24 },
  closeText: { color: 'white', textAlign: 'center', fontWeight: '700' },
});
