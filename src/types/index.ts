export interface Protocol {
  name: string;
  slug: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
  category: string;
  chains: string[];
}

export interface Exploit {
  name: string;
  date: string;
  amount: number;
  chain: string;
  technique: string;
}

export interface ContractInfo {
  address: string;
  chain: string;
  balance: string;
  txCount: number;
  verified: boolean;
  contractName: string;
  isProxy: boolean;
}
