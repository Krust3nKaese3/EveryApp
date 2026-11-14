import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { readDebugLog, clearDebugLog } from '../services/DebugLog';
import { MiniApp, Folder } from '../types';
import { StorageService } from '../services/StorageService';
import { GitRepoService } from '../services/GitRepoService';
import { MiniAppRunner } from '../components/MiniAppRunner';
import * as Clipboard from 'expo-clipboard';
import { Linking } from 'react-native';
import { classifyDeepLink, githubRepoKey, isGitHubRepoUrl, matchesMiniApp, queueDeepLink, repoUrlFromQr } from '../services/deepLinks';
import { SpotifySettingsModal } from '../components/SpotifySettingsModal';
import { AppInfoModal } from '../components/AppInfoModal';
import { LegalModal } from '../components/LegalModal';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { bundledBlocklistFile, bundledCatalogFile, loadPolicyLists } from '../services/remoteLists';
import {
  REPORT_EMAIL,
  blockReasonFor,
  decideAdd,
  isCatalogOnlyBuild,
  reportMailto,
  mergeUpdatedApp,
  type BlocklistFile,
  type CatalogFile,
} from '../services/storePolicy';
import { updateStatus, versionLine } from '../services/githubPin';

function confirmForeign(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('Unbekannte Quelle', message, [
      { text: 'Abbrechen', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Trotzdem hinzufügen', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export const HomeScreen: React.FC = () => {
  const [apps, setApps] = useState<MiniApp[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [catalog, setCatalog] = useState<CatalogFile>(() => bundledCatalogFile());
  const [blocklist, setBlocklist] = useState<BlocklistFile>(() => bundledBlocklistFile());
  const [latestSha, setLatestSha] = useState<Record<string, string>>({});
  const [infoApp, setInfoApp] = useState<MiniApp | null>(null);
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const catalogOnly = isCatalogOnlyBuild();
  const dismissedUpdates = useRef<Set<string>>(new Set());
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<MiniApp | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [debugLines, setDebugLines] = useState<string[] | null>(null);
  const [showSpotifySettings, setShowSpotifySettings] = useState(false);
  const openDebugLog = async () => setDebugLines(await readDebugLog());
  const [newFolderName, setNewFolderName] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLock = useRef(false);
  const gate = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (task: () => Promise<void>) => {
    const next = gate.current.then(task, task);
    gate.current = next.then(() => undefined, () => undefined);
  };

  const performAdd = async (raw: string, source: 'field' | 'link') => {
    const trimmed = raw.trim();
    if (!trimmed) {
      Alert.alert('Fehler', 'Bitte eine Repository-URL eingeben.');
      return;
    }
    if (source === 'link' && !isGitHubRepoUrl(trimmed)) {
      Alert.alert('Add-Link', 'Der Add-Link enthält keine gültige GitHub-URL (https://github.com/besitzer/repo).');
      return;
    }
    const decision = decideAdd(trimmed, { catalog, blocklist, catalogOnly });
    if (decision.type === 'reject' || decision.type === 'blocked') {
      Alert.alert(decision.title, decision.message);
      return;
    }
    if (decision.type === 'confirm-foreign') {
      const accepted = await confirmForeign(decision.message);
      if (!accepted) return;
    }
    setLoading(true);
    try {
      const key = githubRepoKey(trimmed);
      if (key) {
        const existing = (await StorageService.getApps()).find((a) => githubRepoKey(a.repoUrl) === key);
        if (existing) {
          Alert.alert('Bereits installiert', `${existing.manifest.name} ist schon installiert.`, [
            { text: 'OK', style: 'cancel' },
            { text: 'Öffnen', onPress: () => { void openAppRef.current(existing); } },
          ]);
          return;
        }
      }
      const blockedNow = blockReasonFor('', trimmed, blocklist);
      if (blockedNow) {
        Alert.alert('Mini-App gesperrt', blockedNow);
        return;
      }
      const app = await GitRepoService.fetchRepo(trimmed);
      const blockedId = blockReasonFor(app.id, app.repoUrl, blocklist);
      if (blockedId) {
        await GitRepoService.deleteApp(app);
        Alert.alert('Mini-App gesperrt', blockedId);
        return;
      }
      await StorageService.saveApp(app);
      await loadData();
      if (source === 'field') setRepoUrl('');
      Alert.alert('Hinzugefügt', `${app.manifest.name} wurde hinzugefügt.`);
    } catch (error: any) {
      Alert.alert('Fehler', error.message);
    } finally {
      setLoading(false);
    }
  };
  const performAddRef = useRef(performAdd);
  performAddRef.current = performAdd;
  const openAppRef = useRef<(app: MiniApp) => Promise<void>>(async () => {});

  // everyapp://add?url=… (and exp+everyapp://add?url=…) installs a repo.
  // Other everyapp://<miniapp>/… links open that mini-app. Handled before the mini-app flow.
  useEffect(() => {
    const recent = { url: '', at: 0 };
    const handle = (url?: string | null) => {
      if (!url) return;
      const now = Date.now();
      if (recent.url === url && now - recent.at < 2500) return;
      recent.url = url;
      recent.at = now;
      enqueue(async () => {
        const classified = classifyDeepLink(url);
        if (classified.type === 'ignore') return;
        if (classified.type === 'add') {
          await performAddRef.current(classified.repoUrl, 'link');
          return;
        }
        const link = classified.link;
        const all = await StorageService.getApps();
        const target = all.find((a) => matchesMiniApp(link, a));
        if (!target) { Alert.alert('Deep-Link', `Mini-App "${link.miniapp}" ist nicht installiert.\n\n${url}`); return; }
        queueDeepLink(target.id, link);
        await openAppRef.current(target);
      });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => { handle(e.url); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    loadData();
    loadPolicyLists().then((lists) => {
      setCatalog(lists.catalog);
      setBlocklist(lists.blocklist);
    }).catch(() => {});
  }, []);

  const loadData = async () => {
    const loadedApps = await StorageService.getApps();
    const loadedFolders = await StorageService.getFolders();
    setApps(loadedApps);
    setFolders(loadedFolders);
    void checkUpdates(loadedApps);
  };

  const checkUpdates = async (installed: MiniApp[]) => {
    const found: Record<string, string> = {};
    for (const app of installed) {
      try {
        found[app.id] = await GitRepoService.latestCommit(app.repoUrl);
      } catch {
        // Offline or GitHub rate limit: the installed copy stays usable.
      }
    }
    if (Object.keys(found).length > 0) setLatestSha((current) => ({ ...current, ...found }));
  };

  const handleAddRepo = () => {
    enqueue(() => performAdd(repoUrl, 'field'));
  };

  const openScanner = async () => {
    let granted = permission?.granted === true;
    if (!granted) {
      const res = await requestPermission();
      granted = res.granted;
    }
    if (!granted) {
      Alert.alert(
        'Kamera',
        'Ohne Kamerazugriff kann EveryApp keinen QR-Code scannen. Erlaube die Kamera in den Einstellungen.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Einstellungen', onPress: () => { Linking.openSettings().catch(() => {}); } },
        ],
      );
      return;
    }
    scanLock.current = false;
    setScanning(true);
  };

  const handleBarcode = (result: { data: string }) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanning(false);
    const parsed = repoUrlFromQr(result.data);
    if (!parsed.ok) {
      Alert.alert('QR-Code', parsed.message);
      return;
    }
    enqueue(() => performAdd(parsed.repoUrl, 'link'));
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      Alert.alert('Fehler', 'Bitte einen Ordnernamen eingeben.');
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
      'Ordner löschen',
      'Apps in diesem Ordner wandern in die Übersicht. Fortfahren?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
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
    Alert.alert('App verschieben', `${app.manifest.name} verschieben?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Verschieben',
        onPress: async () => {
          await StorageService.updateAppFolder(app.id, folderId);
          await loadData();
        },
      },
    ]);
  };

  const handleDeleteApp = (app: MiniApp) => {
    Alert.alert('App löschen', `${app.manifest.name} und alle ihre gespeicherten Daten löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await GitRepoService.deleteApp(app);
          await StorageService.deleteApp(app.id);
          setInfoApp((current) => current?.id === app.id ? null : current);
          await loadData();
        },
      },
    ]);
  };

  const [actionApp, setActionApp] = useState<MiniApp | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const handleRefreshApp = async (app: MiniApp) => {
    setRefreshingId(app.id);
    try {
      const fresh = await GitRepoService.fetchRepo(app.repoUrl);
      const merged = mergeUpdatedApp(app, fresh);
      await StorageService.saveApp(merged);
      if (merged.commitSha) setLatestSha((current) => ({ ...current, [app.id]: merged.commitSha as string }));
      await loadData();
      return merged;
    } catch (error: any) {
      Alert.alert('Aktualisierung fehlgeschlagen', error.message);
      return null;
    } finally {
      setRefreshingId(null);
    }
  };

  const openApp = async (app: MiniApp) => {
    const reason = blockReasonFor(app.id, app.repoUrl, blocklist);
    if (reason) {
      Alert.alert('Mini-App gesperrt', reason);
      return;
    }
    let latest: string | undefined = latestSha[app.id];
    if (!latest) {
      try {
        latest = await GitRepoService.latestCommit(app.repoUrl);
        const resolved = latest;
        setLatestSha((current) => ({ ...current, [app.id]: resolved }));
      } catch {
        latest = undefined;
      }
    }
    if (latest && updateStatus(app.commitSha, latest) === 'available' && !dismissedUpdates.current.has(app.id)) {
      const installed = app;
      const newest = latest;
      Alert.alert(
        'Update verfügbar',
        `${versionLine(installed.manifest.version, installed.commitSha, newest)}\n\nDer Speicher dieser Mini-App bleibt beim Aktualisieren erhalten.`,
        [
          { text: 'Später', onPress: () => { dismissedUpdates.current.add(installed.id); setSelectedApp(installed); } },
          { text: 'Aktualisieren', onPress: () => { void refreshAndOpen(installed); } },
        ],
      );
      return;
    }
    setSelectedApp(app);
  };
  openAppRef.current = openApp;

  const refreshAndOpen = async (app: MiniApp) => {
    const merged = await handleRefreshApp(app);
    if (merged) setSelectedApp(merged);
  };

  const reportApp = (app: MiniApp) => {
    const url = reportMailto({
      name: app.manifest.name,
      repoUrl: app.repoUrl,
      id: app.id,
      version: app.manifest.version,
      commitSha: app.commitSha,
    });
    Linking.openURL(url).catch(() => {
      Alert.alert('Melden', `Die Mail-App konnte nicht geöffnet werden. Schreibe an ${REPORT_EMAIL}.`);
    });
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

  const renderApp = (app: MiniApp) => {
    const blocked = blockReasonFor(app.id, app.repoUrl, blocklist);
    const latest = latestSha[app.id];
    const status = updateStatus(app.commitSha, latest);
    return (
      <TouchableOpacity
        key={app.id}
        style={[styles.appItem, blocked ? styles.appBlocked : null]}
        onPress={() => { void openApp(app); }}
        onLongPress={() => setActionApp(app)}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>{app.manifest.name}</Text>
            <Text style={styles.appDesc}>{blocked ? `Gesperrt: ${blocked}` : app.manifest.description}</Text>
            <Text style={styles.appVersion}>{versionLine(app.manifest.version, app.commitSha, latest)}</Text>
            {status === 'available' && !blocked ? <Text style={styles.updateHint}>Update verfügbar</Text> : null}
          </View>
          {!blocked ? (
            <TouchableOpacity
              onPress={() => { void handleRefreshApp(app); }}
              disabled={refreshingId === app.id}
              style={{ padding: 10 }}
              accessibilityLabel="Aktualisieren"
            >
              <Text style={{ fontSize: 22, opacity: refreshingId === app.id ? 0.3 : 1 }}>⟳</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const rootApps = apps.filter((a) => !a.folderId);
  
  return (
    <View style={styles.container}>
      {selectedApp ? (
        <MiniAppRunner app={selectedApp} onClose={() => setSelectedApp(null)} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.title}>EveryApp</Text>
            <View>
              <TouchableOpacity onPress={() => setLegalDoc('privacy')}>
                <Text style={styles.headerLink}>Datenschutz</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLegalDoc('terms')}>
                <Text style={styles.headerLink}>Nutzung</Text>
              </TouchableOpacity>
            </View>
          </View>

          {catalogOnly ? (
            <View style={styles.catalogOnlyNote}>
              <Text style={styles.catalogOnlyText}>
                In dieser Version kannst du nur Mini-Apps aus dem Katalog installieren.
              </Text>
            </View>
          ) : (
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="GitHub-Adresse, z. B. https://github.com/name/repo"
                value={repoUrl}
                onChangeText={setRepoUrl}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.addButton, loading && styles.buttonDisabled]}
                onPress={handleAddRepo}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? 'Lädt…' : 'Hinzufügen'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrButton, loading && styles.buttonDisabled]}
                onPress={openScanner}
                disabled={loading}
                accessibilityLabel="QR-Code scannen"
              >
                <Text style={styles.buttonText}>QR</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.toolbarContainer}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => setShowFolderModal(true)}
            >
              <Text style={styles.toolbarButtonText}>+ Neuer Ordner</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toolbarButton, { marginLeft: 8 }]} onPress={openDebugLog}>
              <Text style={styles.toolbarButtonText}>Debug-Log</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.toolbarButton, { marginLeft: 8 }]} onPress={() => setShowSpotifySettings(true)}>
              <Text style={styles.toolbarButtonText}>Spotify</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={[{ type: 'root' }, ...folders.map((f) => ({ type: 'folder', folder: f }))]}
            keyExtractor={(item: any) =>
              item.type === 'root' ? 'root' : item.folder.id
            }
            ListHeaderComponent={
              <View>
                <Text style={styles.sectionTitle}>Empfohlen</Text>
                {catalog.apps.map((entry) => {
                  const installed = apps.find((app) => githubRepoKey(app.repoUrl) === githubRepoKey(entry.repoUrl));
                  const blocked = blockReasonFor(installed?.id || '', entry.repoUrl, blocklist);
                  return (
                    <View key={entry.repoUrl} style={styles.appItem}>
                      <Text style={styles.appName}>{entry.name}</Text>
                      <Text style={styles.appDesc}>{entry.description}</Text>
                      <Text style={styles.appVersion}>Altersangabe: {entry.ageRating}</Text>
                      {blocked ? <Text style={styles.updateHint}>Gesperrt: {blocked}</Text> : (
                        <TouchableOpacity
                          style={styles.catalogButton}
                          disabled={loading}
                          onPress={() => {
                            if (installed) void openApp(installed);
                            else enqueue(() => performAdd(entry.repoUrl, 'link'));
                          }}
                        >
                          <Text style={styles.catalogButtonText}>{installed ? 'Öffnen' : 'Installieren'}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            }
            renderItem={({ item }: any) => {
              if (item.type === 'root') {
                return (
                  <View>
                    <Text style={styles.sectionTitle}>Meine Apps</Text>
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

          <SpotifySettingsModal visible={showSpotifySettings} onClose={() => setShowSpotifySettings(false)} />

          <Modal visible={debugLines !== null} transparent animationType="slide" onRequestClose={() => setDebugLines(null)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContainer, { maxHeight: '85%', width: '92%' }]}>
                <Text style={styles.modalTitle}>Debug-Log ({debugLines?.length ?? 0})</Text>
                <ScrollView style={{ maxHeight: 420, backgroundColor: '#111', borderRadius: 6, padding: 8, marginBottom: 12 }}>
                  <Text selectable style={{ color: '#eee', fontFamily: 'monospace', fontSize: 11 }}>
                    {debugLines && debugLines.length ? [...debugLines].reverse().join('\n') : 'Noch keine Einträge.'}
                  </Text>
                </ScrollView>
                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.modalButtonCreate} onPress={async () => { await Clipboard.setStringAsync((debugLines || []).join('\n')); Alert.alert('Debug-Log', 'In die Zwischenablage kopiert'); }}>
                    <Text style={styles.modalButtonText}>Kopieren</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalButtonCreate} onPress={openDebugLog}>
                    <Text style={styles.modalButtonText}>Neu laden</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalButtonCancel} onPress={async () => { await clearDebugLog(); setDebugLines([]); }}>
                    <Text style={styles.modalButtonText}>Leeren</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setDebugLines(null)}>
                    <Text style={styles.modalButtonText}>Schließen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
            <View style={styles.scannerScreen}>
              {scanning ? (
                <CameraView
                  style={styles.scannerCamera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleBarcode}
                  onMountError={() => {
                    setScanning(false);
                    Alert.alert('Kamera', 'Die Kamera konnte nicht gestartet werden.');
                  }}
                />
              ) : null}
              <View style={styles.scannerHint}>
                <Text style={styles.scannerHintText}>
                  QR-Code mit GitHub-Link oder EveryApp-Add-Link scannen
                </Text>
                <TouchableOpacity style={styles.scannerCancel} onPress={() => setScanning(false)}>
                  <Text style={styles.scannerCancelText}>Abbrechen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Modal visible={showFolderModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContainer}>
                <Text style={styles.modalTitle}>Neuer Ordner</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Ordnername"
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
                    <Text style={styles.modalButtonText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonCreate}
                    onPress={handleCreateFolder}
                  >
                    <Text style={[styles.modalButtonText, { color: 'white' }]}>Anlegen</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}

      <AppInfoModal
        app={infoApp}
        latestSha={infoApp ? latestSha[infoApp.id] : undefined}
        blocked={infoApp ? blockReasonFor(infoApp.id, infoApp.repoUrl, blocklist) : null}
        refreshing={!!infoApp && refreshingId === infoApp.id}
        onClose={() => setInfoApp(null)}
        onUpdate={(app) => { void handleRefreshApp(app); }}
        onReport={reportApp}
        onDelete={handleDeleteApp}
      />
      <LegalModal document={legalDoc} onClose={() => setLegalDoc(null)} />

      <Modal visible={!!actionApp} transparent animationType="fade" onRequestClose={() => setActionApp(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionApp(null)}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, width: '85%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{actionApp?.manifest.name}</Text>
            <Text selectable style={{ fontSize: 13, color: '#333', backgroundColor: '#f2f2f2', padding: 8, borderRadius: 6, marginBottom: 8 }}>{actionApp?.repoUrl}</Text>
            {[
              { label: 'Info und Berechtigungen', fn: (a: MiniApp) => setInfoApp(a) },
              { label: 'Melden', fn: (a: MiniApp) => reportApp(a) },
              { label: 'GitHub-Link kopieren', fn: async (a: MiniApp) => { await Clipboard.setStringAsync(a.repoUrl); } },
              { label: 'In die Übersicht', fn: (a: MiniApp) => handleMoveApp(a, null) },
              ...folders.map((f) => ({ label: `Verschieben nach ${f.name}`, fn: (a: MiniApp) => handleMoveApp(a, f.id) })),
              { label: 'Löschen', fn: (a: MiniApp) => handleDeleteApp(a), danger: true },
              { label: 'Abbrechen', fn: () => {} },
            ].map((b: any) => (
              <TouchableOpacity
                key={b.label}
                style={{ paddingVertical: 12 }}
                onPress={() => { const a = actionApp; setActionApp(null); if (a) b.fn(a); }}
              >
                <Text style={{ fontSize: 16, color: b.danger ? '#d32f2f' : '#2196F3' }}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  headerLink: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  catalogOnlyNote: {
    backgroundColor: 'white',
    padding: 16,
  },
  catalogOnlyText: {
    color: '#333',
    fontSize: 14,
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
    minHeight: 48,
  },
  qrButton: {
    backgroundColor: '#1565C0',
    paddingHorizontal: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
    minWidth: 56,
    marginLeft: 8,
  },
  scannerScreen: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerCamera: {
    flex: 1,
  },
  scannerHint: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 36,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  scannerHintText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  scannerCancel: {
    backgroundColor: 'white',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 8,
    minWidth: 160,
  },
  scannerCancelText: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1565C0',
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
  appVersion: {
    fontSize: 12,
    color: '#1565C0',
    marginTop: 4,
  },
  updateHint: {
    fontSize: 12,
    color: '#e65100',
    fontWeight: '700',
    marginTop: 4,
  },
  appBlocked: {
    opacity: 0.55,
  },
  catalogButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  catalogButtonText: {
    color: 'white',
    fontWeight: '700',
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
