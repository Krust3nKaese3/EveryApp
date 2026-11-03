import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { MiniApp, Folder } from '../types';
import { StorageService } from '../services/StorageService';
import { GitRepoService } from '../services/GitRepoService';
import { MiniAppRunner } from '../components/MiniAppRunner';

export const HomeScreen: React.FC = () => {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const loadedApps = await StorageService.getApps();
    const loadedFolders = await StorageService.getFolders();
    setApps(loadedApps);
    setFolders(loadedFolders);
  };

  const handleAddRepo = async () => {
    if (!repoUrl.trim()) {
      Alert.alert('Error', 'Please enter a repository URL');
      return;
    }

    setLoading(true);
    try {
      const app = await GitRepoService.fetchRepo(repoUrl.trim());
      await StorageService.saveApp(app);
      await loadData();
      setRepoUrl('');
      Alert.alert('Success', `Added ${app.manifest.name}`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Error', 'Please enter a folder name');
      return;
    }

    const folder: Folder = {
      id: Date.now().toString(),
      name: newFolderName.trim(),
      createdAt: Date.now(),
    };

    await StorageService.saveFolder(folder);
    await loadData();
    setNewFolderName('');
    setShowFolderModal(false);
  };

  const handleDeleteFolder = async (folderId: string) => {
    Alert.alert(
      'Delete Folder',
      'Apps in this folder will be moved to root. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await StorageService.deleteFolder(folderId);
            await loadData();
          },
        },
      ]
    );
  };

  const handleMoveApp = (app: MiniApp, folderId: string | null) => {
    Alert.alert('Move App', `Move ${app.manifest.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move',
        onPress: async () => {
          await StorageService.updateAppFolder(app.id, folderId);
          await loadData();
        },
      },
    ]);
  };

  const handleDeleteApp = (app: MiniApp) => {
    Alert.alert('Delete App', `Delete ${app.manifest.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await GitRepoService.deleteApp(app);
          await StorageService.deleteApp(app.id);
          await loadData();
        },
      },
    ]);
  };

  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshApp = async (app: MiniApp) => {
    setRefreshingId(app.id);
    try {
      const fresh = await GitRepoService.fetchRepo(app.repoUrl);
      await StorageService.saveApp({ ...fresh, addedAt: app.addedAt, folderId: app.folderId });
      await loadData();
    } catch (error: any) {
      Alert.alert('Update failed', error.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderApp = (app: MiniApp) => (
    <TouchableOpacity
      key={app.id}
      style={styles.appItem}
      onPress={() => setSelectedApp(app)}
      onLongPress={() =>
        Alert.alert('App Actions', `Actions for ${app.manifest.name}`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Move to Root', onPress: () => handleMoveApp(app, null) },
          ...folders.map((f) => ({
            text: `Move to ${f.name}`,
            onPress: () => handleMoveApp(app, f.id),
          })),
          { text: 'Delete', style: 'destructive', onPress: () => handleDeleteApp(app) },
        ])
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appName}>{app.manifest.name}</Text>
          <Text style={styles.appDesc}>{app.manifest.description}</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRefreshApp(app)}
          disabled={refreshingId === app.id}
          style={{ padding: 10 }}
        >
          <Text style={{ fontSize: 22, opacity: refreshingId === app.id ? 0.3 : 1 }}>⟳</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const rootApps = apps.filter((a) => !a.folderId);
  
  return (
    <View style={styles.container}>
      {selectedApp ? (
        <MiniAppRunner app={selectedApp} onClose={() => setSelectedApp(null)} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>EveryApp</Text>
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="GitHub repo URL (e.g., https://github.com/user/repo)"
              value={repoUrl}
              onChangeText={setRepoUrl}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.addButton, loading && styles.buttonDisabled]}
              onPress={handleAddRepo}
              disabled={loading}
            >
              <Text style={styles.buttonText}>{loading ? 'Adding...' : 'Add'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarContainer}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowFolderModal(true)}
            >
              <Text style={styles.toolbarButtonText}>+ New Folder</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={[{ type: 'root' }, ...folders.map((f) => ({ type: 'folder', folder: f }))]}
            keyExtractor={(item: any) =>
              item.type === 'root' ? 'root' : item.folder.id
            }
            renderItem={({ item }: any) => {
              if (item.type === 'root') {
                return (
                  <View>
                    <Text style={styles.sectionTitle}>My Apps</Text>
                    {rootApps.map(renderApp)}
                  </View>
                );
              } else {
                const folder = item.folder;
                const folderApps = apps.filter((a) => a.folderId === folder.id);
                const isExpanded = expandedFolders.has(folder.id);

                return (
                  <View>
                    <TouchableOpacity
                      style={styles.folderHeader}
                      onPress={() => toggleFolder(folder.id)}
                      onLongPress={() => handleDeleteFolder(folder.id)}
                    >
                      <Text style={styles.folderIcon}>{isExpanded ? '▼' : '▶'}</Text>
                      <Text style={styles.folderName}>{folder.name}</Text>
                      <Text style={styles.folderCount}>({folderApps.length})</Text>
                    </TouchableOpacity>
                    {isExpanded && folderApps.map(renderApp)}
                  </View>
                );
              }
            }}
          />

          <Modal visible={showFolderModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <Text style={styles.modalTitle}>New Folder</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Folder name"
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonCancel}
                    onPress={() => {
                      setShowFolderModal(false);
                      setNewFolderName('');
                    }}
                  >
                    <Text style={styles.modalButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonCreate}
                    onPress={handleCreateFolder}
                  >
                    <Text style={styles.modalButtonText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#2196F3',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  toolbarContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  toolbarButton: {
    padding: 8,
  },
  toolbarButtonText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
    backgroundColor: '#f9f9f9',
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f0f0f0',
  },
  folderIcon: {
    fontSize: 12,
    marginRight: 8,
  },
  folderName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  folderCount: {
    fontSize: 14,
    color: '#666',
  },
  appItem: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  appDesc: {
    fontSize: 14,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
    marginRight: 8,
  },
  modalButtonCreate: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  modalButtonText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
