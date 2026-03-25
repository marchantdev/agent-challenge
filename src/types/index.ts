export interface Protocol {
  name: string;
  slug: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  category: string;
  chains: string[];
  audits?: number;
}

export interface Exploit {
  name: string;
  date: string;
  amount: number;
  chain: string;
  technique: string;
  category?: string;
}

export interface ContractInfo {
  address: string;
  chain: string;
  balance: string;
  txCount: number;
  verified: boolean;
  contractName: string;
  isProxy: boolean;
  implementation?: string;
  compilerVersion?: string;
  deployer?: string;
  deployDate?: string;
}

export interface RiskAssessment {
  protocol: string;
  tvl: number;
  categories: RiskCategory[];
  overallRisk: "Critical" | "High" | "Medium" | "Low";
}

export interface RiskCategory {
  name: string;
  level: "Critical" | "High" | "Medium" | "Low" | "Unknown";
  detail: string;
}

export interface NosanaNetworkInfo {
  totalNodes: number;
  activeJobs: number;
  gpuTypes: string[];
}
