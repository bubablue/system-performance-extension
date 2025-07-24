import * as vscode from "vscode";
import { StatusBarItems } from "./types";

export class StatusBarManager {
  private statusBarItems: StatusBarItems | undefined;

  public createStatusBarItems(): StatusBarItems {
    this.statusBarItems = {
      cpu: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 106),
      memory: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 105),
      vscodeCpu: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 104),
      vscodeMemory: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103),
      network: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102),
      disk: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101),
      uptime: vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100),
    };

    this.statusBarItems.cpu.text = "$(pulse) 0%";
    this.statusBarItems.cpu.tooltip = "System CPU Usage - Click to focus System Resources view";
    this.statusBarItems.cpu.command = "system-performance.toggleGraph";

    this.statusBarItems.memory.text = "$(database) 0%";
    this.statusBarItems.memory.tooltip = "System Memory Usage (Active)";
    this.statusBarItems.memory.command = "system-performance.toggleGraph";

    this.statusBarItems.vscodeCpu.text = "$(code) 0%";
    this.statusBarItems.vscodeCpu.tooltip = "VS Code CPU Usage";
    this.statusBarItems.vscodeCpu.command = "system-performance.toggleGraph";

    this.statusBarItems.vscodeMemory.text = "$(gear) 0MB";
    this.statusBarItems.vscodeMemory.tooltip = "VS Code Memory Usage";
    this.statusBarItems.vscodeMemory.command = "system-performance.toggleGraph";

    this.statusBarItems.network.text = "$(globe) 0↓0↑";
    this.statusBarItems.network.tooltip = "Network Usage (Down/Up)";
    this.statusBarItems.network.command = "system-performance.toggleGraph";

    this.statusBarItems.disk.text = "$(save) 0R/0W";
    this.statusBarItems.disk.tooltip = "Disk Usage (Read/Write)";
    this.statusBarItems.disk.command = "system-performance.toggleGraph";

    this.statusBarItems.uptime.text = "$(clock) --";
    this.statusBarItems.uptime.tooltip = "System Uptime";
    this.statusBarItems.uptime.command = "system-performance.toggleGraph";

    Object.values(this.statusBarItems).forEach((item) => item.show());

    return this.statusBarItems;
  }

  public updateStatusBarVisibility(statusBarItems: StatusBarItems): void {
    if (!statusBarItems) {
      return;
    }

    const config = vscode.workspace.getConfiguration("systemGraph");

    if (config.get("showCpu", true)) {
      statusBarItems.cpu.show();
    } else {
      statusBarItems.cpu.hide();
    }

    if (config.get("showMemory", true)) {
      statusBarItems.memory.show();
    } else {
      statusBarItems.memory.hide();
    }

    if (config.get("showVscodeCpu", true)) {
      statusBarItems.vscodeCpu.show();
    } else {
      statusBarItems.vscodeCpu.hide();
    }

    if (config.get("showVscodeMemory", true)) {
      statusBarItems.vscodeMemory.show();
    } else {
      statusBarItems.vscodeMemory.hide();
    }

    if (config.get("showNetwork", true)) {
      statusBarItems.network.show();
    } else {
      statusBarItems.network.hide();
    }

    statusBarItems.disk.show();
    statusBarItems.uptime.show();
  }

  public hideAllStatusBarItems(statusBarItems: StatusBarItems): void {
    if (statusBarItems) {
      Object.values(statusBarItems).forEach((item) => {
        item.hide();
      });
    }
  }

  public disposeStatusBarItems(statusBarItems: StatusBarItems): void {
    if (statusBarItems) {
      Object.values(statusBarItems).forEach((item) => item.dispose());
    }
  }

  public getStatusBarItems(): StatusBarItems | undefined {
    return this.statusBarItems;
  }
}
