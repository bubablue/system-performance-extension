import * as vscode from "vscode";
import { StatusBarItems } from "./types";
import { StatusBarManager } from "./statusBarManager";
import { SystemMonitor } from "./systemMonitor";
import { SystemResourcesProvider } from "./systemResourcesProvider";

let statusBarItems: StatusBarItems | undefined;
let statusBarManager: StatusBarManager;
let systemMonitor: SystemMonitor;
let provider: SystemResourcesProvider;

export function activate(context: vscode.ExtensionContext) {
  provider = new SystemResourcesProvider(context.extensionUri);
  statusBarManager = new StatusBarManager();
  systemMonitor = new SystemMonitor(statusBarManager, provider);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SystemResourcesProvider.viewType,
      provider
    )
  );

  statusBarItems = statusBarManager.createStatusBarItems();
  systemMonitor.startSystemMonitoring(statusBarItems);

  const showGraphDisposable = vscode.commands.registerCommand(
    "system-performance.showGraph",
    () => {
      vscode.commands.executeCommand("systemResourcesView.focus");
    }
  );

  const toggleGraphDisposable = vscode.commands.registerCommand(
    "system-performance.toggleGraph",
    () => {
      vscode.commands.executeCommand("systemResourcesView.focus");
    }
  );

  const refreshDisposable = vscode.commands.registerCommand(
    "system-performance.refresh",
    () => {
      if (statusBarItems) {
        systemMonitor.startSystemMonitoring(statusBarItems);
      }
    }
  );

  const toggleMonitoringDisposable = vscode.commands.registerCommand(
    "system-performance.toggleMonitoring",
    () => {
      if (statusBarItems) {
        systemMonitor.toggleMonitoring(statusBarItems);
      }
    }
  );

  context.subscriptions.push(
    showGraphDisposable,
    toggleGraphDisposable,
    refreshDisposable,
    toggleMonitoringDisposable
  );

  if (statusBarItems) {
    context.subscriptions.push(
      statusBarItems.cpu,
      statusBarItems.memory,
      statusBarItems.vscodeCpu,
      statusBarItems.vscodeMemory,
      statusBarItems.network,
      statusBarItems.disk,
      statusBarItems.uptime
    );
  }
}

export function deactivate() {
  systemMonitor.stopSystemMonitoring();
  if (statusBarItems) {
    statusBarManager.disposeStatusBarItems(statusBarItems);
  }
}
