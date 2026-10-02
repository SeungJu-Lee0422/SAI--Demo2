import {Platform} from 'react-native';
import type {CommonInterest, DemoInterest, DemoProfile, DemoPlan as GroupPlan} from '../shared/demo-types';

const API = (process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web' ? '' : 'http://localhost:8788')).replace(/\/$/, '');

export type DemoImport = {
  summary: Record<string, string | number | boolean | null>;
  samples: Array<{id?: string; title: string; text?: string; url?: string; source?: string}>;
};
export type SavedDemoGroup = {id: string; name: string; createdAt?: string; plan: GroupPlan; people?: DemoProfile[]};
export type DemoState = {
  me: DemoProfile;
  people: DemoProfile[];
  groups: SavedDemoGroup[];
  integrations: {youtube: {configured: boolean; connected: boolean; profile?: {name: string; picture?: string}}; linkedin: {configured: boolean; connected: boolean; profile?: {name: string; picture?: string}}};
  imports: {youtube: DemoImport | null; linkedin: DemoImport | null};
};
export type Playlist = {id: string; title: string; itemCount: number};
export type Optimization = {plans: GroupPlan[]; solver: {engine: string; status: string; optimal: boolean; candidateCount: number; elapsedMs: number; plansFound: number; candidateEnumeration: string; note?: string}};
export type Job = {id: string; status: 'queued' | 'running' | 'complete' | 'error'; message: string; progress?: number; result?: {interests: CommonInterest[] | DemoInterest[]} | Optimization; error?: string};

export async function demoRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API}/api/demo${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: {'Content-Type': 'application/json'},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    signal,
  });
  const value = await response.json().catch(() => ({error: '서버 응답을 읽지 못했어요.'}));
  if (!response.ok) throw new Error(value.error || '요청을 처리하지 못했어요. 다시 시도해주세요.');
  return value as T;
}

export function getDemoState(signal?: AbortSignal) {return demoRequest<DemoState>('/state', undefined, signal);}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {reject(new Error('분석을 중단했어요.')); return;}
    const abort = () => {clearTimeout(timer); reject(new Error('분석을 중단했어요.'));};
    const timer = setTimeout(() => {signal.removeEventListener('abort', abort); resolve();}, ms);
    signal.addEventListener('abort', abort, {once: true});
  });
}

export async function runDemoJob(
  input: {kind: 'profile' | 'common' | 'groups'; profileIds?: string[]; tableSize?: number},
  signal: AbortSignal,
  onProgress: (job: Job) => void,
): Promise<Job> {
  const started = await demoRequest<{id: string}>('/jobs', input, signal);
  while (!signal.aborted) {
    const job = await demoRequest<Job>(`/jobs/${encodeURIComponent(started.id)}`, undefined, signal);
    onProgress(job);
    if (job.status === 'error') throw new Error(job.error || job.message || '분석 중 문제가 발생했어요.');
    if (job.status === 'complete') return job;
    await pause(1000, signal);
  }
  throw new Error('분석을 중단했어요.');
}

export function chooseProfileDocument(): Promise<{fileBase64: string; fileName: string} | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.txt,application/pdf,text/plain';
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {resolve(null); return;}
      if (!/\.(pdf|txt)$/i.test(file.name)) {reject(new Error('PDF 또는 TXT 파일을 선택해주세요.')); return;}
      if (file.size > 6 * 1024 * 1024) {reject(new Error('6MB 이하의 프로필 파일을 선택해주세요.')); return;}
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('파일을 읽지 못했어요. 다시 선택해주세요.'));
      reader.onload = () => resolve({fileName: file.name, fileBase64: String(reader.result).split(',')[1]});
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
