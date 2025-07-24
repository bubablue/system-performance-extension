import type { StatusBarItem } from "vscode";

export interface StatusBarItems {
  cpu: StatusBarItem;
  memory: StatusBarItem;
  vscodeCpu: StatusBarItem;
  vscodeMemory: StatusBarItem;
  network: StatusBarItem;
  disk: StatusBarItem;
  uptime: StatusBarItem;
}

export interface HistoryData {
  cpu: number[];
  memory: number[];
  vscodeCpu: number[];
  vscodeMemory: number[];
  networkDown: number[];
  networkUp: number[];
  diskRead: number[];
  diskWrite: number[];
}

export interface SystemData {
  cpu: number;
  activeMemoryPercent: number;
  usedMemoryPercent: number;
  vscodeCpu: number;
  vscodeMemory: number;
  vscodeMemoryPercent: number;
  totalMemory: number;
  usedMemory: number;
  activeMemory: number;
  networkDown: string;
  networkUp: string;
  networkDownPercent: number;
  networkUpPercent: number;
  diskRead: number;
  diskWrite: number;
  uptime: string;
}

export interface WebviewSettings {
  showCpu: boolean;
  showMemory: boolean;
  showVscodeCpu: boolean;
  showVscodeMemory: boolean;
  showNetwork: boolean;
  updateInterval: number;
}
