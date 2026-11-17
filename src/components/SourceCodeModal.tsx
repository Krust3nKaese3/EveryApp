import React, { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MiniApp } from '../types';
import { loadSourceFiles } from '../services/sourceFiles';

interface SourceCodeModalProps {
  app: MiniApp | null;
  visible: boolean;
  onClose: () => void;
}

export const SourceCodeModal: React.FC<SourceCodeModalProps> = ({ app, visible, onClose }) => {
  const [files, setFiles] = useState<{ path: string; text: string }[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !app) return;
    let live = true;
    setLoading(true);
    setError(null);
    setFiles([]);
    setSelected(0);
    loadSourceFiles(app.localPath, app.manifest.entrypoint).then((list) => {
      if (!live) return;
      setFiles(list);
      if (!list.length) setError('Keine HTML- oder JavaScript-Datei gefunden.');
    }).catch((err: { message?: string }) => {
      if (live) setError(err.message || 'Der Quelltext konnte nicht gelesen werden.');
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [visible, app]);

  const current = files[selected];

  return (
    <Modal visible={visible && !!app} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Quelltext</Text>
          <Text style={styles.hint}>Nur lesen. {app?.manifest.name}</Text>
          {loading ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {files.length > 1 ? (
            <ScrollView horizontal style={styles.tabs} contentContainerStyle={styles.tabsContent}>
              {files.map((file, index) => (
                <TouchableOpacity key={file.path} style={[styles.tab, index === selected ? styles.tabOn : null]} onPress={() => setSelected(index)}>
                  <Text style={index === selected ? styles.tabOnText : styles.tabText}>{file.path}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : current ? <Text style={styles.path}>{current.path}</Text> : null}
          <ScrollView style={styles.codeBox}>
            <Text selectable style={styles.code}>{current?.text || ''}</Text>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 12 },
  card: { backgroundColor: 'white', borderRadius: 12, maxHeight: '92%', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 13, color: '#555', marginBottom: 8 },
  error: { color: '#b71c1c', marginBottom: 8 },
  path: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  tabs: { maxHeight: 44, marginBottom: 8 },
  tabsContent: { alignItems: 'center' },
  tab: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  tabOn: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  tabText: { fontSize: 12, color: '#333' },
  tabOnText: { fontSize: 12, color: 'white', fontWeight: '700' },
  codeBox: { backgroundColor: '#111', borderRadius: 8, maxHeight: 420, padding: 10 },
  code: { color: '#eee', fontFamily: 'monospace', fontSize: 12 },
  close: { padding: 12, marginTop: 8 },
  closeText: { textAlign: 'center', color: '#1565C0', fontWeight: '700' },
});
