export type DemoSource = 'youtube' | 'linkedin' | 'demo';
export type DemoEvidence = { id: string; source: DemoSource; title: string; text: string; url?: string };
export type DemoRecord = DemoEvidence & { kind?: string };
export type DemoInterest = {
  id: string; label: string; category: string; score: number; evidence: DemoEvidence[];
  matchType?: 'Exact' | 'Category' | 'Semantic';
};
export type DemoProfile = { id: string; name: string; avatar?: string; color: string; interests: DemoInterest[]; isDemo?: boolean };
export type CommonInterest = {
  id: string; label: string; category: string; score: number; members: string[];
  evidence: { profileId: string; profileName: string; score: number; interestLabels: string[]; sources: DemoEvidence[] }[];
  commonality: number; evidenceStrength: number; matchType: 'Exact' | 'Category' | 'Semantic'; reason: string;
};
export type DemoGroupQuality = { topicStrength: number; memberBalance: number; topicBreadth: number; pairCoverage: number; groupUtility: number };
export type DemoGroup = { id: string; memberIds: string[]; score: number; interests: CommonInterest[]; quality: DemoGroupQuality };
export type DemoPlan = { id: string; label: string; score: number; minGroupScore: number; balance: number; groups: DemoGroup[] };
export type DemoSolverResult = {
  plans: DemoPlan[];
  solver: {
    engine: 'OR-Tools CP-SAT'; status: string; optimal: boolean; timeLimitSeconds: number;
    candidateCount: number; elapsedMs: number; plansFound: number; candidateEnumeration: 'exhaustive' | 'bounded';
    note?: string; terminationStatus?: string; runs?: { status: string; optimal: boolean; wallTimeSeconds: number; objective: number; bestBound: number }[];
  };
};
export type DemoProgress = { stage: string; message: string; progress: number };
export type DemoTopic = { id: string; label: string; category: string; description: string; keywords: string[]; parent?: string };
