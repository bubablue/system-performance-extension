import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SystemData, WebviewSettings } from "./types";

export class SystemResourcesProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "systemResourcesView";
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "toggleMonitoring":
            vscode.commands.executeCommand(
              "system-performance.toggleMonitoring"
            );
            break;
          case "getCurrentSettings":
            this.sendCurrentSettings();
            break;
          case "saveSettings":
            this.saveSettings(message.settings);
            break;
          case "restoreDefaults":
            this.restoreDefaultSettings();
            break;
        }
      },
      undefined,
      []
    );
  }

  public updateData(data: SystemData) {
    if (this._view) {
      this._view.webview.postMessage({
        command: "updateData",
        ...data,
      });
    }
  }

  public sendMessage(message: any) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private sendCurrentSettings() {
    if (this._view) {
      const config = vscode.workspace.getConfiguration("systemGraph");
      const settings: WebviewSettings = {
        showCpu: config.get("showCpu", true),
        showMemory: config.get("showMemory", true),
        showVscodeCpu: config.get("showVscodeCpu", true),
        showVscodeMemory: config.get("showVscodeMemory", true),
        showNetwork: config.get("showNetwork", true),
        updateInterval: config.get("updateInterval", 2000),
      };
      this._view.webview.postMessage({
        command: "currentSettings",
        settings: settings,
      });
    }
  }

  private async saveSettings(settings: WebviewSettings) {
    const config = vscode.workspace.getConfiguration("systemGraph");

    await config.update(
      "showCpu",
      settings.showCpu,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "showMemory",
      settings.showMemory,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "showVscodeCpu",
      settings.showVscodeCpu,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "showVscodeMemory",
      settings.showVscodeMemory,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "showNetwork",
      settings.showNetwork,
      vscode.ConfigurationTarget.Global
    );
    await config.update(
      "updateInterval",
      settings.updateInterval,
      vscode.ConfigurationTarget.Global
    );

    vscode.window.showInformationMessage("Settings saved successfully!");
  }

  private async restoreDefaultSettings() {
    const config = vscode.workspace.getConfiguration("systemGraph");

    await config.update("showCpu", true, vscode.ConfigurationTarget.Global);
    await config.update("showMemory", true, vscode.ConfigurationTarget.Global);
    await config.update("showVscodeCpu", true, vscode.ConfigurationTarget.Global);
    await config.update("showVscodeMemory", true, vscode.ConfigurationTarget.Global);
    await config.update("showNetwork", true, vscode.ConfigurationTarget.Global);
    await config.update(
      "updateInterval",
      2000,
      vscode.ConfigurationTarget.Global
    );

    this.sendCurrentSettings();
    vscode.window.showInformationMessage("Settings restored to defaults!");
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const cssPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview.css")
    );
    const jsPath = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "src", "webview.js")
    );

    const htmlPath = path.join(
      this._extensionUri.fsPath,
      "src",
      "webview.html"
    );
    let htmlContent = fs.readFileSync(htmlPath, "utf8");

    htmlContent = htmlContent.replace("{{cssPath}}", cssPath.toString());
    htmlContent = htmlContent.replace("{{jsPath}}", jsPath.toString());

    return htmlContent;
  }
}
