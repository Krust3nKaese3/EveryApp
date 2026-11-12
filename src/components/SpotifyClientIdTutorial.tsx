import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  DEVELOPMENT_ANDROID_PACKAGE,
  PRODUCTION_ANDROID_PACKAGE,
  SPOTIFY_DASHBOARD_URL,
  SPOTIFY_REDIRECT_URI,
  readRunningAndroidPackage,
  spotifyAndroidDashboardTarget,
  SpotifyAndroidDashboardTarget,
} from '../services/spotifyClientId';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const DASHBOARD_SHOT = require('../../assets/spotify-tutorial/android-packages-sha1.png');

/** Official screenshot is 1866×494. Shown wider than a phone so the two fields stay readable. */
const SHOT_WIDTH = 920;
const SHOT_HEIGHT = Math.round(SHOT_WIDTH * (494 / 1866));

export const SpotifyClientIdTutorial: React.FC<Props> = ({ visible, onClose }) => {
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * 0.92);
  const target = useMemo(() => spotifyAndroidDashboardTarget(readRunningAndroidPackage()), []);
  const dev = useMemo(() => spotifyAndroidDashboardTarget(DEVELOPMENT_ANDROID_PACKAGE), []);
  const prod = useMemo(() => spotifyAndroidDashboardTarget(PRODUCTION_ANDROID_PACKAGE), []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { maxHeight: sheetHeight }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Anleitung</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Anleitung schließen">
              <Text style={styles.closeText}>Schließen</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ maxHeight: sheetHeight - 52 }}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <Text style={styles.lead}>
              So legst du die Spotify-App an und trägst die Client ID hier in EveryApp ein.
              EveryApp ist kein offizielles Spotify-Produkt.
            </Text>

            <Step n={1} title="Die ID gehört in EveryApp">
              <Text style={styles.body}>
                Die Client ID speicherst du in EveryApp selbst, in diesen Container-Einstellungen.
                Nicht in einem Mini-App-Repo. Nach Speichern gilt sie sofort, ohne neuen Build.
                Dieser Wert hat Vorrang vor setClientId einer Mini-App und vor einem optionalen Build-Prefill.
              </Text>
            </Step>

            <Step n={2} title="Dashboard am Rechner, Einfügen hier">
              <Text style={styles.body}>
                Die Spotify-App legst du leichter am Computer an. Die Client ID kopierst du dort
                und fügst sie auf diesem EveryApp-Bildschirm am Handy ein.
              </Text>
              <CopyValue label="Spotify Developer Dashboard" value={SPOTIFY_DASHBOARD_URL} />
            </Step>

            <Step n={3} title="Web API und Android SDK">
              <Text style={styles.body}>
                Beim Anlegen Web API und Android SDK auswählen. Nicht das Web Playback SDK.
                EveryApp steuert die installierte Spotify-App, es spielt nicht im Browser.
              </Text>
            </Step>

            <Step n={4} title="Redirect URI">
              <Text style={styles.body}>Trag exakt diese Adresse ein.</Text>
              <CopyValue label="Redirect URI" value={SPOTIFY_REDIRECT_URI} />
            </Step>

            <Step n={5} title="Bundle IDs leer lassen">
              <Text style={styles.body}>
                Das Feld Bundle IDs bleibt leer. Es gilt nur für iOS, und EveryApp ist vorerst nur Android.
              </Text>
            </Step>

            <Step n={6} title="Android Packages, zwei Felder">
              <Text style={styles.body}>
                Unter Android Packages gibt es keine eigene Überschrift „SHA“. Zwei Felder stehen
                nebeneinander: links Package name, rechts Package SHA1 fingerprint. Danach Add und speichern.
              </Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.shotScroll}>
                <Image
                  source={DASHBOARD_SHOT}
                  style={styles.shot}
                  resizeMode="contain"
                  accessibilityLabel="Spotify Developer Dashboard, Zeile Android Packages: links Package name, rechts Package SHA1 fingerprint"
                />
              </ScrollView>
              <Text style={styles.caption}>
                Abbildung: Spotify Developer Dashboard, nicht die EveryApp-Oberfläche.
                Seitlich schieben, wenn das Bild breiter als der Bildschirm ist.
              </Text>
            </Step>

            <Step n={7} title="Paketname und SHA-1 dieser App">
              <Text style={styles.body}>
                Paketname und SHA-1 müssen zu der App passen, die gerade läuft.
                Eine Produktions-SHA-1 steht hier nicht — die bitte nicht raten und nicht vom Debug-Keystore abschreiben.
              </Text>
              <VariantBlock target={target} dev={dev} prod={prod} />
            </Step>

            <Step n={8} title="Client ID hier einfügen">
              <Text style={styles.body}>
                Nach dem Anlegen die Client ID kopieren. Das sind 32 Hex-Zeichen.
                In das Feld auf diesem Bildschirm einfügen und auf Speichern tippen.
              </Text>
            </Step>

            <Step n={9} title="Spotify-App und Premium">
              <Text style={styles.body}>
                Auf dem Handy muss die Spotify-App installiert sein. Melde dich dort mit einem Premium-Account an.
                API und SDK kosten nichts extra. Premium brauchst du, um einen bestimmten Track zu starten.
              </Text>
            </Step>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

function VariantBlock({
  target,
  dev,
  prod,
}: {
  target: SpotifyAndroidDashboardTarget;
  dev: SpotifyAndroidDashboardTarget;
  prod: SpotifyAndroidDashboardTarget;
}) {
  if (target.variant === 'development' && target.packageName && target.sha1) {
    return (
      <View>
        <Text style={styles.body}>
          Du nutzt gerade SrvEveryApp (Development, APP_VARIANT=development).
          Der SHA-1 ist der öffentliche Fingerabdruck des Debug-Keystores, mit dem diese SrvEveryApp-APK signiert ist.
          Ohne Doppelpunkte gilt derselbe Wert auch. Zum Kopieren ist die Form mit Doppelpunkten, so wie das Dashboard-Feld sie zeigt.
        </Text>
        <CopyValue label="Package name" value={target.packageName} />
        <CopyValue label="Package SHA1 fingerprint" value={target.sha1} />
      </View>
    );
  }

  if (target.variant === 'production' && target.packageName) {
    return (
      <View>
        <Text style={styles.body}>
          Du nutzt gerade EveryApp. Den SHA-1 dieser Signatur gibt es in diesem Projekt nicht.
          Lies ihn am Signaturzertifikat ab oder in den EAS-Android-Credentials dieses Builds.
          Den Debug-SHA-1 von SrvEveryApp hier nicht eintragen.
        </Text>
        <CopyValue label="Package name" value={target.packageName} />
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.body}>
        Die laufende Variante ließ sich nicht erkennen
        {target.packageName ? ` (gelesener Paketname: ${target.packageName})` : ''}.
        Trag nur die Werte der App ein, die auf diesem Handy installiert ist. Für einen unbekannten Paketnamen liegt hier kein SHA-1.
      </Text>
      <Text style={styles.subhead}>SrvEveryApp, Development</Text>
      <CopyValue label="Package name" value={dev.packageName || DEVELOPMENT_ANDROID_PACKAGE} />
      {dev.sha1 ? <CopyValue label="Package SHA1 fingerprint" value={dev.sha1} /> : null}
      <Text style={styles.subhead}>EveryApp, Production</Text>
      <CopyValue label="Package name" value={prod.packageName || PRODUCTION_ANDROID_PACKAGE} />
      <Text style={styles.body}>
        SHA-1 für EveryApp steht nicht im Repo. Vom Signaturzertifikat oder aus den EAS-Android-Credentials lesen, nicht den Debug-SHA-1 kopieren.
      </Text>
    </View>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepTitle}>{n}. {title}</Text>
      {children}
    </View>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <View style={styles.valueBox}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text selectable style={styles.valueText}>{value}</Text>
      <TouchableOpacity
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={`${label} kopieren`}
        style={styles.copyBtn}
      >
        <Text style={styles.copyBtnText}>{copied ? 'Kopiert' : 'Kopieren'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 16, borderTopRightRadius: 16, width: '100%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#111' },
  closeText: { fontSize: 15, fontWeight: '600', color: '#333', paddingVertical: 4, paddingHorizontal: 2 },
  content: { padding: 16, paddingBottom: 28 },
  lead: { fontSize: 14, lineHeight: 20, color: '#333', marginBottom: 8 },
  step: { marginTop: 14 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 4 },
  body: { fontSize: 14, lineHeight: 20, color: '#333' },
  subhead: { fontSize: 13, fontWeight: '700', color: '#111', marginTop: 10 },
  shotScroll: { marginTop: 10 },
  shot: { width: SHOT_WIDTH, height: SHOT_HEIGHT, backgroundColor: '#f3f3f3', borderRadius: 8 },
  caption: { fontSize: 12, lineHeight: 17, color: '#555', marginTop: 6 },
  valueBox: {
    marginTop: 8,
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    padding: 10,
  },
  valueLabel: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 4 },
  valueText: { fontSize: 13, lineHeight: 18, color: '#111', fontFamily: 'monospace' },
  copyBtn: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#1DB954', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  copyBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
});
