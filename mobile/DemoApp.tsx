import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {StatusBar} from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import {manipulateAsync, SaveFormat} from 'expo-image-manipulator';
import type {CommonInterest, DemoEvidence, DemoInterest, DemoProfile, DemoPlan as GroupPlan} from '../shared/demo-types';
import {chooseAvatar} from './avatar-web';
import {chooseProfileDocument, demoRequest, getDemoState, runDemoJob, type DemoImport, type DemoState, type Job, type Optimization, type Playlist, type SavedDemoGroup} from './demo-api';

type Tab = '친구' | '그룹' | '마이';
type Page = 'friends' | 'common' | 'common-detail' | 'groups' | 'participants' | 'conditions' | 'group-result' | 'table-detail' | 'my' | 'profile-edit' | 'youtube' | 'linkedin' | 'my-interests' | 'my-interest-detail' | 'analysis';
type AnalysisKind = 'profile' | 'common' | 'groups';
const ink = '#18181B';
const muted = '#71717A';
const line = '#E9E9EC';
const surface = '#F6F6F7';

function Icon({name, size = 20, color = ink}: {name: React.ComponentProps<typeof Ionicons>['name']; size?: number; color?: string}) {
  return <Ionicons name={name} size={size} color={color}/>;
}
function Button({children, onPress, secondary, disabled, compact}: {children: React.ReactNode; onPress: () => void; secondary?: boolean; disabled?: boolean; compact?: boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed}) => [s.button, secondary && s.buttonSecondary, compact && s.buttonCompact, disabled && s.disabled, pressed && !disabled && {opacity: .8}]}><Text style={[s.buttonText, secondary && {color: ink}]}>{children}</Text></Pressable>;
}
function Avatar({profile, size = 46}: {profile: DemoProfile; size?: number}) {
  return profile.avatar
    ? <Image accessibilityLabel={`${profile.name} 프로필 사진`} source={{uri: profile.avatar}} resizeMode="cover" style={{width: size, height: size, borderRadius: size / 2, backgroundColor: surface}}/>
    : <View style={[s.avatar, {width: size, height: size, borderRadius: size / 2}]}><Text style={{fontSize: size * .35, color: ink, fontWeight: '600'}}>{profile.name.slice(0, 1)}</Text></View>;
}
function Tag({children}: {children: React.ReactNode}) {return <View style={s.tag}><Text style={s.tagText}>{children}</Text></View>;}
function Card({children, quiet}: {children: React.ReactNode; quiet?: boolean}) {return <View style={[s.card, quiet && s.quietCard]}>{children}</View>;}
function Heading({eyebrow, title, description}: {eyebrow: string; title: string; description?: string}) {
  return <View style={s.heading}><Text style={s.eyebrow}>{eyebrow}</Text><Text style={s.title}>{title}</Text>{description && <Text style={s.description}>{description}</Text>}</View>;
}
function Section({title, children, action, onAction}: {title: string; children: React.ReactNode; action?: string; onAction?: () => void}) {
  return <View style={s.section}><View style={s.between}><Text style={s.sectionTitle}>{title}</Text>{action && <Pressable accessibilityRole="button" onPress={onAction} style={s.textAction}><Text style={s.link}>{action}</Text><Icon name="chevron-forward" size={14}/></Pressable>}</View>{children}</View>;
}
function Empty({icon = 'sparkles-outline', title, text}: {icon?: React.ComponentProps<typeof Ionicons>['name']; title: string; text: string}) {
  return <View style={s.empty}><View style={s.emptyIcon}><Icon name={icon} size={28}/></View><Text style={s.emptyTitle}>{title}</Text><Text style={[s.description, {textAlign: 'center'}]}>{text}</Text></View>;
}
function Metric({label, value, suffix}: {label: string; value: number | string; suffix?: string}) {
  return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}<Text style={s.metricSuffix}>{suffix || ''}</Text></Text></View>;
}
function Score({value, large}: {value: number; large?: boolean}) {return <Text style={[s.score, large && s.scoreLarge]}>{Math.round(value)}<Text style={s.scoreUnit}> 점</Text></Text>;}
function TopicRow({topic, index, onPress}: {topic: {id: string; label: string; category?: string; score: number}; index: number; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}위 ${topic.label} ${Math.round(topic.score)}점 상세 보기`} onPress={onPress} style={({pressed}) => [s.topicRow, pressed && {backgroundColor: surface}]}><Text style={s.rank}>{String(index + 1).padStart(2, '0')}</Text><View style={s.flex}><Text style={s.topicTitle}>{topic.label}</Text><Text style={s.small}>{topic.category || '관심사'} · 근거 보기</Text></View><Score value={topic.score}/><Icon name="chevron-forward" color={muted} size={17}/></Pressable>;
}
function QualityRow({label, score}: {label: string; score: number}) {
  return <View style={s.qualityRow}><Text style={s.body}>{label}</Text><View style={s.qualityTrack}><View style={[s.qualityBar, {width: `${Math.max(0, Math.min(100, score))}%`}]}/></View><Text style={s.qualityValue}>{Math.round(score)}</Text></View>;
}
function SourceList({sources, example}: {sources: DemoEvidence[]; example?: boolean}) {
  return <View style={{gap: 12}}>{sources.map((source, index) => <View key={source.id || String(index)} style={s.evidenceItem}><View style={s.between}><Text style={s.source}>{example ? '예시 데이터 · ' : ''}{source.source === 'youtube' ? 'YouTube' : source.source === 'linkedin' ? 'LinkedIn' : source.source === 'manual' ? '직접 등록한 관심사' : 'Demo'}</Text>{source.url && <Pressable accessibilityRole="link" accessibilityLabel={`${source.title} 원본 열기`} onPress={() => Linking.openURL(source.url!)}><Icon name="open-outline" color={muted} size={15}/></Pressable>}</View><Text style={s.evidenceTitle}>{source.title}</Text>{source.text && source.text !== source.title && <Text style={s.evidenceText}>{source.text}</Text>}</View>)}</View>;
}
function abbreviate(people: DemoProfile[]) {return people.slice(0, 3).map(p => p.name).join(' · ') + (people.length > 3 ? ` 외 ${people.length - 3}명` : '');}
function balanceLabel(score: number) {return score >= 90 ? '매우 좋음' : score >= 75 ? '좋음' : score >= 55 ? '보통' : '차이 있음';}
function countTables(count: number, size: number) {
  const tables = Math.ceil(count / size);
  return {tables, feasible: count >= 3 && tables * 3 <= count};
}

export default function DemoApp() {return <SafeAreaProvider><DemoMain/></SafeAreaProvider>;}

function DemoMain() {
  const [data, setData] = useState<DemoState | null>(null);
  const [tab, setTab] = useState<Tab>('친구');
  const [page, setPage] = useState<Page>('friends');
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [commonPeople, setCommonPeople] = useState<DemoProfile[]>([]);
  const [common, setCommon] = useState<CommonInterest[]>([]);
  const [topic, setTopic] = useState<CommonInterest | null>(null);
  const [ownTopic, setOwnTopic] = useState<DemoInterest | null>(null);
  const [groupName, setGroupName] = useState('');
  const [tableSize, setTableSize] = useState(4);
  const [optimization, setOptimization] = useState<Optimization | null>(null);
  const [planIndex, setPlanIndex] = useState(0);
  const [groupPeople, setGroupPeople] = useState<DemoProfile[]>([]);
  const [selectedTable, setSelectedTable] = useState<GroupPlan['groups'][number] | null>(null);
  const [tableTopic, setTableTopic] = useState<CommonInterest | null>(null);
  const [viewingSaved, setViewingSaved] = useState<SavedDemoGroup | null>(null);
  const [analysisKind, setAnalysisKind] = useState<AnalysisKind>('profile');
  const [job, setJob] = useState<Job | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistIds, setPlaylistIds] = useState<string[]>([]);
  const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
  const [subscriptions, setSubscriptions] = useState(false);
  const [linkedinText, setLinkedinText] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileAvatar, setProfileAvatar] = useState('');
  const [documentName, setDocumentName] = useState('');
  const jobAbort = useRef<AbortController | null>(null);
  const lifecycle = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView | null>(null);
  const mounted = useRef(true);

  const people = useMemo(() => {
    if (!data) return [];
    const all = [data.me, ...data.people];
    return all.filter((p, i) => all.findIndex(x => x.id === p.id) === i);
  }, [data]);
  const eligiblePeople = people.filter(p => p.interests.length > 0);
  const selectedFriends = people.filter(p => friendIds.includes(p.id));
  const selectedParticipants = people.filter(p => participantIds.includes(p.id));
  const activePlan = optimization?.plans[planIndex];
  const expected = countTables(participantIds.length, tableSize);
  const importedCount = Number(data?.imports.youtube?.summary?.videos || 0) + Number(data?.imports.linkedin?.summary?.records || 0);
  const hasImportedData = importedCount > 0 || !!data?.imports.linkedin?.samples?.length || !!data?.imports.youtube?.samples?.length;

  async function load(signal?: AbortSignal) {
    const next = await getDemoState(signal);
    if (!mounted.current || signal?.aborted) return next;
    setData(next);
    return next;
  }
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    lifecycle.current = controller;
    load(controller.signal).catch(e => {if (!controller.signal.aborted) setError(e.message || '서버에 연결하지 못했어요.');}).finally(() => {if (!controller.signal.aborted) setBooting(false);});
    if (Platform.OS === 'web') {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('oauth_error');
      if (oauthError) {setError(oauthError); setTab('마이'); setPage('my');}
      if (params.has('oauth')) {setNotice('계정을 연결했어요. 데이터를 불러와 관심사를 분석해보세요.'); setTab('마이'); setPage(params.get('provider') === 'linkedin' ? 'linkedin' : 'youtube');}
      if (oauthError || params.has('oauth')) window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      const onFocus = () => load(controller.signal).catch(() => {});
      window.addEventListener('focus', onFocus);
      return () => {mounted.current = false; controller.abort(); jobAbort.current?.abort(); window.removeEventListener('focus', onFocus);};
    }
    return () => {mounted.current = false; controller.abort(); jobAbort.current?.abort();};
  }, []);
  useEffect(() => {scroll.current?.scrollTo({y: 0, animated: false});}, [page]);
  useEffect(() => {if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer);}, [notice]);

  function navigate(next: Page, nextTab?: Tab) {
    if (page === 'analysis') jobAbort.current?.abort();
    if (nextTab) setTab(nextTab);
    setPage(next);
    setError('');
  }
  function switchTab(next: Tab) {setSearch(''); navigate(next === '친구' ? 'friends' : next === '그룹' ? 'groups' : 'my', next);}
  function beginGroup() {
    jobAbort.current?.abort();
    setSearch(''); setParticipantIds([]); setGroupName(''); setTableSize(4); setViewingSaved(null); setOptimization(null);
    navigate('participants', '그룹');
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try {await action();} catch (e) {if (mounted.current) setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요.');}
    finally {if (mounted.current) setBusy(false);}
  }
  function toggle(id: string, mode: 'friends' | 'participants') {
    if (mode === 'participants' && !participantIds.includes(id) && participantIds.length >= 24) {setError('Demo에서는 최대 24명까지 한 번에 편성할 수 있어요.'); return;}
    const update = (ids: string[]) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    if (mode === 'friends') setFriendIds(update); else setParticipantIds(update);
  }
  async function analyze(kind: AnalysisKind) {
    const controller = new AbortController();
    jobAbort.current?.abort(); jobAbort.current = controller;
    setAnalysisKind(kind); setJob(null); setError(''); setPage('analysis');
    if (kind === 'common') {setCommonPeople(selectedFriends); setCommon([]);}
    if (kind === 'groups') {setGroupPeople(selectedParticipants); setViewingSaved(null); setOptimization(null);}
    try {
      const finished = await runDemoJob({kind, ...(kind === 'common' ? {profileIds: [...friendIds]} : kind === 'groups' ? {profileIds: [...participantIds], tableSize} : {})}, controller.signal, next => {if (!controller.signal.aborted && mounted.current) setJob(next);});
      if (controller.signal.aborted || !mounted.current) return;
      if (kind === 'profile') {await load(controller.signal); if (!controller.signal.aborted) setPage('my-interests');}
      else if (kind === 'common') {setCommon((finished.result as {interests: CommonInterest[]})?.interests || []); setPage('common');}
      else {
        const result = finished.result as Optimization;
        if (!result?.plans?.length) throw new Error('조건에 맞는 편성을 찾지 못했어요. 참가자 또는 테이블당 인원을 바꿔주세요.');
        setOptimization(result); setPlanIndex(0); setPage('group-result');
      }
    } catch (e) {
      if (controller.signal.aborted || !mounted.current) return;
      setError(e instanceof Error ? e.message : '분석 중 문제가 발생했어요.');
      setPage(kind === 'profile' ? 'my' : kind === 'common' ? 'friends' : 'conditions');
    }
  }
  async function oauth(provider: 'youtube' | 'linkedin') {
    await run(async () => {
      const result = await demoRequest<{url: string}>('/oauth/start', {provider}, lifecycle.current?.signal);
      if (Platform.OS === 'web') window.location.assign(result.url);
      else await Linking.openURL(result.url);
    });
  }
  async function fetchPlaylists() {
    await run(async () => {
      const result = await demoRequest<{playlists: Playlist[]; truncated?: boolean}>('/youtube/playlists', undefined, lifecycle.current?.signal);
      if (!mounted.current) return;
      setPlaylists(result.playlists); setPlaylistIds(result.playlists.map(p => p.id)); setPlaylistsLoaded(true);
      if (result.truncated) setNotice('재생목록 조회 한도까지 불러왔어요. 표시된 목록에서 선택해주세요.');
    });
  }
  async function importYoutube() {
    await run(async () => {
      await demoRequest('/import/youtube', {playlistIds, includeSubscriptions: subscriptions}, lifecycle.current?.signal);
      await load(lifecycle.current?.signal);
      setNotice('실제 YouTube 데이터를 불러왔어요. 관심사 분석을 실행해주세요.');
    });
  }
  async function importLinkedin(upload?: {fileBase64: string; fileName: string}) {
    await run(async () => {
      await demoRequest('/import/linkedin', upload || {text: linkedinText}, lifecycle.current?.signal);
      await load(lifecycle.current?.signal);
      if (upload) setDocumentName(upload.fileName);
      setNotice('프로필 데이터를 등록했어요. 관심사 분석을 실행해주세요.');
    });
  }
  async function uploadLinkedin() {
    if (Platform.OS !== 'web') {setError('현재 파일 업로드는 웹에서 사용할 수 있어요. 아래에 프로필 텍스트를 붙여넣어주세요.'); return;}
    try {const selected = await chooseProfileDocument(); if (selected) await importLinkedin(selected);} catch (e) {setError(e instanceof Error ? e.message : '파일을 열지 못했어요.');}
  }
  async function editAvatar() {
    await run(async () => {
      if (Platform.OS === 'web') {const avatar = await chooseAvatar(); if (avatar) setProfileAvatar(avatar); return;}
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('사진 접근 권한이 필요해요.');
      const result = await ImagePicker.launchImageLibraryAsync({mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: .8});
      if (result.canceled) return;
      const photo = await manipulateAsync(result.assets[0].uri, [{resize: {width: 256, height: 256}}], {compress: .75, format: SaveFormat.JPEG, base64: true});
      if (photo.base64) setProfileAvatar(`data:image/jpeg;base64,${photo.base64}`);
    });
  }
  async function saveProfile() {
    await run(async () => {await demoRequest('/profile', {name: profileName.trim(), avatar: profileAvatar}, lifecycle.current?.signal); await load(lifecycle.current?.signal); navigate('my'); setNotice('프로필을 저장했어요.');});
  }
  async function confirmPlan() {
    if (!activePlan) return;
    await run(async () => {
      await demoRequest('/groups', {name: groupName.trim() || '새로운 모임', plan: activePlan}, lifecycle.current?.signal);
      await load(lifecycle.current?.signal); navigate('groups'); setNotice('편성을 확정했어요. 그룹에서 다시 확인할 수 있어요.');
    });
  }
  function openSaved(saved: SavedDemoGroup) {
    setViewingSaved(saved); setGroupName(saved.name); setOptimization({plans: [saved.plan], solver: {engine: 'OR-Tools CP-SAT', status: 'saved', optimal: false, candidateCount: 0, elapsedMs: 0, plansFound: 1, candidateEnumeration: 'saved'}}); setPlanIndex(0);
    setGroupPeople(saved.people || people); navigate('group-result', '그룹');
  }
  function showCommonDetail(item: CommonInterest) {setTopic(item); navigate('common-detail');}
  function openTable(table: GroupPlan['groups'][number]) {setSelectedTable(table); setTableTopic(null); navigate('table-detail');}
  function back() {
    const parent: Partial<Record<Page, Page>> = {'common': 'friends', 'common-detail': 'common', 'participants': 'groups', 'conditions': 'participants', 'group-result': viewingSaved ? 'groups' : 'conditions', 'table-detail': 'group-result', 'profile-edit': 'my', 'youtube': 'my', 'linkedin': 'my', 'my-interests': 'my', 'my-interest-detail': 'my-interests'};
    if (page === 'analysis') {jobAbort.current?.abort(); navigate(analysisKind === 'profile' ? 'my' : analysisKind === 'common' ? 'friends' : 'conditions');}
    else navigate(parent[page] || 'friends');
  }
  const homePage = page === 'friends' || page === 'groups' || page === 'my';

  function personCards(mode: 'friends' | 'participants') {
    const ids = mode === 'friends' ? friendIds : participantIds;
    const visible = people.filter(p => p.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    return <View style={{gap: 2}}>{visible.length === 0 && <Empty icon="search-outline" title="검색 결과가 없어요" text="다른 이름으로 검색해보세요."/>}{visible.map(profile => {
      const selected = ids.includes(profile.id);
      const ready = profile.interests.length > 0;
      return <Pressable key={profile.id} accessibilityRole="checkbox" accessibilityState={{checked: selected, disabled: !ready}} disabled={!ready} accessibilityLabel={`${profile.name}${profile.isDemo ? ' 예시 사용자' : ' 나'} 선택`} onPress={() => toggle(profile.id, mode)} style={({pressed}) => [s.personCard, selected && s.personCardSelected, !ready && {opacity: .6}, pressed && ready && {backgroundColor: surface}]}><Avatar profile={profile}/><View style={s.flex}><View style={[s.row, {gap: 6}]}><Text style={s.personName}>{profile.name}</Text><Text style={s.personMarker}>{profile.isDemo ? '예시' : '나'}</Text></View><Text style={s.personInterests} numberOfLines={1}>{ready ? profile.interests.slice(0, 3).map(i => i.label).join(' · ') : '마이에서 데이터를 연결하고 분석해주세요'}</Text></View><View style={[s.check, selected && s.checkSelected]}>{selected && <Icon name="checkmark" size={15} color="white"/>}</View></Pressable>;
    })}</View>;
  }
  function selectionBar(mode: 'friends' | 'participants') {
    const selected = mode === 'friends' ? selectedFriends : selectedParticipants;
    return <View style={s.selectionBar}><View style={s.between}><Text style={s.label}>{selected.length}명 선택됨</Text>{selected.length > 0 && <Pressable accessibilityRole="button" onPress={() => mode === 'friends' ? setFriendIds([]) : setParticipantIds([])}><Text style={s.link}>선택 해제</Text></Pressable>}</View><Text style={s.small} numberOfLines={1}>{selected.length ? abbreviate(selected) : mode === 'friends' ? '함께 대화할 사람을 2명 이상 선택해주세요.' : '관심사가 있는 참가자를 3명 이상 선택해주세요.'}</Text><Button disabled={mode === 'friends' ? selected.length < 2 : selected.length < 3} onPress={() => mode === 'friends' ? analyze('common') : navigate('conditions')}>{mode === 'friends' ? '공통 관심사 보기' : '다음'}</Button></View>;
  }
  function searchField() {return <View style={s.search}><Icon name="search-outline" size={19} color={muted}/><TextInput accessibilityLabel="이름 검색" value={search} onChangeText={setSearch} placeholder="이름으로 검색" placeholderTextColor="#929299" style={s.searchInput}/>{search && <Pressable accessibilityLabel="검색어 지우기" onPress={() => setSearch('')}><Icon name="close-circle" size={18} color={muted}/></Pressable>}</View>;}
  function commonEvidence(item: CommonInterest, profiles: DemoProfile[]) {
    return <View style={{gap: 14}}>{item.evidence.map(evidence => {
      const profile = profiles.find(p => p.id === evidence.profileId);
      return <Card key={evidence.profileId}><View style={[s.row, {marginBottom: 14}]}>{profile && <Avatar profile={profile} size={35}/>}<Text style={[s.label, s.flex]}>{evidence.profileName}</Text><Text style={s.small}>관심도 {Math.round(evidence.score)}</Text></View>{!!evidence.interestLabels?.length && <View style={[s.tags, {marginBottom: 15}]}>{evidence.interestLabels.map(label => <Tag key={label}>{label}</Tag>)}</View>}<SourceList sources={evidence.sources} example={profile?.isDemo}/></Card>;
    })}</View>;
  }
  function importedPreview(value: DemoImport | null | undefined, provider: 'youtube' | 'linkedin') {
    if (!value) return null;
    const summary = value.summary || {};
    return <Card><View style={s.between}><Text style={s.label}>{provider === 'youtube' ? 'YouTube에서 불러온 데이터' : '등록한 프로필 데이터'}</Text><Tag>실제 데이터</Tag></View><View style={[s.metrics, {marginTop: 20, marginBottom: 18}]}>{provider === 'youtube' ? <><Metric label="재생목록" value={Number(summary.playlists || 0)} suffix="개"/><Metric label="영상" value={Number(summary.videos || 0)} suffix="개"/><Metric label="구독 채널" value={Number(summary.subscriptions || 0)} suffix="개"/></> : <><Metric label="문자" value={Number(summary.characters || 0).toLocaleString()}/><Metric label="데이터" value={Number(summary.records || value.samples?.length || 0)} suffix="건"/><Metric label="섹션" value={Number(summary.sections || 0)} suffix="개"/></>}</View>{summary.fileName && <Text style={[s.small, {marginBottom: 12}]}>{String(summary.fileName)}</Text>}{summary.truncated && <Text style={[s.small, {marginBottom: 12}]}>이번 분석에 사용할 수 있는 범위까지 불러왔어요.</Text>}{value.samples?.slice(0, 3).map((sample, i) => <View key={sample.id || String(i)} style={s.sampleRow}><View style={s.sampleDot}/><View style={s.flex}><Text style={s.sampleTitle} numberOfLines={2}>{sample.title}</Text>{sample.text && <Text style={s.small} numberOfLines={2}>{sample.text}</Text>}</View>{sample.url && <Pressable accessibilityRole="link" accessibilityLabel={`${sample.title} 원본 보기`} onPress={() => Linking.openURL(sample.url!)}><Icon name="open-outline" color={muted} size={15}/></Pressable>}</View>)}</Card>;
  }

  function renderPage() {
    if (!data) return <><Heading eyebrow="SAI DEMO" title="대화의 시작을 찾는 사이" description="사람의 관심사를 이해하고, 함께할 이야기를 찾아요."/>{booting ? <View style={s.empty}><ActivityIndicator color={ink}/><Text style={s.description}>프로필을 불러오고 있어요</Text></View> : <Button onPress={() => run(async () => {await load(lifecycle.current?.signal);})}>다시 연결하기</Button>}</>;
    switch (page) {
      case 'friends':
        return <><Heading eyebrow="FIND YOUR COMMON GROUND" title="우리 사이, 어떤 이야기?" description="함께 대화할 사람을 선택하면 모두의 공통 관심사를 찾아드려요."/>{searchField()}<View style={[s.between, {marginTop: 24, marginBottom: 12}]}><Text style={s.sectionTitle}>친구 <Text style={s.count}>{data.people.length}</Text></Text><Text style={s.small}>예시 프로필로 바로 체험</Text></View>{personCards('friends')}</>;
      case 'common':
        return <><Heading eyebrow="COMMON INTERESTS" title="함께 나눌 이야기" description={`${abbreviate(commonPeople)}
${commonPeople.length}명 모두의 관심사에서 찾았어요.`}/><View style={s.avatarStack}>{commonPeople.map(p => <View key={p.id} style={s.stackPerson}><Avatar profile={p} size={42}/><Text style={s.stackName}>{p.name}</Text></View>)}</View>{common.length ? <Section title="공통 관심사 Top 3"><Card>{common.slice(0, 3).map((item, i) => <TopicRow key={item.id} topic={item} index={i} onPress={() => showCommonDetail(item)}/>)}</Card><Text style={s.small}>추천 점수는 구성원 전체의 공통도와 데이터 근거를 함께 반영해요. 관심사를 눌러 이유를 확인해보세요.</Text></Section> : <Empty title="모두가 공유하는 주제를 찾지 못했어요" text="모든 구성원에게 근거가 있는 관심사만 보여드려요. 다른 사람을 선택하거나 관심사 데이터를 더해보세요."/>}<Button secondary onPress={() => {setSearch(''); navigate('friends');}}>다른 사람 선택하기</Button></>;
      case 'common-detail':
        return topic && <><Heading eyebrow="WHY THIS TOPIC" title={topic.label} description={`${commonPeople.length}명 모두에게 연결된 관심사`}/><Card quiet><View style={s.between}><Text style={s.label}>추천 점수</Text><Score value={topic.score} large/></View><Text style={[s.description, {marginTop: 16}]}>{topic.reason}</Text></Card><Section title="점수 자세히 보기"><Card><QualityRow label="구성원 공통도" score={topic.commonality}/><QualityRow label="근거 강도" score={topic.evidenceStrength}/><View style={[s.between, {paddingTop: 14}]}><Text style={s.body}>매칭 유형</Text><Tag>{topic.matchType}</Tag></View></Card></Section><Section title="사용자별 근거">{commonEvidence(topic, commonPeople)}</Section></>;
      case 'groups':
        return <><Heading eyebrow="BETTER TOGETHER" title="대화가 잘 통하는 조합" description="공통 관심사와 구성원의 균형을 고려해 모두가 참여할 수 있는 그룹을 만들어요."/><Button onPress={beginGroup}>+ 그룹 만들기</Button><Section title="나의 그룹" action={`${data.groups.length}개`}>{data.groups.length ? data.groups.map(saved => {
          const members = new Set(saved.plan.groups.flatMap(g => g.memberIds));
          const labels = [...new Set(saved.plan.groups.flatMap(g => g.interests.slice(0, 2).map(t => t.label)))].slice(0, 3);
          return <Pressable key={saved.id} accessibilityRole="button" onPress={() => openSaved(saved)} style={({pressed}) => [s.card, pressed && {backgroundColor: surface}]}><View style={s.between}><View style={s.groupIcon}><Icon name="people-outline" size={23}/></View><Icon name="chevron-forward" color={muted}/></View><Text style={s.groupTitle}>{saved.name}</Text><Text style={s.description}>{members.size}명 · {saved.plan.groups.length}개 테이블</Text><View style={[s.tags, {marginTop: 15}]}>{labels.map(label => <Tag key={label}>#{label}</Tag>)}</View><View style={s.cardFooter}><Text style={s.small}>확정한 편성</Text><Score value={saved.plan.score}/></View></Pressable>;
        }) : <Empty icon="people-outline" title="첫 그룹을 만들어보세요" text="참가자를 고르고 테이블당 인원만 정하면, 세 가지 추천 편성을 비교할 수 있어요."/>}</Section></>;
      case 'participants':
        return <><Heading eyebrow="CREATE GROUP · 01 / 02" title="누구와 함께할까요?" description="그룹에 참여할 사람을 3명 이상 선택해주세요."/>{searchField()}<View style={[s.between, {marginVertical: 18}]}><Text style={s.label}>참가자 {eligiblePeople.length}명</Text><View style={s.row}><Pressable accessibilityRole="button" onPress={() => {setParticipantIds(eligiblePeople.slice(0, 24).map(p => p.id)); if (eligiblePeople.length > 24) setNotice('Demo 편성은 최대 24명까지 가능해요. 선택한 참가자를 확인해주세요.');}}><Text style={s.link}>전체 선택</Text></Pressable><Text style={s.small}>·</Text><Pressable accessibilityRole="button" onPress={() => setParticipantIds([])}><Text style={s.link}>선택 해제</Text></Pressable></View></View>{personCards('participants')}</>;
      case 'conditions':
        return <><Heading eyebrow="CREATE GROUP · 02 / 02" title="모임을 준비해볼까요?" description="모임 이름과 한 테이블에 앉을 인원을 정해주세요."/><Section title="모임 이름"><TextInput accessibilityLabel="모임 이름" style={s.input} placeholder="예: 동아리 OT" placeholderTextColor="#929299" value={groupName} onChangeText={setGroupName} maxLength={60}/></Section><Section title="테이블당 인원"><View style={s.sizeOptions}>{[3, 4, 5].map(size => <Pressable key={size} accessibilityRole="radio" accessibilityState={{selected: tableSize === size}} onPress={() => setTableSize(size)} style={[s.sizeOption, tableSize === size && s.sizeActive]}><Icon name="people-outline" size={25} color={tableSize === size ? 'white' : ink}/><Text style={[s.sizeLabel, tableSize === size && {color: 'white'}]}>{size}명</Text></Pressable>)}</View><Card quiet><View style={s.between}><Text style={s.label}>{participantIds.length}명 / 테이블당 최대 {tableSize}명</Text><Icon name="arrow-forward" size={18}/></View><Text style={s.expectedTables}>{expected.feasible ? `${expected.tables}개 테이블 예상` : '인원 조정이 필요해요'}</Text><Text style={s.small}>{expected.feasible ? '남는 인원이 있으면 테이블을 균형 있게 나눠요. 한 테이블은 최소 3명이에요.' : '모든 테이블에 3명 이상이 앉을 수 있도록 참가자나 테이블당 인원을 바꿔주세요.'}</Text></Card></Section><Section title="선택한 참가자"><Text style={s.description}>{abbreviate(selectedParticipants)}</Text><Pressable accessibilityRole="button" onPress={() => {setSearch(''); navigate('participants');}}><Text style={s.link}>참가자 변경하기</Text></Pressable></Section><View style={{marginTop: 28}}><Button disabled={!expected.feasible || busy} onPress={() => analyze('groups')}>그룹 추천하기</Button></View></>;
      case 'analysis': {
        const isGroup = analysisKind === 'groups';
        const steps = isGroup ? ['공통 관심사 비교', '그룹 대화 가능성 계산', '전체 조합의 균형 최적화'] : analysisKind === 'profile' ? ['실제 데이터 정리', '관심사 찾기', '서비스 간 관심사 통합'] : ['참가자 관심사 확인', '모두의 공통 주제 찾기', '추천 점수와 근거 정리'];
        const progress = typeof job?.progress === 'number' ? Math.max(0, Math.min(100, job.progress <= 1 ? job.progress * 100 : job.progress)) : 0;
        const currentStep = Math.min(2, Math.floor(progress / 34));
        return <View style={s.analysis}><Text style={s.eyebrow}>{isGroup ? 'GROUP OPTIMIZATION' : 'INTEREST ANALYSIS'}</Text><View style={s.analysisGraphic}><Icon name={isGroup ? 'people-outline' : 'sparkles-outline'} size={38}/><ActivityIndicator style={s.analysisSpinner} color={ink} size="small"/></View><Text style={[s.title, {textAlign: 'center'}]}>{isGroup ? '좋은 조합을 찾고 있어요' : analysisKind === 'profile' ? '나만의 관심사를 찾고 있어요' : '우리의 공통점을 찾고 있어요'}</Text><Text accessibilityLiveRegion="polite" style={[s.description, {textAlign: 'center', minHeight: 52}]}>{job?.message || '분석을 준비하고 있어요'}</Text><View style={s.analysisSteps}>{steps.map((step, i) => <View key={step} style={[s.row, {paddingVertical: 11}]}><View style={[s.stepDot, i <= currentStep && s.stepDotActive]}>{i < currentStep ? <Icon name="checkmark" size={13} color="white"/> : <Text style={[s.stepNumber, i <= currentStep && {color: 'white'}]}>{i + 1}</Text>}</View><Text style={[s.body, i > currentStep && {color: muted}]}>{step}</Text></View>)}</View>{progress > 0 && <View style={s.progressTrack}><View style={[s.progressBar, {width: `${progress}%`}]}/></View>}<Text style={[s.small, {textAlign: 'center'}]}>{isGroup ? '관심사와 그룹 품질을 평가한 뒤 전체 참가자의 조합을 최적화해요.' : analysisKind === 'profile' ? '처음 분석할 때는 AI 모델 준비에 시간이 걸릴 수 있어요.' : '모든 참가자에게 근거가 있는 공통 주제를 찾아요.'}</Text><Pressable accessibilityRole="button" onPress={back} style={{padding: 18}}><Text style={s.link}>분석 화면 나가기</Text></Pressable></View>;
      }
      case 'group-result':
        return activePlan && <><Heading eyebrow={viewingSaved ? 'CONFIRMED GROUP' : 'RECOMMENDED PLANS'} title={viewingSaved ? viewingSaved.name : '이 조합은 어때요?'} description={viewingSaved ? '확정한 테이블과 추천 이유를 확인해보세요.' : `${groupPeople.length}명의 관심사를 비교해 추천하는 편성이에요.`}/>{!viewingSaved && <View style={s.planOptions}>{optimization?.plans.map((plan, i) => <Pressable key={plan.id} accessibilityRole="tab" accessibilityState={{selected: i === planIndex}} onPress={() => setPlanIndex(i)} style={[s.planOption, i === planIndex && s.planOptionActive]}><Text style={[s.planCaption, i === planIndex && {color: 'white'}]}>추천 {i + 1}</Text><Text style={[s.planScore, i === planIndex && {color: 'white'}]}>{Math.round(plan.score)}<Text style={s.planUnit}> 점</Text></Text></Pressable>)}</View>}<Card quiet><Text style={s.label}>{activePlan.label}</Text><View style={[s.metrics, {marginTop: 20}]}><Metric label="전체 추천 점수" value={Math.round(activePlan.score)} suffix="점"/><Metric label="최저 그룹 점수" value={Math.round(activePlan.minGroupScore)} suffix="점"/><Metric label="그룹 간 균형" value={balanceLabel(activePlan.balance)}/></View></Card>{!viewingSaved && optimization && <Text style={s.small}>{optimization.plans.length < 3 ? `가능한 ${optimization.plans.length}개 편성안을 찾았어요. ` : ''}{optimization.solver?.note || (optimization.solver?.optimal ? '전체 참가자를 빠짐없이 배정한 최적 편성이에요.' : '제한 시간 안에서 찾은 편성이에요.')}</Text>}<Section title={`${activePlan.groups.length}개의 테이블`}>{activePlan.groups.map((table, i) => <Card key={table.id}><View style={s.between}><Text style={s.tableTitle}>테이블 {i + 1}</Text><Score value={table.score}/></View><View style={[s.row, {marginTop: 16, gap: 8}]}>{table.memberIds.slice(0, 5).map(id => {const p = groupPeople.find(p => p.id === id); return p ? <Avatar key={id} profile={p} size={33}/> : null;})}</View><Text style={[s.description, {marginTop: 10}]}>{abbreviate(table.memberIds.map(id => groupPeople.find(p => p.id === id)).filter(Boolean) as DemoProfile[])}</Text><View style={{gap: 10, marginTop: 19}}>{table.interests.slice(0, 3).map(item => <View key={item.id} style={s.between}><Text style={s.body}>#{item.label}</Text><Text style={s.label}>{Math.round(item.score)}</Text></View>)}</View><View style={s.cardFooter}><Text style={s.small}>{table.memberIds.length}명이 함께할 이야기</Text><Pressable accessibilityRole="button" onPress={() => openTable(table)} style={s.textAction}><Text style={s.link}>상세 보기</Text><Icon name="arrow-forward" size={15}/></Pressable></View></Card>)}</Section></>;
      case 'table-detail': {
        if (!selectedTable) return null;
        const members = selectedTable.memberIds.map(id => groupPeople.find(p => p.id === id)).filter(Boolean) as DemoProfile[];
        const tableIndex = (activePlan?.groups.findIndex(g => g.id === selectedTable.id) ?? 0) + 1;
        return <><Heading eyebrow="A TABLE TO CONNECT" title={`테이블 ${tableIndex}`} description={`${members.length}명이 함께 나눌 이야기와 추천 이유`}/><Card quiet><View style={s.between}><Text style={s.label}>그룹 추천 점수</Text><Score value={selectedTable.score} large/></View></Card><Section title="함께하는 사람들"><View style={s.tableMembers}>{members.map(p => <View key={p.id} style={s.tableMember}><Avatar profile={p} size={44}/><Text style={s.label}>{p.name}</Text><Text style={s.small}>{p.isDemo ? '예시 프로필' : '내 프로필'}</Text></View>)}</View></Section><Section title="공통 관심사 Top 3"><Card>{selectedTable.interests.slice(0, 3).map((item, i) => <TopicRow key={item.id} topic={item} index={i} onPress={() => setTableTopic(tableTopic?.id === item.id ? null : item)}/>)}</Card>{tableTopic && <View style={s.topicDetailInline}><View style={s.between}><Text style={s.sectionTitle}>{tableTopic.label}</Text><Pressable accessibilityLabel="관심사 근거 접기" onPress={() => setTableTopic(null)}><Icon name="close" size={18}/></Pressable></View><Text style={s.description}>{tableTopic.reason}</Text>{commonEvidence(tableTopic, members)}</View>}</Section><Section title="그룹 품질"><Card><QualityRow label="공통 관심사 강도" score={selectedTable.quality.topicStrength}/><QualityRow label="구성원 균형" score={selectedTable.quality.memberBalance}/><QualityRow label="주제 다양성" score={selectedTable.quality.topicBreadth}/><QualityRow label="구성원 연결도" score={selectedTable.quality.pairCoverage}/></Card><Text style={s.small}>각 구성원의 관심사 근거와 대화 참여 가능성을 함께 평가해 이 테이블을 추천했어요. 관심사를 누르면 사람별 근거를 볼 수 있어요.</Text></Section></>;
      }
      case 'my':
        return <><Heading eyebrow="UNDERSTAND YOUR INTERESTS" title="나를 알아가는 사이" description="실제 데이터에서 관심사를 발견하고, 나와 잘 통하는 대화의 시작을 찾아요."/><View style={s.profile}><Avatar profile={data.me} size={68}/><View style={s.flex}><Text style={s.profileName}>{data.me.name}</Text><Text style={s.description}>나의 Demo 프로필</Text></View><Pressable accessibilityRole="button" accessibilityLabel="프로필 수정" onPress={() => {setProfileName(data.me.name); setProfileAvatar(data.me.avatar || ''); navigate('profile-edit');}} style={s.profileEdit}><Icon name="pencil-outline" size={19}/></Pressable></View><Section title="관심사 데이터 연결"><Pressable accessibilityRole="button" onPress={() => navigate('youtube')} style={s.integrationCard}><View style={s.integrationIcon}><Icon name="logo-youtube" size={25}/></View><View style={s.flex}><Text style={s.label}>YouTube</Text><Text style={s.small}>재생목록 · 영상 · 구독 채널</Text></View><Tag>{data.integrations.youtube.connected ? '연결됨' : '연동 전'}</Tag><Icon name="chevron-forward" color={muted} size={17}/></Pressable><Pressable accessibilityRole="button" onPress={() => navigate('linkedin')} style={s.integrationCard}><View style={s.integrationIcon}><Icon name="logo-linkedin" size={23}/></View><View style={s.flex}><Text style={s.label}>LinkedIn</Text><Text style={s.small}>기본 정보 · 프로필 PDF / 텍스트</Text></View><Tag>{data.imports.linkedin ? '등록됨' : data.integrations.linkedin.connected ? '연결됨' : '연동 전'}</Tag><Icon name="chevron-forward" color={muted} size={17}/></Pressable></Section>{hasImportedData && <View style={{marginTop: 23, gap: 10}}><Button disabled={busy} onPress={() => analyze('profile')}>관심사 분석하기</Button><Text style={s.small}>불러온 실제 데이터를 분석해 관심사와 근거를 만들어요.</Text></View>}<Section title="나의 관심사" action={data.me.interests.length ? '전체 보기' : undefined} onAction={() => navigate('my-interests')}>{data.me.interests.length ? <Card>{data.me.interests.slice(0, 5).map((item, i) => <TopicRow key={item.id} topic={item} index={i} onPress={() => {setOwnTopic(item); navigate('my-interest-detail');}}/>)}</Card> : <Card quiet><View style={[s.row, {alignItems: 'flex-start'}]}><Icon name="sparkles-outline" size={25}/><View style={s.flex}><Text style={s.label}>어떤 이야기를 좋아하세요?</Text><Text style={[s.description, {marginTop: 8}]}>YouTube를 연결하거나 LinkedIn 프로필을 등록한 뒤, 관심사 분석을 시작해주세요.</Text></View></View></Card>}</Section></>;
      case 'profile-edit':
        return <><Heading eyebrow="MY PROFILE" title="나의 프로필" description="다른 사람에게 보여줄 사진과 이름을 정해주세요."/><View style={{alignItems: 'center', marginVertical: 20, gap: 16}}><Avatar profile={{...data.me, name: profileName || data.me.name, avatar: profileAvatar}} size={94}/><Button compact secondary disabled={busy} onPress={editAvatar}>사진 선택</Button>{!!profileAvatar && <Pressable accessibilityRole="button" onPress={() => setProfileAvatar('')}><Text style={s.small}>사진 지우기</Text></Pressable>}</View><Section title="이름"><TextInput accessibilityLabel="프로필 이름" style={s.input} value={profileName} onChangeText={setProfileName} maxLength={30} placeholder="이름을 입력해주세요"/></Section><View style={{marginTop: 28}}><Button disabled={busy || !profileName.trim()} onPress={saveProfile}>저장하기</Button></View></>;
      case 'youtube':
        return <><Heading eyebrow="REAL DATA · YOUTUBE" title={'즐겨 보는 영상에서\n관심사를 찾을 수 있어요'} description="Google 계정을 연결하고, 분석에 사용할 실제 재생목록을 선택해주세요."/><Card><View style={s.between}><View style={s.row}><Icon name="logo-youtube" size={26}/><Text style={s.sectionTitle}>YouTube</Text></View><Tag>{data.integrations.youtube.connected ? '연결됨' : '연동 전'}</Tag></View><Text style={[s.description, {marginVertical: 18}]}>{data.integrations.youtube.connected ? '계정이 연결되어 있어요. 재생목록을 조회해 분석할 데이터를 골라보세요.' : '재생목록과 영상 정보를 읽기 위한 권한을 요청해요.'}</Text><Button secondary={data.integrations.youtube.connected} disabled={busy || !data.integrations.youtube.configured} onPress={() => oauth('youtube')}>{data.integrations.youtube.connected ? 'Google 계정 다시 연결' : 'YouTube 연결'}</Button>{!data.integrations.youtube.configured && <Text style={[s.small, {marginTop: 12}]}>로컬 서버의 Google OAuth 환경변수를 설정한 뒤 서버를 다시 실행해주세요.</Text>}{data.integrations.youtube.connected && <View style={{marginTop: 10}}><Button disabled={busy} onPress={fetchPlaylists}>{playlistsLoaded ? '재생목록 새로 불러오기' : '재생목록 조회하기'}</Button></View>}</Card>{playlistsLoaded && <Section title="분석할 재생목록" action={playlistIds.length === playlists.length ? '선택 해제' : '전체 선택'} onAction={() => setPlaylistIds(playlistIds.length === playlists.length ? [] : playlists.map(p => p.id))}>{playlists.length ? <Card>{playlists.map(playlist => <Pressable key={playlist.id} accessibilityRole="checkbox" accessibilityState={{checked: playlistIds.includes(playlist.id)}} onPress={() => setPlaylistIds(ids => ids.includes(playlist.id) ? ids.filter(id => id !== playlist.id) : [...ids, playlist.id])} style={s.playlistRow}><View style={[s.check, playlistIds.includes(playlist.id) && s.checkSelected]}>{playlistIds.includes(playlist.id) && <Icon name="checkmark" size={14} color="white"/>}</View><View style={s.flex}><Text style={s.label}>{playlist.title}</Text><Text style={s.small}>영상 {playlist.itemCount}개</Text></View></Pressable>)}</Card> : <Card quiet><Text style={s.description}>가져올 수 있는 재생목록이 없어요. YouTube에서 재생목록을 만든 뒤 다시 조회해보세요.</Text></Card>}<View style={[s.between, {paddingVertical: 10}]}><View style={s.flex}><Text style={s.label}>구독 채널도 함께 불러오기</Text><Text style={s.small}>관심사를 이해하는 추가 근거로 사용해요.</Text></View><Switch accessibilityLabel="구독 채널 함께 불러오기" value={subscriptions} onValueChange={setSubscriptions} trackColor={{false: '#DADADD', true: ink}} thumbColor="white"/></View><Button disabled={busy || (!playlistIds.length && !subscriptions)} onPress={importYoutube}>{busy ? '실제 데이터를 불러오는 중' : `데이터 불러오기${playlistIds.length ? ` · ${playlistIds.length}개 재생목록` : ''}`}</Button></Section>}<Section title="불러온 데이터">{data.imports.youtube ? importedPreview(data.imports.youtube, 'youtube') : <Text style={s.description}>아직 불러온 데이터가 없어요.</Text>}</Section>{hasImportedData && <Button disabled={busy} onPress={() => analyze('profile')}>관심사 분석하기</Button>}</>;
      case 'linkedin':
        return <><Heading eyebrow="REAL DATA · LINKEDIN" title={'경험과 기술에도\n관심사가 담겨 있어요'} description="LinkedIn 계정을 연결하고, 프로필 PDF 또는 텍스트를 더해주세요."/><Card><View style={s.between}><View style={s.row}><Icon name="logo-linkedin" size={24}/><Text style={s.sectionTitle}>LinkedIn</Text></View><Tag>{data.integrations.linkedin.connected ? '연결됨' : '연동 전'}</Tag></View><Text style={[s.description, {marginVertical: 18}]}>로그인으로 기본 정보를 가져오고, 자세한 경력과 기술은 직접 등록한 프로필에서 읽어요.</Text>{data.integrations.linkedin.connected && data.integrations.linkedin.profile?.name && <View style={[s.row, {marginBottom: 18, padding: 14, borderRadius: 10, backgroundColor: surface}]}><Icon name="checkmark-circle-outline" size={20}/><View style={s.flex}><Text style={s.label}>{data.integrations.linkedin.profile.name}</Text><Text style={s.small}>LinkedIn 로그인으로 가져온 기본 정보</Text></View></View>}<Button secondary disabled={busy || !data.integrations.linkedin.configured} onPress={() => oauth('linkedin')}>{data.integrations.linkedin.connected ? 'LinkedIn 다시 연결' : 'LinkedIn 연결'}</Button>{!data.integrations.linkedin.configured && <Text style={[s.small, {marginTop: 12}]}>LinkedIn OAuth 환경변수를 설정하면 로그인으로 기본 정보를 가져올 수 있어요. 프로필 파일과 텍스트는 지금 등록할 수 있어요.</Text>}</Card><Section title="프로필 파일 추가"><Button secondary disabled={busy} onPress={uploadLinkedin}>PDF / TXT 파일 선택</Button><Text style={s.small}>{documentName ? `등록한 파일: ${documentName}` : 'LinkedIn에서 저장한 프로필 PDF 또는 TXT · 최대 6MB'}</Text></Section><Section title="프로필 텍스트 입력"><TextInput accessibilityLabel="LinkedIn 프로필 텍스트" editable={!busy} multiline style={[s.input, s.textarea]} placeholder="LinkedIn 프로필의 소개, 경력, 기술, 교육, 프로젝트를 붙여넣어주세요." placeholderTextColor="#929299" value={linkedinText} onChangeText={setLinkedinText} maxLength={150000}/><Button disabled={busy || !linkedinText.trim()} onPress={() => importLinkedin()}>{busy ? '프로필을 읽는 중' : '프로필 데이터 등록'}</Button></Section>{data.imports.linkedin && <Section title="등록한 데이터">{importedPreview(data.imports.linkedin, 'linkedin')}</Section>}{hasImportedData && <Button disabled={busy} onPress={() => analyze('profile')}>관심사 분석하기</Button>}</>;
      case 'my-interests':
        return <><Heading eyebrow="YOUR INTEREST PROFILE" title="나의 관심사" description="실제 데이터에서 발견한 나만의 대화 주제예요. 관심사를 눌러 근거를 확인해보세요."/>{data.me.interests.length ? <Card>{data.me.interests.map((item, i) => <TopicRow key={item.id} topic={item} index={i} onPress={() => {setOwnTopic(item); navigate('my-interest-detail');}}/>)}</Card> : <Empty title="아직 분석한 관심사가 없어요" text="YouTube나 LinkedIn에서 실제 데이터를 가져와 분석해주세요."/>}{hasImportedData && <Button secondary disabled={busy} onPress={() => analyze('profile')}>관심사 다시 분석하기</Button>}</>;
      case 'my-interest-detail':
        return ownTopic && <><Heading eyebrow="YOUR INTEREST EVIDENCE" title={ownTopic.label} description="AI가 이 관심사를 발견한 실제 데이터예요."/><Card quiet><View style={s.between}><Text style={s.label}>관심사 점수</Text><Score value={ownTopic.score} large/></View><Text style={[s.description, {marginTop: 14}]}>{ownTopic.category} 분야의 관심사</Text></Card><Section title="관심사의 근거"><Card><SourceList sources={ownTopic.evidence}/></Card></Section></>;
    }
  }

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><StatusBar style="dark"/><View style={s.shell}><View style={s.header}><Pressable accessibilityRole="button" accessibilityLabel="사이 친구 화면으로" disabled={busy} onPress={() => switchTab('친구')} style={s.brand}><Image accessibilityLabel="사이 로고" source={require('../SAI image.png')} resizeMode="contain" style={s.brandLogo}/><View style={s.demoBadge}><Text style={s.demoBadgeText}>DEMO</Text></View></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={beginGroup} style={[s.headerAction, busy && s.disabled]}><Icon name="add" size={18}/><Text style={s.headerActionText}>그룹 만들기</Text></Pressable></View>{!homePage && <View style={s.backRow}><Pressable accessibilityRole="button" disabled={busy} onPress={back} style={[s.backButton, busy && s.disabled]}><Icon name="arrow-back" size={18}/><Text style={s.link}>{page === 'analysis' ? '돌아가기' : '뒤로'}</Text></Pressable><Text style={s.small}>{tab}</Text></View>}<ScrollView ref={scroll} style={s.scroll} contentContainerStyle={[s.content, page === 'analysis' && {flexGrow: 1}]} keyboardShouldPersistTaps="handled">{!!error && <View accessibilityRole="alert" style={s.error}><Icon name="alert-circle-outline" color="#A33B34" size={20}/><Text style={s.errorText}>{error}</Text><Pressable accessibilityLabel="오류 메시지 닫기" onPress={() => setError('')}><Icon name="close" size={17} color="#A33B34"/></Pressable></View>}{!!notice && <View accessibilityLiveRegion="polite" style={s.notice}><Icon name="checkmark-circle-outline" size={19}/><Text style={s.noticeText}>{notice}</Text></View>}{busy && <View accessibilityLiveRegion="polite" style={[s.row, {marginBottom: 15}]}><ActivityIndicator size="small" color={ink}/><Text style={s.small}>요청을 처리하고 있어요…</Text></View>}{renderPage()}</ScrollView>{page === 'friends' && data && selectionBar('friends')}{page === 'participants' && data && selectionBar('participants')}{page === 'group-result' && activePlan && !viewingSaved && <View style={s.selectionBar}><Button disabled={busy} onPress={confirmPlan}>{busy ? '편성을 저장하고 있어요' : '이 편성으로 결정'}</Button></View>}<View style={s.nav}>{(['친구', '그룹', '마이'] as Tab[]).map(item => <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item} accessibilityState={{selected: item === tab}} disabled={busy} onPress={() => switchTab(item)} style={[s.navItem, busy && s.disabled]}><Icon name={item === '친구' ? (tab === item ? 'people' : 'people-outline') : item === '그룹' ? (tab === item ? 'grid' : 'grid-outline') : (tab === item ? 'person' : 'person-outline')} size={22} color={tab === item ? ink : '#9B9BA3'}/><Text style={[s.navText, tab === item && {color: ink, fontWeight: '700'}]}>{item}</Text></Pressable>)}</View></View></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F0F0F2'},
  shell: {flex: 1, backgroundColor: 'white', width: '100%', maxWidth: 600, alignSelf: 'center'},
  flex: {flex: 1},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10},
  between: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12},
  header: {height: 76, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: line},
  brand: {flexDirection: 'row', alignItems: 'center', gap: 10},
  brandLogo: {width: 104, height: 40},
  demoBadge: {backgroundColor: surface, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 4},
  demoBadgeText: {fontSize: 9, color: muted, fontWeight: '700', letterSpacing: 1},
  headerAction: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingLeft: 10},
  headerActionText: {fontSize: 13, color: ink, fontWeight: '600'},
  backRow: {height: 46, paddingHorizontal: 23, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  backButton: {flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 10},
  scroll: {flex: 1},
  content: {paddingHorizontal: 24, paddingTop: 28, paddingBottom: 36, gap: 15},
  heading: {gap: 12, marginBottom: 13},
  eyebrow: {fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: muted},
  title: {fontSize: 29, lineHeight: 39, fontWeight: '700', letterSpacing: -1, color: ink},
  description: {fontSize: 14, lineHeight: 23, color: muted},
  body: {fontSize: 14, lineHeight: 22, color: ink},
  small: {fontSize: 12, lineHeight: 19, color: muted},
  label: {fontSize: 14, lineHeight: 22, color: ink, fontWeight: '600'},
  link: {fontSize: 12, lineHeight: 19, fontWeight: '600', color: ink},
  textAction: {flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4},
  section: {gap: 13, marginTop: 13},
  sectionTitle: {fontSize: 17, lineHeight: 24, fontWeight: '700', color: ink, letterSpacing: -.3},
  count: {color: muted, fontSize: 15, fontWeight: '500'},
  button: {minHeight: 50, backgroundColor: ink, borderRadius: 13, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 13},
  buttonSecondary: {backgroundColor: surface, borderWidth: 1, borderColor: line},
  buttonCompact: {minHeight: 39, paddingVertical: 9},
  buttonText: {fontSize: 14, lineHeight: 22, fontWeight: '700', color: 'white'},
  disabled: {opacity: .38},
  avatar: {backgroundColor: '#F0F0F2', justifyContent: 'center', alignItems: 'center'},
  card: {borderWidth: 1, borderColor: line, borderRadius: 19, padding: 20, backgroundColor: 'white'},
  quietCard: {backgroundColor: surface, borderWidth: 0},
  tags: {flexDirection: 'row', gap: 7, flexWrap: 'wrap'},
  tag: {backgroundColor: '#F0F0F2', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start'},
  tagText: {fontSize: 11, lineHeight: 17, color: '#5B5B65', fontWeight: '500'},
  search: {backgroundColor: surface, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 47},
  searchInput: {flex: 1, fontSize: 14, color: ink, height: 47, outlineStyle: 'none'} as any,
  personCard: {flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 12},
  personCardSelected: {backgroundColor: '#F7F7F8'},
  personName: {fontSize: 15, color: ink, fontWeight: '600'},
  personMarker: {fontSize: 9, color: muted, backgroundColor: '#F0F0F2', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3},
  personInterests: {fontSize: 12, color: muted, marginTop: 5, lineHeight: 19},
  check: {height: 22, width: 22, borderRadius: 7, borderColor: '#D7D7DD', borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  checkSelected: {backgroundColor: ink, borderColor: ink},
  selectionBar: {gap: 9, paddingHorizontal: 24, paddingTop: 15, paddingBottom: 15, backgroundColor: 'white', borderTopWidth: 1, borderColor: line},
  nav: {height: 70, flexDirection: 'row', borderTopWidth: 1, borderColor: line, backgroundColor: 'white'},
  navItem: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5},
  navText: {fontSize: 11, color: '#92929A'},
  empty: {paddingVertical: 36, paddingHorizontal: 15, alignItems: 'center', gap: 14},
  emptyIcon: {width: 58, height: 58, backgroundColor: surface, borderRadius: 19, alignItems: 'center', justifyContent: 'center'},
  emptyTitle: {fontSize: 17, lineHeight: 25, color: ink, fontWeight: '600', textAlign: 'center'},
  error: {backgroundColor: '#FFF1EF', borderRadius: 12, padding: 13, flexDirection: 'row', gap: 8, alignItems: 'flex-start'},
  errorText: {fontSize: 13, lineHeight: 21, color: '#A33B34', flex: 1},
  notice: {backgroundColor: surface, borderRadius: 12, padding: 13, flexDirection: 'row', gap: 8},
  noticeText: {fontSize: 13, lineHeight: 21, color: ink, flex: 1},
  topicRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderColor: line},
  rank: {fontSize: 12, fontWeight: '700', color: '#A3A3AA', width: 22},
  topicTitle: {fontSize: 16, lineHeight: 23, fontWeight: '600', color: ink, marginBottom: 3},
  score: {fontSize: 19, fontWeight: '700', color: ink, letterSpacing: -.5},
  scoreLarge: {fontSize: 33},
  scoreUnit: {fontSize: 10, fontWeight: '500', color: muted},
  avatarStack: {flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 3, marginBottom: 7},
  stackPerson: {alignItems: 'center', gap: 6},
  stackName: {fontSize: 11, color: muted},
  qualityRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11},
  qualityTrack: {height: 4, flex: 1, backgroundColor: '#EEEEF0', borderRadius: 3, marginLeft: 5},
  qualityBar: {height: 4, backgroundColor: ink, borderRadius: 3},
  qualityValue: {width: 24, textAlign: 'right', fontSize: 13, color: ink, fontWeight: '600'},
  source: {fontSize: 10, color: muted, fontWeight: '700', letterSpacing: .2},
  evidenceItem: {backgroundColor: surface, padding: 14, borderRadius: 11, gap: 7},
  evidenceTitle: {fontSize: 13, lineHeight: 20, fontWeight: '600', color: ink},
  evidenceText: {fontSize: 12, lineHeight: 19, color: muted},
  groupIcon: {width: 45, height: 45, backgroundColor: surface, borderRadius: 13, alignItems: 'center', justifyContent: 'center'},
  groupTitle: {fontSize: 21, lineHeight: 29, fontWeight: '700', color: ink, marginTop: 19, marginBottom: 6},
  cardFooter: {borderTopWidth: 1, borderColor: line, marginTop: 19, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  input: {minHeight: 48, borderWidth: 1, borderColor: line, backgroundColor: surface, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 14, color: ink, fontSize: 14, lineHeight: 22},
  textarea: {minHeight: 200, textAlignVertical: 'top'},
  sizeOptions: {flexDirection: 'row', gap: 12},
  sizeOption: {flex: 1, borderWidth: 1, borderColor: line, borderRadius: 15, paddingVertical: 22, backgroundColor: 'white', alignItems: 'center', gap: 12},
  sizeActive: {backgroundColor: ink, borderColor: ink},
  sizeLabel: {fontSize: 17, color: ink, fontWeight: '700'},
  expectedTables: {fontSize: 23, lineHeight: 30, fontWeight: '700', color: ink, marginTop: 11, marginBottom: 10, letterSpacing: -.5},
  analysis: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 22, gap: 20},
  analysisGraphic: {width: 109, height: 109, alignItems: 'center', justifyContent: 'center', borderRadius: 34, backgroundColor: surface, marginVertical: 10},
  analysisSpinner: {position: 'absolute', bottom: -4, right: -4, backgroundColor: 'white', padding: 8, borderRadius: 18},
  analysisSteps: {alignSelf: 'stretch', backgroundColor: surface, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 9},
  stepDot: {width: 24, height: 24, borderRadius: 12, backgroundColor: '#E6E6E9', justifyContent: 'center', alignItems: 'center'},
  stepDotActive: {backgroundColor: ink},
  stepNumber: {fontSize: 10, fontWeight: '700', color: muted},
  progressTrack: {height: 3, backgroundColor: '#EAEAEA', borderRadius: 2, alignSelf: 'stretch'},
  progressBar: {height: 3, backgroundColor: ink, borderRadius: 2},
  planOptions: {flexDirection: 'row', gap: 10},
  planOption: {flex: 1, backgroundColor: surface, paddingHorizontal: 13, paddingVertical: 17, borderRadius: 14, borderWidth: 1, borderColor: line, gap: 9},
  planOptionActive: {backgroundColor: ink, borderColor: ink},
  planCaption: {fontSize: 12, fontWeight: '600', color: muted},
  planScore: {fontSize: 27, fontWeight: '700', letterSpacing: -.8, color: ink},
  planUnit: {fontSize: 10, fontWeight: '500'},
  metrics: {flexDirection: 'row', justifyContent: 'space-between', gap: 8},
  metric: {flex: 1, gap: 9},
  metricLabel: {fontSize: 10, lineHeight: 16, color: muted},
  metricValue: {fontSize: 20, lineHeight: 28, fontWeight: '700', color: ink, letterSpacing: -.5},
  metricSuffix: {fontSize: 10, fontWeight: '500', letterSpacing: 0},
  tableTitle: {fontSize: 17, fontWeight: '700', color: ink},
  tableMembers: {flexDirection: 'row', flexWrap: 'wrap', gap: 19},
  tableMember: {gap: 7, alignItems: 'center', width: 78},
  topicDetailInline: {gap: 15, paddingTop: 9},
  profile: {flexDirection: 'row', alignItems: 'center', gap: 17, paddingVertical: 17, marginBottom: 8},
  profileName: {fontSize: 23, lineHeight: 31, fontWeight: '700', color: ink, letterSpacing: -.7, marginBottom: 3},
  profileEdit: {width: 36, height: 36, borderRadius: 11, backgroundColor: surface, alignItems: 'center', justifyContent: 'center'},
  integrationCard: {borderWidth: 1, borderColor: line, borderRadius: 16, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12},
  integrationIcon: {width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: surface},
  playlistRow: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderColor: line},
  sampleRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 11, borderTopWidth: 1, borderColor: line},
  sampleDot: {width: 4, height: 4, borderRadius: 2, backgroundColor: ink, marginTop: 8},
  sampleTitle: {fontSize: 12, lineHeight: 19, fontWeight: '600', color: ink, marginBottom: 4},
});

// Both account and example flows use the Demo2 visual language.
export {Icon, Button, Avatar, Tag, Card, Heading, Section, Empty, Metric, Score, TopicRow, QualityRow, SourceList, s as demoStyles};
