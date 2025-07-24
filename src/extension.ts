import * as vscode from "vscode";
import { StatusBarItems } from "./types";
import { StatusBarManager } from "./statusBarManager";
import { SystemMonitor } from "./systemMonitor";
import { SystemResourcesProvider } from "./systemResourcesProvider";

interface GlobalExtensionState {
  systemMonitor: SystemMonitor | undefined;
  provider: SystemResourcesProvider | undefined;
  windowInstances: Map<string, {
    statusBarItems: StatusBarItems;
    statusBarManager: StatusBarManager;
  }>;
  instanceCount: number;
}

const GLOBAL_STATE_KEY = Symbol.for('system-performance-extension.globalState');
const globalThis_ = globalThis as any;

function getGlobalState(): GlobalExtensionState {
  if (!globalThis_[GLOBAL_STATE_KEY]) {
    globalThis_[GLOBAL_STATE_KEY] = {
      systemMonitor: undefined,
      provider: undefined,
      windowInstances: new Map(),
      instanceCount: 0,
    };
  }
  return globalThis_[GLOBAL_STATE_KEY];
}

let statusBarItems: StatusBarItems | undefined;
let statusBarManager: StatusBarManager;
let windowId: string;

async function requestSystemPermissions(context: vscode.ExtensionContext): Promise<boolean> {
  const permissionsGranted = context.globalState.get<boolean>('systemPermissionsGranted');
  
  if (permissionsGranted === true) {
    return true;
  }
  
  if (permissionsGranted === false) {
    return false;
  }
  
  const result = await vscode.window.showInformationMessage(
    "System Performance Extension needs access to system resources (CPU, memory, network) to provide monitoring functionality. This permission is only requested once.",
    { modal: true },
    "Grant Access",
    "Deny"
  );
  
  const granted = result === "Grant Access";
  
  await context.globalState.update('systemPermissionsGranted', granted);
  
  return granted;
}

export function activate(context: vscode.ExtensionContext) {
  requestSystemPermissions(context).then((granted) => {
    if (!granted) {
      vscode.window.showErrorMessage(
        "System Performance Extension requires system access permissions to monitor CPU, memory, and network usage. You can enable this later in the extension settings or by reinstalling the extension."
      );
      return;
    }

    const globalState = getGlobalState();
    globalState.instanceCount++;
    
    windowId = `window-${Date.now()}-${Math.random()}`;
    
    statusBarManager = new StatusBarManager();
    statusBarItems = statusBarManager.createStatusBarItems();
    
    if (!globalState.systemMonitor) {
      globalState.provider = new SystemResourcesProvider(context.extensionUri);
      globalState.systemMonitor = new SystemMonitor(statusBarManager, globalState.provider);
    } else {
      globalState.systemMonitor.addStatusBarInstance(statusBarItems);
    }
    
    globalState.windowInstances.set(windowId, {
      statusBarItems,
      statusBarManager
    });

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        SystemResourcesProvider.viewType,
        globalState.provider!
      )
    );

    globalState.systemMonitor.startSystemMonitoring(statusBarItems);

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
          const globalState = getGlobalState();
          globalState.systemMonitor?.startSystemMonitoring(statusBarItems);
        }
      }
    );

    const toggleMonitoringDisposable = vscode.commands.registerCommand(
      "system-performance.toggleMonitoring",
      () => {
        if (statusBarItems) {
          const globalState = getGlobalState();
          globalState.systemMonitor?.toggleMonitoring(statusBarItems);
        }
      }
    );

    const resetPermissionsDisposable = vscode.commands.registerCommand(
      "system-performance.resetPermissions",
      async () => {
        await context.globalState.update('systemPermissionsGranted', undefined);
        vscode.window.showInformationMessage(
          "System permissions have been reset. Please reload the window to be prompted again.",
          "Reload Window"
        ).then((selection) => {
          if (selection === "Reload Window") {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
          }
        });
      }
    );

    context.subscriptions.push(
      showGraphDisposable,
      toggleGraphDisposable,
      refreshDisposable,
      toggleMonitoringDisposable,
      resetPermissionsDisposable
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
  });
}

export function deactivate() {
  const globalState = getGlobalState();
  
  if (globalState.systemMonitor && statusBarItems) {
    globalState.systemMonitor.removeStatusBarInstance(statusBarItems);
  }
  
  if (windowId) {
    globalState.windowInstances.delete(windowId);
  }
  
  globalState.instanceCount--;
  
  if (statusBarItems) {
    statusBarManager.disposeStatusBarItems(statusBarItems);
    statusBarItems = undefined;
  }
  
  if (globalState.instanceCount <= 0) {
    if (globalState.systemMonitor) {
      globalState.systemMonitor.dispose();
      globalState.systemMonitor = undefined;
    }
    globalState.provider = undefined;
    globalState.windowInstances.clear();
  }
}
