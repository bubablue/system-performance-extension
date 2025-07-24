import * as vscode from "vscode";
import { StatusBarItems } from "./types";
import { StatusBarManager } from "./statusBarManager";
import { SystemMonitor } from "./systemMonitor";
import { SystemResourcesProvider } from "./systemResourcesProvider";

let statusBarItems: StatusBarItems | undefined;
let statusBarManager: StatusBarManager;
let systemMonitor: SystemMonitor;
let provider: SystemResourcesProvider;

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
  if (systemMonitor) {
    systemMonitor.dispose();
  }
  if (statusBarItems) {
    statusBarManager.disposeStatusBarItems(statusBarItems);
  }
}
