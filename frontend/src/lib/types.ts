export interface Protocol {
  name: string;
  slug: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  category: string;
  chains: string[];
  logo?: string;
}

export interface Exploit {
  name: string;
  date: string;
  amount: number;
  chain: string;
  technique: string;
}

export interface RiskScore {
  category: string;
  score: number; // 0-10
  detail: string;
}

export interface ContractInfo {
  address: string;
  chain: string;
  balance: string;
  txCount: number;
  verified: boolean;
  contractName: string;
  deployer?: string;
  age?: string;
  isProxy?: boolean;
  implementation?: string;
  compilerVersion?: string;
}

export interface ScanResult {
  contract: ContractInfo;
  riskScores: RiskScore[];
  recommendations: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  timestamp: number;
  action?: string;
}

export interface NosanaHealth {
  status: "healthy" | "degraded" | "offline";
  uptimeSeconds: number;
  inferenceLatencyMs: number;
  actionsTriggered: number;
  nosanaNode: string;
  model: string;
  lastHeartbeat: string;
}

export interface NosanaMetrics {
  requestsTotal: number;
  requestsByAction: Record<string, number>;
  avgResponseTimeMs: number;
  errorRate: number;
  protocolsMonitored: number;
}

export interface NosanaNetwork {
  totalNodes: number;
  activeJobs: number;
  gpuTypes: string[];
  networkVersion: string;
}

export interface EvaluatorStats {
  totalResponses: number;
  securityScoresIncluded: number;
  recommendationsIncluded: number;
  sourcesAttributed: number;
  evaluator: string;
}

export type View = "dashboard" | "chat" | "scanner" | "protocols" | "nosana";

export type RiskLevel = "Critical" | "High" | "Medium" | "Low" | "Info";
