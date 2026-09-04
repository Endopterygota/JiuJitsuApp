import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Platform, Pressable, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { formatDue, intervalPreview, isDue, scheduleReview } from './src/scheduler';
import { CATEGORIES, TECHNIQUES } from './src/techniques';
import { ProgressMap, Rating, Technique } from './src/types';
import { TECHNIQUE_IMAGES } from './src/techniqueMedia';
import { TECHNIQUE_VIDEOS } from './src/techniqueVideos';

type Tab = 'learn' | 'library' | 'progress' | 'settings';
const STORAGE_PROGRESS = 'jiucards.progress.v1';
const STORAGE_FAVORITES = 'jiucards.favorites.v1';
const APP_VERSION = '1.3.0';
const LATEST_RELEASE_API = 'https://api.github.com/repos/Endopterygota/JiuJitsuApp/releases/latest';
const REPOSITORY_URL = 'https://github.com/Endopterygota/JiuJitsuApp';
const RATINGS: { id: Rating; label: string; color: string; icon: string }[] = [
  { id: 'again', label: 'Nochmal', color: '#C84F43', icon: '↺' },
  { id: 'hard', label: 'Schwer', color: '#C77A24', icon: '◆' },
  { id: 'good', label: 'Gut', color: '#27745F', icon: '✓' },
  { id: 'easy', label: 'Leicht', color: '#2867A4', icon: '⚡' },
];

function sameDay(a: number, b: number) {
  const x = new Date(a); const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export default function App() {
  const [tab, setTab] = useState<Tab>('learn');
  const [progress, setProgress] = useState<ProgressMap>({});
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeId, setActiveId] = useState(TECHNIQUES[0].id);
  const [revealed, setRevealed] = useState(false);
  const [selectedRating, setSelectedRating] = useState<Rating | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_PROGRESS, STORAGE_FAVORITES]).then((values) => {
      if (values[0][1]) setProgress(JSON.parse(values[0][1]));
      if (values[1][1]) setFavorites(JSON.parse(values[1][1]));
    }).catch(() => Alert.alert('Hinweis', 'Der gespeicherte Lernstand konnte nicht geladen werden.'))
      .finally(() => setHydrated(true));
  }, []);
  useEffect(() => { if (hydrated) AsyncStorage.setItem(STORAGE_PROGRESS, JSON.stringify(progress)); }, [progress, hydrated]);
  useEffect(() => { if (hydrated) AsyncStorage.setItem(STORAGE_FAVORITES, JSON.stringify(favorites)); }, [favorites, hydrated]);

  const technique = TECHNIQUES.find((item) => item.id === activeId) ?? TECHNIQUES[0];
  const dueCount = TECHNIQUES.filter((item) => isDue(progress[item.id])).length;
  const toggleFavorite = (id: string) => setFavorites((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const rate = (rating: Rating) => {
    setProgress((current) => ({ ...current, [technique.id]: scheduleReview(current[technique.id], rating) }));
    setSelectedRating(rating); setRevealed(true);
  };
  const next = () => {
    const item = TECHNIQUES.find((candidate) => candidate.id !== technique.id && isDue(progress[candidate.id]));
    setActiveId(item?.id ?? TECHNIQUES[0].id); setSelectedRating(null); setRevealed(false);
  };
  const learn = (item: Technique) => { setActiveId(item.id); setSelectedRating(null); setRevealed(false); setTab('learn'); };
  const reset = () => Alert.alert('Lernstand zurücksetzen?', 'Alle Bewertungen und Termine werden gelöscht. Favoriten bleiben erhalten.', [
    { text: 'Abbrechen', style: 'cancel' }, { text: 'Zurücksetzen', style: 'destructive', onPress: () => setProgress({}) },
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="light" />
      <View style={styles.app}>
        <Header dueCount={dueCount} />
        <View style={styles.screen}>
          {tab === 'learn' && <LearnScreen technique={technique} progress={progress} favorite={favorites.includes(technique.id)} revealed={revealed} selectedRating={selectedRating} onFavorite={() => toggleFavorite(technique.id)} onRate={rate} />}
          {tab === 'library' && <LibraryScreen progress={progress} favorites={favorites} onFavorite={toggleFavorite} onLearn={learn} />}
          {tab === 'progress' && <ProgressScreen progress={progress} favorites={favorites} onReset={reset} />}
          {tab === 'settings' && <SettingsScreen />}
        </View>
        {tab === 'learn' && <View style={styles.pinnedAction}><Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={next}><Text style={styles.primaryText}>Nächste Karte  →</Text></Pressable></View>}
        <BottomNav active={tab} onChange={setTab} />
      </View>
    </SafeAreaView>
  );
}

function Header({ dueCount }: { dueCount: number }) {
  return <View style={styles.header}><View><Text style={styles.brand}>JIU<Text style={styles.brandAccent}>CARDS</Text></Text><Text style={styles.tagline}>Technik im Kopf. Ruhe auf der Matte.</Text></View><View style={styles.dueBadge}><Text style={styles.dueNumber}>{dueCount}</Text><Text style={styles.dueLabel}>FÄLLIG</Text></View></View>;
}

type LearnProps = { technique: Technique; progress: ProgressMap; favorite: boolean; revealed: boolean; selectedRating: Rating | null; onFavorite: () => void; onRate: (x: Rating) => void };
function LearnScreen({ technique, progress, favorite, revealed, selectedRating, onFavorite, onRate }: LearnProps) {
  const card = progress[technique.id];
  return <ScrollView contentContainerStyle={styles.learnContent} showsVerticalScrollIndicator={false}>
    <View style={styles.sessionRow}><Text style={styles.eyebrow}>HEUTIGE WIEDERHOLUNG</Text><Text style={styles.sessionMeta}>{card ? `${card.reviewCount}× gelernt` : 'Neue Technik'}</Text></View>
    <View style={styles.flashcard}>
      <Pressable style={styles.favoriteButton} onPress={onFavorite} hitSlop={12}><Text style={[styles.favoriteIcon, favorite && styles.favoriteActive]}>{favorite ? '★' : '☆'}</Text></Pressable>
      <View style={styles.categoryPill}><Text style={styles.categoryText}>{technique.category} · {technique.position}</Text></View>
      <Text style={styles.germanName}>{technique.names.de}</Text><Text style={styles.englishName}>{technique.names.en}</Text>
      <View style={styles.divider} /><Text style={styles.japaneseName}>{technique.names.ja}</Text><Text style={styles.romaji}>{technique.names.romaji}</Text>
      {!revealed && <Text style={styles.recallHint}>Erinnere dich an Position, Ablauf und Schlüsselpunkte.</Text>}
    </View>
    {!revealed ? <View><Text style={styles.ratingPrompt}>Wie sicher erinnerst du dich?</Text><View style={styles.ratingRow}>{RATINGS.map((option) =>
      <Pressable key={option.id} style={({ pressed }) => [styles.ratingButton, { backgroundColor: option.color, borderColor: option.color }, pressed && styles.pressed]} onPress={() => onRate(option.id)}>
        <View style={styles.ratingTitleRow}><Text style={styles.ratingIcon}>{option.icon}</Text><Text style={styles.ratingLabel}>{option.label}</Text></View>
        <View style={styles.ratingIntervalPill}><Text style={styles.ratingInterval}>{intervalPreview(card, option.id)}</Text></View>
      </Pressable>)}</View></View> : <Details technique={technique} selectedRating={selectedRating} cardProgress={card} />}
  </ScrollView>;
}

function Details({ technique, selectedRating, cardProgress }: { technique: Technique; selectedRating: Rating | null; cardProgress: ProgressMap[string] | undefined }) {
  const rating = RATINGS.find((x) => x.id === selectedRating);
  const techniqueImage = TECHNIQUE_IMAGES[technique.id];
  const techniqueImages = techniqueImage ? (Array.isArray(techniqueImage) ? techniqueImage : [techniqueImage]) : [];
  const techniqueVideo = TECHNIQUE_VIDEOS[technique.id];
  return <View style={styles.details}>
    {rating && <View style={[styles.resultBanner, { borderLeftColor: rating.color }]}><Text style={styles.resultText}>Als „{rating.label}“ bewertet · nächste Abfrage {cardProgress ? formatDue(cardProgress.dueAt) : ''}</Text></View>}
    {techniqueVideo && <TechniqueVideo source={techniqueVideo} />}
    {techniqueImages.map((imageSource, index) => <View key={`${technique.id}-image-${index}`} style={styles.mediaCard}><Image source={imageSource} style={styles.techniqueImage} resizeMode="contain" /><View style={styles.mediaCaptionRow}><Text style={styles.mediaBadge}>LOKAL</Text><Text style={styles.mediaCaption}>{techniqueImages.length > 1 ? `Bild ${index + 1} von ${techniqueImages.length} · ` : ''}Im ursprünglichen Seitenverhältnis gespeichert</Text></View></View>)}
    <Info title="Was passiert?"><Text style={styles.bodyText}>{technique.summary}</Text></Info>
    <Info title="Ablauf">{technique.steps.map((step, index) => <View key={step} style={styles.stepRow}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>)}</Info>
    <Info title="Schlüsselpunkte"><View style={styles.chipWrap}>{technique.keyPoints.map((point) => <View key={point} style={styles.tipChip}><Text style={styles.tipText}>{point}</Text></View>)}</View></Info>
    <View style={styles.safetyBox}><Text style={styles.safetyTitle}>SICHER TRAINIEREN</Text><Text style={styles.safetyText}>{technique.safety}</Text></View>
    <Pressable style={styles.sourceButton} onPress={() => Linking.openURL(technique.sourceUrl)}><Text style={styles.sourceText}>Quelle öffnen: {technique.sourceTitle} ↗</Text></Pressable>
    <Text style={styles.license}>Zusammenfassung auf Basis der verlinkten Wikipedia-Seite. Wikipedia-Texte stehen unter CC BY-SA; Änderungen und Übersetzungen wurden vorgenommen.</Text>
  </View>;
}
function TechniqueVideo({ source }: { source: number }) {
  const player = useVideoPlayer(source, (videoPlayer) => { videoPlayer.loop = true; });
  return <View style={styles.mediaCard}>
    <VideoView style={styles.techniqueVideo} player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
    <View style={styles.mediaCaptionRow}><Text style={[styles.mediaBadge, styles.videoBadge]}>VIDEO</Text><Text style={styles.mediaCaption}>Technikvideo lokal und offline abspielbar</Text></View>
  </View>;
}
function Info({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.info}><Text style={styles.infoTitle}>{title}</Text>{children}</View>; }

function LibraryScreen({ progress, favorites, onFavorite, onLearn }: { progress: ProgressMap; favorites: string[]; onFavorite: (id: string) => void; onLearn: (t: Technique) => void }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('Alle'); const [favoritesOnly, setFavoritesOnly] = useState(false);
  const filtered = useMemo(() => TECHNIQUES.filter((item) => {
    const text = [item.names.de, item.names.en, item.names.ja, item.names.romaji, item.position].join(' ').toLocaleLowerCase('de');
    return (category === 'Alle' || item.category === category) && (!favoritesOnly || favorites.includes(item.id)) && text.includes(query.trim().toLocaleLowerCase('de'));
  }), [category, favorites, favoritesOnly, query]);
  return <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.pageTitle}>Technikbibliothek</Text><Text style={styles.pageSubtitle}>{TECHNIQUES.length} sorgfältig strukturierte Techniken</Text>
    <TextInput style={styles.search} value={query} onChangeText={setQuery} placeholder="Deutsch, Englisch oder Japanisch suchen …" placeholderTextColor="#7B8794" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{CATEGORIES.map((item) => <Pressable key={item} style={[styles.filterChip, category === item && styles.filterActive]} onPress={() => setCategory(item)}><Text style={[styles.filterText, category === item && styles.filterTextActive]}>{item}</Text></Pressable>)}<Pressable style={[styles.filterChip, favoritesOnly && styles.favoriteFilter]} onPress={() => setFavoritesOnly((x) => !x)}><Text style={[styles.filterText, favoritesOnly && styles.favoriteFilterText]}>★ Favoriten</Text></Pressable></ScrollView>
    <Text style={styles.resultCount}>{filtered.length} ERGEBNISSE</Text>
    {filtered.map((item) => <Pressable key={item.id} style={({ pressed }) => [styles.techniqueRow, pressed && styles.pressed]} onPress={() => onLearn(item)}>
      <View style={styles.monogram}><Text style={styles.monogramText}>{item.names.ja.slice(0, 1)}</Text></View><View style={styles.techniqueText}><Text style={styles.techniqueName}>{item.names.de}</Text><Text style={styles.translation}>{item.names.en} · {item.names.romaji}</Text><Text style={styles.techniqueMeta}>{item.category} / {item.subcategory} · {progress[item.id] ? `Fällig ${formatDue(progress[item.id].dueAt)}` : 'Neu'}</Text></View>
      <Pressable hitSlop={10} onPress={() => onFavorite(item.id)}><Text style={[styles.rowStar, favorites.includes(item.id) && styles.favoriteActive]}>{favorites.includes(item.id) ? '★' : '☆'}</Text></Pressable>
    </Pressable>)}
  </ScrollView>;
}

function ProgressScreen({ progress, favorites, onReset }: { progress: ProgressMap; favorites: string[]; onReset: () => void }) {
  const learned = Object.keys(progress).length; const mastered = Object.values(progress).filter((x) => x.intervalDays >= 21).length;
  const due = TECHNIQUES.filter((x) => isDue(progress[x.id])).length; const today = Object.values(progress).filter((x) => sameDay(x.lastReviewedAt, Date.now())).length;
  const percent = Math.round(learned / TECHNIQUES.length * 100); const upcoming = TECHNIQUES.filter((x) => progress[x.id]).sort((a, b) => progress[a.id].dueAt - progress[b.id].dueAt).slice(0, 5);
  return <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.pageTitle}>Dein Fortschritt</Text><Text style={styles.pageSubtitle}>Jede Wiederholung macht deine Reaktion klarer.</Text>
    <View style={styles.progressHero}><View style={styles.progressCircle}><Text style={styles.progressPercent}>{percent}%</Text><Text style={styles.circleLabel}>GESEHEN</Text></View><View style={styles.heroText}><Text style={styles.heroHeadline}>{learned} von {TECHNIQUES.length}</Text><Text style={styles.heroCaption}>Techniken begonnen</Text><View style={styles.progressBar}><View style={[styles.barFill, { width: `${percent}%` }]} /></View></View></View>
    <View style={styles.statsGrid}><Stat label="Heute gelernt" value={today} accent="#D88B35" /><Stat label="Jetzt fällig" value={due} accent="#CE5647" /><Stat label="Gefestigt" value={mastered} accent="#31806A" /><Stat label="Favoriten" value={favorites.length} accent="#2B6CB0" /></View>
    <Text style={styles.sectionLabel}>NÄCHSTE WIEDERHOLUNGEN</Text><View style={styles.upcomingCard}>{upcoming.length === 0 ? <Text style={styles.empty}>Bewerte deine erste Karte, damit hier dein Lernplan erscheint.</Text> : upcoming.map((item, i) => <View key={item.id} style={[styles.upcomingRow, i < upcoming.length - 1 && styles.upcomingBorder]}><View><Text style={styles.upcomingName}>{item.names.de}</Text><Text style={styles.upcomingEnglish}>{item.names.en}</Text></View><Text style={styles.upcomingDue}>{formatDue(progress[item.id].dueAt)}</Text></View>)}</View>
    <Pressable style={styles.resetButton} onPress={onReset}><Text style={styles.resetText}>Lernstand zurücksetzen</Text></Pressable>
  </ScrollView>;
}
function Stat({ label, value, accent }: { label: string; value: number; accent: string }) { return <View style={[styles.statCard, { borderTopColor: accent }]}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

type GitHubRelease = {
  tag_name: string;
  html_url: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};

function isNewerVersion(candidate: string, current: string) {
  const parts = (value: string) => value.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const next = parts(candidate); const installed = parts(current);
  for (let index = 0; index < Math.max(next.length, installed.length); index += 1) {
    if ((next[index] ?? 0) !== (installed[index] ?? 0)) return (next[index] ?? 0) > (installed[index] ?? 0);
  }
  return false;
}

function SettingsScreen() {
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'downloading' | 'installing'>('idle');
  const [updateMessage, setUpdateMessage] = useState('Prüft die neueste öffentliche GitHub-Release.');
  const busy = updateState !== 'idle';
  const buttonLabel = updateState === 'checking' ? 'Suche nach Update …' : updateState === 'downloading' ? 'APK wird heruntergeladen …' : updateState === 'installing' ? 'Installer wird geöffnet …' : 'Nach Update suchen';

  const updateApp = async () => {
    if (busy) return;
    try {
      setUpdateState('checking'); setUpdateMessage('GitHub wird geprüft …');
      const response = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error('GitHub konnte nicht erreicht werden.');
      const release = await response.json() as GitHubRelease;
      const apk = release.assets.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
      if (!apk) throw new Error('Die neueste Release enthält keine APK-Datei.');
      if (!isNewerVersion(release.tag_name, APP_VERSION)) {
        setUpdateMessage(`Version ${APP_VERSION} ist bereits aktuell.`);
        Alert.alert('JiuCards ist aktuell', `Installiert: ${APP_VERSION}\nNeueste Release: ${release.tag_name}`);
        return;
      }
      if (Platform.OS !== 'android') {
        await Linking.openURL(release.html_url);
        setUpdateMessage(`Release ${release.tag_name} wurde im Browser geöffnet.`);
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('Der Download-Ordner ist auf diesem Gerät nicht verfügbar.');
      setUpdateState('downloading');
      setUpdateMessage(`${release.tag_name} wird heruntergeladen (${Math.max(1, Math.round(apk.size / 1024 / 1024))} MB) …`);
      const target = `${FileSystem.cacheDirectory}JiuCards-${release.tag_name.replace(/[^a-z0-9._-]/gi, '-')}.apk`;
      const download = await FileSystem.downloadAsync(apk.browser_download_url, target);
      if (download.status < 200 || download.status >= 300) throw new Error(`Download fehlgeschlagen (Status ${download.status}).`);
      setUpdateState('installing'); setUpdateMessage('Der Android-Installer wird geöffnet …');
      const contentUri = await FileSystem.getContentUriAsync(download.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
      setUpdateMessage(`Update ${release.tag_name} wurde an den Installer übergeben.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Das Update konnte nicht geladen werden.';
      setUpdateMessage(message);
      Alert.alert('Update nicht möglich', message);
    } finally {
      setUpdateState('idle');
    }
  };

  return <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
    <Text style={styles.pageTitle}>Einstellungen</Text><Text style={styles.pageSubtitle}>App-Version und Updates verwalten.</Text>
    <View style={styles.settingsHero}><View style={styles.settingsIcon}><Text style={styles.settingsIconText}>⚙</Text></View><View><Text style={styles.settingsAppName}>JiuCards</Text><Text style={styles.settingsVersion}>Installierte Version {APP_VERSION}</Text></View></View>
    <View style={styles.settingsCard}>
      <Text style={styles.settingsCardTitle}>APP-UPDATES</Text>
      <Text style={styles.settingsBody}>Lädt die APK der neuesten öffentlichen GitHub-Release herunter und öffnet anschließend den Android-Systeminstaller.</Text>
      <Pressable disabled={busy} style={({ pressed }) => [styles.updateButton, busy && styles.updateButtonDisabled, pressed && !busy && styles.pressed]} onPress={updateApp}><Text style={styles.updateButtonText}>{buttonLabel}</Text></Pressable>
      <Text style={styles.updateStatus}>{updateMessage}</Text>
    </View>
    <View style={styles.settingsNotice}><Text style={styles.settingsNoticeTitle}>ANDROID-HINWEIS</Text><Text style={styles.settingsNoticeText}>Beim ersten Update kann Android um Erlaubnis für „Apps aus dieser Quelle installieren“ bitten. Die Installation bleibt immer unter deiner Kontrolle.</Text></View>
    <Pressable style={styles.repositoryButton} onPress={() => Linking.openURL(REPOSITORY_URL)}><Text style={styles.repositoryText}>GitHub-Projekt öffnen  ↗</Text></Pressable>
  </ScrollView>;
}

function BottomNav({ active, onChange }: { active: Tab; onChange: (x: Tab) => void }) {
  const items: { id: Tab; icon: string; label: string }[] = [{ id: 'learn', icon: '◈', label: 'Lernen' }, { id: 'library', icon: '▤', label: 'Techniken' }, { id: 'progress', icon: '↗', label: 'Fortschritt' }, { id: 'settings', icon: '⚙', label: 'Einstellungen' }];
  return <View style={styles.bottomNav}>{items.map((item) => <Pressable key={item.id} style={styles.navItem} onPress={() => onChange(item.id)}><Text style={[styles.navIcon, active === item.id && styles.navActive]}>{item.icon}</Text><Text style={[styles.navLabel, active === item.id && styles.navActive]}>{item.label}</Text>{active === item.id && <View style={styles.navIndicator} />}</Pressable>)}</View>;
}

const C = { ink: '#17212B', muted: '#65717D', paper: '#F5F1E9', white: '#FFFEFB', line: '#DED8CC', orange: '#E47C3C', green: '#214C42' };
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.ink, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }, app: { flex: 1, backgroundColor: C.paper }, screen: { flex: 1 },
  header: { minHeight: 90, backgroundColor: C.ink, paddingHorizontal: 22, paddingVertical: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: C.white, fontSize: 22, fontWeight: '900', letterSpacing: 1.2 }, brandAccent: { color: C.orange }, tagline: { color: '#AAB2B8', fontSize: 11, marginTop: 3 }, dueBadge: { width: 58, height: 58, borderWidth: 1, borderColor: '#49525B', borderRadius: 29, alignItems: 'center', justifyContent: 'center' }, dueNumber: { color: C.white, fontSize: 20, fontWeight: '800', lineHeight: 22 }, dueLabel: { color: C.orange, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  learnContent: { padding: 18, paddingBottom: 38 }, sessionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }, eyebrow: { color: C.green, fontSize: 10, letterSpacing: 1.5, fontWeight: '900' }, sessionMeta: { color: C.muted, fontSize: 11 },
  flashcard: { minHeight: 320, backgroundColor: C.white, borderRadius: 22, paddingHorizontal: 24, paddingVertical: 30, alignItems: 'center', justifyContent: 'center', shadowColor: C.ink, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14, elevation: 4, borderWidth: 1, borderColor: '#ECE7DE' }, favoriteButton: { position: 'absolute', right: 17, top: 13, padding: 6 }, favoriteIcon: { fontSize: 27, color: '#A7A097' }, favoriteActive: { color: C.orange },
  categoryPill: { backgroundColor: '#E7EEE9', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 20 }, categoryText: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' }, germanName: { color: C.ink, fontSize: 29, lineHeight: 34, textAlign: 'center', fontWeight: '800' }, englishName: { color: C.orange, fontSize: 18, fontWeight: '600', marginTop: 5 }, divider: { width: 34, height: 2, backgroundColor: C.line, marginVertical: 20 }, japaneseName: { color: C.ink, fontSize: 29, fontWeight: '500' }, romaji: { color: C.muted, fontSize: 14, fontStyle: 'italic', marginTop: 5 }, recallHint: { color: '#7B746C', fontSize: 11, textAlign: 'center', marginTop: 22 },
  ratingPrompt: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 20, marginBottom: 10 }, ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, ratingButton: { flexBasis: '47%', flexGrow: 1, minHeight: 82, borderWidth: 1, borderRadius: 15, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, shadowColor: C.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.13, shadowRadius: 6, elevation: 3 }, ratingTitleRow: { flexDirection: 'row', alignItems: 'center' }, ratingIcon: { color: C.white, fontSize: 18, fontWeight: '900', marginRight: 8 }, ratingLabel: { color: C.white, fontSize: 14, fontWeight: '900' }, ratingIntervalPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }, ratingInterval: { color: C.white, fontSize: 10, fontWeight: '700' }, pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  details: { marginTop: 18 }, mediaCard: { backgroundColor: C.white, borderRadius: 15, marginBottom: 11, overflow: 'hidden', borderWidth: 1, borderColor: '#E8E2D8' }, techniqueImage: { width: '100%', height: 260, backgroundColor: '#F0ECE4' }, techniqueVideo: { width: '100%', height: 230, backgroundColor: '#111820' }, mediaCaptionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10 }, mediaBadge: { color: C.white, backgroundColor: C.green, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, overflow: 'hidden' }, videoBadge: { backgroundColor: C.orange }, mediaCaption: { flex: 1, color: C.muted, fontSize: 10, marginLeft: 9 }, resultBanner: { backgroundColor: C.white, borderRadius: 10, borderLeftWidth: 4, padding: 13, marginBottom: 13 }, resultText: { color: C.ink, fontSize: 12, fontWeight: '600' }, info: { backgroundColor: C.white, borderRadius: 15, padding: 17, marginBottom: 11, borderWidth: 1, borderColor: '#E8E2D8' }, infoTitle: { color: C.green, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }, bodyText: { color: '#34404B', fontSize: 14, lineHeight: 21 }, stepRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }, stepNumber: { width: 23, height: 23, backgroundColor: C.ink, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, stepNumberText: { color: C.white, fontSize: 11, fontWeight: '800' }, stepText: { flex: 1, color: '#34404B', fontSize: 13, lineHeight: 20 }, chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, tipChip: { backgroundColor: '#EEF1ED', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }, tipText: { color: C.green, fontSize: 11, fontWeight: '600' },
  safetyBox: { backgroundColor: '#FFF0E6', borderRadius: 15, padding: 16, marginBottom: 11 }, safetyTitle: { color: '#AD5424', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 6 }, safetyText: { color: '#68432F', fontSize: 13, lineHeight: 19 }, sourceButton: { borderWidth: 1, borderColor: '#B8B2A8', borderRadius: 11, padding: 13, alignItems: 'center' }, sourceText: { color: C.ink, fontSize: 12, fontWeight: '700' }, license: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 8, paddingHorizontal: 4 }, pinnedAction: { backgroundColor: C.paper, borderTopWidth: 1, borderTopColor: '#D9D2C6', paddingHorizontal: 18, paddingTop: 10, paddingBottom: 9, shadowColor: C.ink, shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 6 }, primaryButton: { backgroundColor: C.ink, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: C.ink, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 3 }, primaryText: { color: C.white, fontSize: 14, fontWeight: '800' },
  pageContent: { padding: 18, paddingBottom: 38 }, pageTitle: { color: C.ink, fontSize: 27, fontWeight: '900' }, pageSubtitle: { color: C.muted, fontSize: 13, marginTop: 4, marginBottom: 18 }, search: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 13, paddingHorizontal: 15, paddingVertical: 13, fontSize: 13, color: C.ink }, filterRow: { gap: 7, paddingVertical: 12 }, filterChip: { borderRadius: 99, borderWidth: 1, borderColor: '#CFC8BC', paddingHorizontal: 13, paddingVertical: 8, backgroundColor: C.white }, filterActive: { backgroundColor: C.green, borderColor: C.green }, filterText: { color: C.muted, fontSize: 11, fontWeight: '700' }, filterTextActive: { color: C.white }, favoriteFilter: { backgroundColor: '#FFF0E6', borderColor: C.orange }, favoriteFilterText: { color: '#AD5424' }, resultCount: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginBottom: 7 },
  techniqueRow: { backgroundColor: C.white, borderRadius: 14, marginBottom: 9, padding: 13, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E8E2D8' }, monogram: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#E7EEE9', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, monogramText: { color: C.green, fontSize: 20, fontWeight: '700' }, techniqueText: { flex: 1, paddingRight: 5 }, techniqueName: { color: C.ink, fontSize: 15, fontWeight: '800' }, translation: { color: C.muted, fontSize: 11, marginTop: 2 }, techniqueMeta: { color: '#98836D', fontSize: 9, fontWeight: '700', marginTop: 5, textTransform: 'uppercase' }, rowStar: { color: '#A7A097', fontSize: 23, padding: 4 },
  progressHero: { backgroundColor: C.green, borderRadius: 20, padding: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, progressCircle: { width: 89, height: 89, borderRadius: 45, borderWidth: 7, borderColor: C.orange, alignItems: 'center', justifyContent: 'center' }, progressPercent: { color: C.white, fontSize: 23, fontWeight: '900' }, circleLabel: { color: '#B8CBC5', fontSize: 8, fontWeight: '800', letterSpacing: 1 }, heroText: { flex: 1, marginLeft: 19 }, heroHeadline: { color: C.white, fontSize: 22, fontWeight: '900' }, heroCaption: { color: '#B8CBC5', fontSize: 11, marginTop: 2 }, progressBar: { height: 6, backgroundColor: '#416B60', borderRadius: 3, marginTop: 13, overflow: 'hidden' }, barFill: { height: 6, backgroundColor: C.orange, borderRadius: 3 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 20 }, statCard: { width: '48.5%', backgroundColor: C.white, borderRadius: 13, borderTopWidth: 3, padding: 14 }, statValue: { color: C.ink, fontSize: 24, fontWeight: '900' }, statLabel: { color: C.muted, fontSize: 11, marginTop: 2 }, sectionLabel: { color: C.green, fontSize: 10, letterSpacing: 1.4, fontWeight: '900', marginBottom: 8 }, upcomingCard: { backgroundColor: C.white, borderRadius: 15, paddingHorizontal: 15, marginBottom: 16 }, upcomingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13 }, upcomingBorder: { borderBottomWidth: 1, borderBottomColor: '#ECE7DE' }, upcomingName: { color: C.ink, fontSize: 13, fontWeight: '800' }, upcomingEnglish: { color: C.muted, fontSize: 10, marginTop: 2 }, upcomingDue: { color: C.orange, fontSize: 11, fontWeight: '800' }, empty: { color: C.muted, fontSize: 12, lineHeight: 18, paddingVertical: 18, textAlign: 'center' }, resetButton: { alignSelf: 'center', padding: 10 }, resetText: { color: '#A44A3D', fontSize: 11, textDecorationLine: 'underline' },
  settingsHero: { backgroundColor: C.green, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }, settingsIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#416B60', alignItems: 'center', justifyContent: 'center', marginRight: 14 }, settingsIconText: { color: C.white, fontSize: 27 }, settingsAppName: { color: C.white, fontSize: 20, fontWeight: '900' }, settingsVersion: { color: '#B8CBC5', fontSize: 11, marginTop: 3 }, settingsCard: { backgroundColor: C.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#E8E2D8', marginBottom: 12 }, settingsCardTitle: { color: C.green, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, marginBottom: 9 }, settingsBody: { color: '#34404B', fontSize: 13, lineHeight: 20 }, updateButton: { backgroundColor: C.ink, borderRadius: 13, paddingVertical: 15, alignItems: 'center', marginTop: 16 }, updateButtonDisabled: { backgroundColor: '#68727B' }, updateButtonText: { color: C.white, fontSize: 13, fontWeight: '900' }, updateStatus: { color: C.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 9 }, settingsNotice: { backgroundColor: '#FFF0E6', borderRadius: 15, padding: 16, marginBottom: 12 }, settingsNoticeTitle: { color: '#AD5424', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 6 }, settingsNoticeText: { color: '#68432F', fontSize: 12, lineHeight: 18 }, repositoryButton: { borderWidth: 1, borderColor: '#B8B2A8', borderRadius: 12, padding: 14, alignItems: 'center', backgroundColor: C.white }, repositoryText: { color: C.ink, fontSize: 12, fontWeight: '800' },
  bottomNav: { height: 70, backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, flexDirection: 'row' }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }, navIcon: { color: '#89919A', fontSize: 20, lineHeight: 22 }, navLabel: { color: '#89919A', fontSize: 9, fontWeight: '700', marginTop: 3 }, navActive: { color: C.green }, navIndicator: { position: 'absolute', top: 0, width: 34, height: 3, backgroundColor: C.orange },
});
