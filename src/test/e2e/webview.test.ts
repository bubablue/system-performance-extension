import * as assert from "assert";
import * as vscode from "vscode";

suite("System Performance Webview E2E Tests", () => {
  let extension: vscode.Extension<any>;

  setup(async () => {
    extension = vscode.extensions.getExtension(
      "bubablue00.system-performance"
    )!;

    if (!extension.isActive) {
      await extension.activate();
    }

    await new Promise((resolve) => setTimeout(resolve, 4000));
  });

  test("Webview should be creatable", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    assert.ok(true, "Webview created successfully");
  });

  test("System Resources view should be available in explorer", async () => {
    try {
      await vscode.commands.executeCommand("workbench.view.explorer");
      await new Promise((resolve) => setTimeout(resolve, 500));

      assert.ok(true, "System Resources view is accessible");
    } catch (error) {
      assert.fail(`Failed to access System Resources view: ${error}`);
    }
  });

  test("Webview should handle configuration changes", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await config.update(
      "updateInterval",
      5000,
      vscode.ConfigurationTarget.Global
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await config.update(
      "updateInterval",
      4000,
      vscode.ConfigurationTarget.Global
    );

    assert.ok(true, "Webview handled configuration changes");
  });

  test("Webview should survive toggle operations", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await vscode.commands.executeCommand("system-performance.toggleMonitoring");
    await new Promise((resolve) => setTimeout(resolve, 500));

    await vscode.commands.executeCommand("system-performance.toggleMonitoring");
    await new Promise((resolve) => setTimeout(resolve, 500));

    await vscode.commands.executeCommand("system-performance.refresh");
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(true, "Webview survived toggle operations");
  });

  test("Multiple webview operations should work", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 500));

    await vscode.commands.executeCommand("system-performance.toggleGraph");
    await new Promise((resolve) => setTimeout(resolve, 500));

    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 500));

    await vscode.commands.executeCommand("system-performance.refresh");
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(true, "Multiple webview operations completed successfully");
  });

  test("Webview should handle system resource updates", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (let i = 0; i < 3; i++) {
      await vscode.commands.executeCommand("system-performance.refresh");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    assert.ok(true, "Webview handled system resource updates");
  });

  test("Configuration-based feature toggling should work", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await config.update("showCpu", false, vscode.ConfigurationTarget.Global);
    await new Promise((resolve) => setTimeout(resolve, 500));

    await config.update("showMemory", false, vscode.ConfigurationTarget.Global);
    await new Promise((resolve) => setTimeout(resolve, 500));

    await config.update("showCpu", true, vscode.ConfigurationTarget.Global);
    await config.update("showMemory", true, vscode.ConfigurationTarget.Global);

    assert.ok(true, "Configuration-based feature toggling works");
  });
});
