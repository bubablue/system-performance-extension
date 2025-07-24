import * as si from "systeminformation";
import * as vscode from "vscode";
import { StatusBarManager } from "./statusBarManager";
import { SystemResourcesProvider } from "./systemResourcesProvider";
import { HistoryData, StatusBarItems, SystemData } from "./types";
import { addToHistory, formatBytes, generateMiniGraph } from "./utils";

export class SystemMonitor {
  private updateInterval: NodeJS.Timeout | undefined;
  private monitoringEnabled = true;
  private isPaused = false;
  private readonly historyData: HistoryData = {
    cpu: [],
    memory: [],
    vscodeCpu: [],
    vscodeMemory: [],
    networkDown: [],
    networkUp: [],
    diskRead: [],
    diskWrite: [],
  };
  private readonly HISTORY_LENGTH = 15;
  private static readonly activeMonitors = new Set<SystemMonitor>();
  private static globalInterval: NodeJS.Timeout | undefined;
  private static lastUpdateTime = 0;
  private static isUpdating = false;
  private static lastSystemData: any = null;
  private readonly statusBarInstances: StatusBarItems[] = [];

  constructor(
    private readonly statusBarManager: StatusBarManager,
    private readonly provider: SystemResourcesProvider
  ) {
    SystemMonitor.activeMonitors.add(this);
  }

  public addStatusBarInstance(statusBarItems: StatusBarItems): void {
    if (!this.statusBarInstances.includes(statusBarItems)) {
      this.statusBarInstances.push(statusBarItems);
    }
  }

  public removeStatusBarInstance(statusBarItems: StatusBarItems): void {
    const index = this.statusBarInstances.indexOf(statusBarItems);
    if (index > -1) {
      this.statusBarInstances.splice(index, 1);
    }
  }

  public startSystemMonitoring(statusBarItems: StatusBarItems): void {
    this.addStatusBarInstance(statusBarItems);

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    const config = vscode.workspace.getConfiguration("systemGraph");
    const updateIntervalMs = config.get("updateInterval", 4000);

    if (!this.isPaused && this.monitoringEnabled) {
      if (SystemMonitor.globalInterval) {
        clearInterval(SystemMonitor.globalInterval);
        SystemMonitor.globalInterval = undefined;
      }

      SystemMonitor.globalInterval = setInterval(async () => {
        if (SystemMonitor.isUpdating) {
          return;
        }

        SystemMonitor.isUpdating = true;
        SystemMonitor.lastUpdateTime = Date.now();

        try {
          const systemData = await SystemMonitor.collectSystemData();
          SystemMonitor.lastSystemData = systemData;

          // Update all status bar instances for all active monitors
          SystemMonitor.activeMonitors.forEach((monitor) => {
            if (monitor.monitoringEnabled && !monitor.isPaused) {
              monitor.statusBarInstances.forEach((items) => {
                monitor.updateWithSystemData(items, systemData);
              });
            }
          });
        } catch (error) {
          console.error("Error in global system monitoring:", error);
        } finally {
          SystemMonitor.isUpdating = false;
        }
      }, updateIntervalMs);

      if (SystemMonitor.lastSystemData) {
        this.updateWithSystemData(statusBarItems, SystemMonitor.lastSystemData);
      } else {
        this.updateSystemInfo(statusBarItems);
      }

      this.statusBarManager.updateStatusBarVisibility(statusBarItems);

      console.log(
        "System monitoring started for monitor. Active monitors:",
        SystemMonitor.activeMonitors.size
      );
    } else {
      console.log(
        "System monitoring not started - isPaused:",
        this.isPaused,
        "monitoringEnabled:",
        this.monitoringEnabled
      );
    }
  }

  public stopSystemMonitoring(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    SystemMonitor.activeMonitors.delete(this);

    if (
      SystemMonitor.activeMonitors.size === 0 &&
      SystemMonitor.globalInterval
    ) {
      clearInterval(SystemMonitor.globalInterval);
      SystemMonitor.globalInterval = undefined;
      SystemMonitor.isUpdating = false;
      SystemMonitor.lastSystemData = null;
      SystemMonitor.lastUpdateTime = 0;
    }
  }

  public toggleMonitoring(_statusBarItems: StatusBarItems): void {
    this.isPaused = !this.isPaused;
    const config = vscode.workspace.getConfiguration("systemGraph");
    config.update(
      "statusBarEnabled",
      !this.isPaused,
      vscode.ConfigurationTarget.Global
    );

    if (this.provider) {
      this.provider.sendMessage({
        command: "updateMonitoringState",
        enabled: !this.isPaused,
        isPaused: this.isPaused,
      });
    }

    if (this.isPaused) {
      vscode.window.showInformationMessage("System monitoring paused");

      this.monitoringEnabled = false;

      this.statusBarInstances.forEach((items) => {
        this.statusBarManager.hideAllStatusBarItems(items);
      });

      const anyActiveMonitor = Array.from(SystemMonitor.activeMonitors).some(
        (monitor) => monitor.monitoringEnabled && !monitor.isPaused
      );

      if (!anyActiveMonitor && SystemMonitor.globalInterval) {
        clearInterval(SystemMonitor.globalInterval);
        SystemMonitor.globalInterval = undefined;
        SystemMonitor.isUpdating = false;
        SystemMonitor.lastSystemData = null;
      }
    } else {
      vscode.window.showInformationMessage("System monitoring resumed");

      this.monitoringEnabled = true;

      if (this.statusBarInstances.length > 0) {
        this.startSystemMonitoring(this.statusBarInstances[0]);
      }

      this.statusBarInstances.forEach((items) => {
        this.statusBarManager.updateStatusBarVisibility(items);
      });
    }
  }

  private async updateSystemInfo(
    statusBarItems: StatusBarItems
  ): Promise<void> {
    if (!statusBarItems || !this.monitoringEnabled) {
      return;
    }

    try {
      const [cpu, memory, processes, networkStats, disksIO, time] =
        await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.processes(),
          si.networkStats(),
          si.disksIO(),
          si.time(),
        ]);

      const vscodeProcesses = processes.list.filter(
        (p) =>
          p.name.toLowerCase().includes("code") ||
          p.command.toLowerCase().includes("code") ||
          p.name.toLowerCase().includes("electron") ||
          p.name.toLowerCase().includes("vscode")
      );

      const vscodeCpu = vscodeProcesses.reduce(
        (sum, p) => sum + (p.cpu || 0),
        0
      );
      const vscodeMemory = vscodeProcesses.reduce(
        (sum, p) => sum + (p.mem || 0),
        0
      );
      const vscodeMemoryMB =
        (vscodeMemory / 100) * (memory.total / (1024 * 1024));

      const activeMemory =
        memory.active || memory.used - (memory.buffcache || 0);
      const memoryPercent = Math.round((activeMemory / memory.total) * 100);

      const cpuPercent = Math.round(cpu.currentLoad);

      const totalProcessCpu = processes.list.reduce(
        (sum, p) => sum + (p.cpu || 0),
        0
      );

      const vscodeCpuRelative =
        totalProcessCpu > 0
          ? Math.round((vscodeCpu / totalProcessCpu) * 100)
          : 0;
      const vscodeCpuPercent = Math.min(vscodeCpuRelative, 100);

      const vscodeMemoryMBRounded = Math.round(vscodeMemoryMB);

      const totalRx = networkStats.reduce(
        (sum: number, iface: any) => sum + (iface.rx_sec || 0),
        0
      );
      const totalTx = networkStats.reduce(
        (sum: number, iface: any) => sum + (iface.tx_sec || 0),
        0
      );

      const totalReadSec = disksIO.rIO || 0;
      const totalWriteSec = disksIO.wIO || 0;

      addToHistory(this.historyData, "cpu", cpuPercent, this.HISTORY_LENGTH);
      addToHistory(
        this.historyData,
        "memory",
        memoryPercent,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "vscodeCpu",
        vscodeCpuPercent,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "vscodeMemory",
        vscodeMemoryMBRounded,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "networkDown",
        totalRx / 1024,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "networkUp",
        totalTx / 1024,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "diskRead",
        totalReadSec,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "diskWrite",
        totalWriteSec,
        this.HISTORY_LENGTH
      );

      this.updateStatusBarItems(statusBarItems, {
        cpuPercent,
        memoryPercent,
        vscodeCpuPercent,
        vscodeMemoryMBRounded,
        totalRx,
        totalTx,
        totalReadSec,
        totalWriteSec,
        uptimeSeconds: time.uptime || 0,
      });

      if (this.provider) {
        this.sendDataToProvider({
          cpu,
          memory,
          activeMemory,
          vscodeCpu,
          vscodeMemoryMBRounded,
          totalRx,
          totalTx,
          totalReadSec,
          totalWriteSec,
          uptimeSeconds: time.uptime || 0,
        });
      }
    } catch (error) {
      console.error("Error getting system info:", error);
    }
  }

  private updateStatusBarItems(
    statusBarItems: StatusBarItems,
    data: {
      cpuPercent: number;
      memoryPercent: number;
      vscodeCpuPercent: number;
      vscodeMemoryMBRounded: number;
      totalRx: number;
      totalTx: number;
      totalReadSec: number;
      totalWriteSec: number;
      uptimeSeconds: number;
    }
  ): void {
    statusBarItems.cpu.text = `$(pulse) ${data.cpuPercent}%`;
    statusBarItems.cpu.tooltip = `System CPU Usage: ${
      data.cpuPercent
    }%\n${generateMiniGraph(
      this.historyData.cpu
    )}\nClick to focus System Resources view`;
    statusBarItems.cpu.color = undefined;

    statusBarItems.memory.text = `$(database) ${data.memoryPercent}%`;
    statusBarItems.memory.tooltip = `System Memory Usage (Active): ${
      data.memoryPercent
    }%\n${generateMiniGraph(
      this.historyData.memory
    )}\nClick to focus System Resources view`;
    statusBarItems.memory.color = undefined;

    statusBarItems.vscodeCpu.text = `$(code) ${data.vscodeCpuPercent}%`;
    statusBarItems.vscodeCpu.tooltip = `VS Code CPU Usage: ${
      data.vscodeCpuPercent
    }% of all process CPU\n${generateMiniGraph(
      this.historyData.vscodeCpu
    )}\nClick to focus System Resources view`;
    statusBarItems.vscodeCpu.color = undefined;

    statusBarItems.vscodeMemory.text = `$(gear) ${data.vscodeMemoryMBRounded}MB`;
    statusBarItems.vscodeMemory.tooltip = `VS Code Memory Usage: ${
      data.vscodeMemoryMBRounded
    }MB\n${generateMiniGraph(
      this.historyData.vscodeMemory,
      4000
    )}\nClick to focus System Resources view`;
    statusBarItems.vscodeMemory.color = undefined;

    statusBarItems.network.text = `$(globe) ${formatBytes(
      data.totalRx
    )}↓${formatBytes(data.totalTx)}↑`;
    statusBarItems.network.tooltip = `Network Usage\nDown: ${formatBytes(
      data.totalRx
    )}/s ↓${generateMiniGraph(
      this.historyData.networkDown,
      1000
    )}\nUp: ${formatBytes(data.totalTx)}/s ↑${generateMiniGraph(
      this.historyData.networkUp,
      1000
    )}\nClick to focus System Resources view`;
    statusBarItems.network.color = undefined;

    statusBarItems.disk.text = `$(save) ${formatBytes(
      data.totalReadSec
    )}R/${formatBytes(data.totalWriteSec)}W`;
    statusBarItems.disk.tooltip = `Disk Usage\nRead: ${formatBytes(
      data.totalReadSec
    )}/s R${generateMiniGraph(
      this.historyData.diskRead,
      100
    )}\nWrite: ${formatBytes(data.totalWriteSec)}/s W${generateMiniGraph(
      this.historyData.diskWrite,
      100
    )}\nClick to focus System Resources view`;
    statusBarItems.disk.color = undefined;

    const uptimeHours = Math.floor(data.uptimeSeconds / 3600);
    const uptimeDays = Math.floor(uptimeHours / 24);
    let uptimeText;
    if (uptimeDays > 0) {
      uptimeText = `${uptimeDays}d${uptimeHours % 24}h`;
    } else if (uptimeHours > 0) {
      uptimeText = `${uptimeHours}h${Math.floor(
        (data.uptimeSeconds % 3600) / 60
      )}m`;
    } else {
      uptimeText = `${Math.floor(data.uptimeSeconds / 60)}m`;
    }
    statusBarItems.uptime.text = `$(clock) ${uptimeText}`;
    statusBarItems.uptime.tooltip = `System Uptime: ${uptimeText}`;
    statusBarItems.uptime.color = undefined;
  }

  private sendDataToProvider(data: {
    cpu: any;
    memory: any;
    activeMemory: number;
    vscodeCpu: number;
    vscodeMemoryMBRounded: number;
    totalRx: number;
    totalTx: number;
    totalReadSec: number;
    totalWriteSec: number;
    uptimeSeconds: number;
  }): void {
    const activeMemoryPercent = (data.activeMemory / data.memory.total) * 100;
    const usedMemoryPercent = (data.memory.used / data.memory.total) * 100;
    const vscodeMemoryPercent =
      ((data.vscodeMemoryMBRounded * 1024 * 1024) / data.memory.total) * 100;

    const maxNetworkSpeed = 10 * 1024 * 1024;
    const networkDownPercent = Math.min(
      (data.totalRx / maxNetworkSpeed) * 100,
      100
    );
    const networkUpPercent = Math.min(
      (data.totalTx / maxNetworkSpeed) * 100,
      100
    );

    const uptimeHours = Math.floor(data.uptimeSeconds / 3600);
    const uptimeDays = Math.floor(uptimeHours / 24);
    let uptimeText;
    if (uptimeDays > 0) {
      uptimeText = `${uptimeDays}d${uptimeHours % 24}h`;
    } else if (uptimeHours > 0) {
      uptimeText = `${uptimeHours}h${Math.floor(
        (data.uptimeSeconds % 3600) / 60
      )}m`;
    } else {
      uptimeText = `${Math.floor(data.uptimeSeconds / 60)}m`;
    }

    const systemData: SystemData = {
      cpu: data.cpu.currentLoad,
      activeMemoryPercent: activeMemoryPercent,
      usedMemoryPercent: usedMemoryPercent,
      vscodeCpu: Math.min(data.vscodeCpu, 100),
      vscodeMemory: data.vscodeMemoryMBRounded,
      vscodeMemoryPercent: vscodeMemoryPercent,
      totalMemory: data.memory.total,
      usedMemory: data.memory.used,
      activeMemory: data.activeMemory,
      networkDown: formatBytes(data.totalRx),
      networkUp: formatBytes(data.totalTx),
      networkDownPercent: networkDownPercent,
      networkUpPercent: networkUpPercent,
      diskRead: data.totalReadSec,
      diskWrite: data.totalWriteSec,
      uptime: uptimeText,
    };

    this.provider.updateData(systemData);
  }

  public isPausedState(): boolean {
    return this.isPaused;
  }

  public isMonitoringEnabled(): boolean {
    return this.monitoringEnabled;
  }

  private updateWithSystemData(
    statusBarItems: StatusBarItems,
    systemData: any
  ): void {
    if (!statusBarItems || !this.monitoringEnabled || !systemData) {
      return;
    }

    try {
      const {
        cpu,
        memory,
        processes,
        networkStats,
        disksIO,
        time,
        vscodeProcesses,
      } = systemData;

      const vscodeCpu = vscodeProcesses.reduce(
        (sum: number, p: any) => sum + (p.cpu || 0),
        0
      );
      const vscodeMemory = vscodeProcesses.reduce(
        (sum: number, p: any) => sum + (p.mem || 0),
        0
      );
      const vscodeMemoryMB =
        (vscodeMemory / 100) * (memory.total / (1024 * 1024));

      const activeMemory =
        memory.active || memory.used - (memory.buffcache || 0);
      const memoryPercent = Math.round((activeMemory / memory.total) * 100);

      const cpuPercent = Math.round(cpu.currentLoad);

      // Calculate total CPU usage of all processes
      const totalProcessCpu = processes.list.reduce(
        (sum: number, p: any) => sum + (p.cpu || 0),
        0
      );

      // Calculate VS Code CPU as percentage of all process CPU usage
      const vscodeCpuRelative =
        totalProcessCpu > 0
          ? Math.round((vscodeCpu / totalProcessCpu) * 100)
          : 0;
      const vscodeCpuPercent = Math.min(vscodeCpuRelative, 100);

      const vscodeMemoryMBRounded = Math.round(vscodeMemoryMB);

      const totalRx = networkStats.reduce(
        (sum: number, iface: any) => sum + (iface.rx_sec || 0),
        0
      );
      const totalTx = networkStats.reduce(
        (sum: number, iface: any) => sum + (iface.tx_sec || 0),
        0
      );

      const totalReadSec = disksIO.rIO || 0;
      const totalWriteSec = disksIO.wIO || 0;

      addToHistory(this.historyData, "cpu", cpuPercent, this.HISTORY_LENGTH);
      addToHistory(
        this.historyData,
        "memory",
        memoryPercent,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "vscodeCpu",
        vscodeCpuPercent,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "vscodeMemory",
        vscodeMemoryMBRounded,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "networkDown",
        totalRx / 1024,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "networkUp",
        totalTx / 1024,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "diskRead",
        totalReadSec,
        this.HISTORY_LENGTH
      );
      addToHistory(
        this.historyData,
        "diskWrite",
        totalWriteSec,
        this.HISTORY_LENGTH
      );

      this.updateStatusBarItems(statusBarItems, {
        cpuPercent,
        memoryPercent,
        vscodeCpuPercent,
        vscodeMemoryMBRounded,
        totalRx,
        totalTx,
        totalReadSec,
        totalWriteSec,
        uptimeSeconds: time.uptime || 0,
      });

      if (this.provider) {
        this.sendDataToProvider({
          cpu,
          memory,
          activeMemory,
          vscodeCpu,
          vscodeMemoryMBRounded,
          totalRx,
          totalTx,
          totalReadSec,
          totalWriteSec,
          uptimeSeconds: time.uptime || 0,
        });
      }
    } catch (error) {
      console.error("Error updating system info with shared data:", error);
    }
  }

  public dispose(): void {
    this.stopSystemMonitoring();
  }

  private static async collectSystemData(): Promise<any> {
    try {
      const [cpu, memory, processes, networkStats, disksIO, time] =
        await Promise.all([
          si.currentLoad(),
          si.mem(),
          si.processes(),
          si.networkStats(),
          si.disksIO(),
          si.time(),
        ]);

      const vscodeProcesses = processes.list.filter(
        (p) =>
          p.name.toLowerCase().includes("code") ||
          p.command.toLowerCase().includes("code") ||
          p.name.toLowerCase().includes("electron") ||
          p.name.toLowerCase().includes("vscode")
      );

      return {
        cpu,
        memory,
        processes,
        networkStats,
        disksIO,
        time,
        vscodeProcesses,
      };
    } catch (error) {
      console.error("Error collecting system data:", error);
      return null;
    }
  }
}
