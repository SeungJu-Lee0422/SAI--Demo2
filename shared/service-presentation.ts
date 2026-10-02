import {interestScore, type GroupPlan} from './grouping.ts';
import type {Match, Profile, Interest} from './matching.ts';
import type {CommonInterest, DemoEvidence, DemoPlan, DemoProfile} from './demo-types.ts';

const normalizedPercent = (value: number) => Math.round(value * 100);
const matchType = (kind: Match['kind']): CommonInterest['matchType'] => kind === 'exact' ? 'Exact' : kind === 'related' ? 'Category' : 'Semantic';

export function toEvidence(interest: Interest): DemoEvidence {
  return {
    id: interest.id,
    source: interest.source?.kind ?? 'manual',
    title: interest.label,
    text: interest.source?.detail || interest.source?.label || '직접 등록한 관심사',
    ...(interest.source?.url ? {url: interest.source.url} : {}),
  };
}

export function toDemoProfile(profile: Profile): DemoProfile {
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    color: profile.color,
    interests: profile.interests.map(interest => ({
      id: interest.id,
      label: interest.label,
      category: interest.category,
      score: Math.round((interest as Interest & {score?: number}).score ?? 0),
      evidence: [toEvidence(interest)],
    })),
  };
}

export function toCommonInterest(match: Match, people: Profile[]): CommonInterest {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const members = match.members.filter(id => peopleById.has(id));
  const score = interestScore({...match, members}, people);
  const referenceStrength = normalizedPercent(match.kind === 'exact' ? 1 : match.similarity ?? .6);
  return {
    id: match.id,
    label: match.label,
    category: match.category,
    score,
    members,
    evidence: members.map(profileId => {
      const person = peopleById.get(profileId)!;
      const rows = match.evidence.filter(item => item.profile === profileId);
      return {
        profileId,
        profileName: person.name,
        score: rows.length ? referenceStrength : 0,
        interestLabels: [...new Set(rows.map(item => item.label))],
        sources: rows.map((item, index) => ({
          id: `${match.id}-${profileId}-${index}`,
          source: item.source?.kind ?? 'manual',
          title: item.label,
          text: item.source?.detail || item.source?.label || '직접 등록한 관심사',
          ...(item.source?.url ? {url: item.source.url} : {}),
        })),
      };
    }),
    commonality: Math.round(100 * members.length / Math.max(1, people.length)),
    evidenceStrength: referenceStrength,
    matchType: matchType(match.kind),
    reason: match.reason,
  };
}

export function toDemoPlan(plan: GroupPlan, people: Profile[]): DemoPlan {
  const modeLabels: Record<GroupPlan['mode'], string> = {
    cohesion: '전체 대화 가능성 우선',
    balance: '그룹 간 균형 우선',
    coverage: '다양한 사람과의 연결 우선',
  };
  const signature = plan.groups.map(group => group.ids.join('-')).join('_');
  return {
    id: `${plan.mode}-${signature}`,
    label: modeLabels[plan.mode],
    score: Math.round(plan.score),
    minGroupScore: Math.round(plan.minScore),
    balance: Math.max(0, 100 - Math.round(plan.range)),
    unassigned: plan.unassigned.slice(),
    solverStatus: plan.solverStatus,
    candidateScope: plan.candidateScope,
    algorithm: plan.algorithm,
    candidateCount: plan.candidateCount,
    groups: plan.groups.map((group, index) => {
      const members = people.filter(person => group.ids.includes(person.id));
      const metrics = group.metrics;
      return {
        id: `${plan.mode}-${index + 1}-${group.ids.join('-')}`,
        memberIds: group.ids,
        score: normalizedPercent(group.score),
        interests: group.interests.map(match => toCommonInterest(match, members)),
        quality: {
          topicStrength: normalizedPercent(metrics?.topicStrength ?? 0),
          memberBalance: normalizedPercent(metrics?.memberBalance ?? 0),
          topicBreadth: normalizedPercent(metrics?.topicBreadth ?? 0),
          pairCoverage: normalizedPercent(metrics?.pairCoverage ?? 0),
          groupUtility: normalizedPercent(metrics?.utility ?? 0),
        },
      };
    }),
  };
}
