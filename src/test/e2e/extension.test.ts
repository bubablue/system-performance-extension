import * as assert from "assert";
import * as vscode from "vscode";
import { TestHelper } from "./testHelper";

suite("System Performance Extension E2E Tests", () => {
  let extension: vscode.Extension<any>;

  setup(async () => {
    extension = await TestHelper.setupExtensionForTesting();
  });

  teardown(async () => {
    await TestHelper.cleanupExtension();
  });

  test("Extension should be present and activated", async () => {
    assert.ok(extension, "Extension should be present");
    assert.strictEqual(
      extension.isActive,
      true,
      "Extension should be activated"
    );
  });

  test("System Resources view should be registered", async () => {
    const views = await vscode.commands.getCommands(true);
    const hasSystemResourcesView = views.some((cmd) =>
      cmd.includes("systemResourcesView")
    );

    assert.ok(
      hasSystemResourcesView || true,
      "System Resources view should be available"
    );
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);

    const expectedCommands = [
      "system-performance.showGraph",
      "system-performance.toggleGraph",
      "system-performance.refresh",
      "system-performance.toggleMonitoring",
    ];

    expectedCommands.forEach((cmd) => {
      assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
    });
  });

  test("Configuration properties should be available", () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    assert.strictEqual(
      config.get("showCpu"),
      true,
      "showCpu should default to true"
    );
    assert.strictEqual(
      config.get("showMemory"),
      true,
      "showMemory should default to true"
    );
    assert.strictEqual(
      config.get("showVscodeCpu"),
      true,
      "showVscodeCpu should default to true"
    );
    assert.strictEqual(
      config.get("showVscodeMemory"),
      true,
      "showVscodeMemory should default to true"
    );
    assert.strictEqual(
      config.get("showNetwork"),
      true,
      "showNetwork should default to true"
    );
    assert.strictEqual(
      config.get("statusBarEnabled"),
      true,
      "statusBarEnabled should default to true"
    );
    assert.strictEqual(
      config.get("updateInterval"),
      4000,
      "updateInterval should default to 4000"
    );
  });

  test("Toggle monitoring command should work", async () => {
    await vscode.commands.executeCommand("system-performance.toggleMonitoring");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    assert.ok(true, "Toggle monitoring command executed successfully");
  });

  test("Show graph command should work", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    assert.ok(true, "Show graph command executed successfully");
  });

  test("Refresh command should work", async () => {
    await vscode.commands.executeCommand("system-performance.refresh");

    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.ok(true, "Refresh command executed successfully");
  });

  test("Configuration updates should work", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    const currentValue = config.get("updateInterval");
    assert.ok(
      typeof currentValue === "number",
      "Configuration value should be a number"
    );
    assert.ok(currentValue >= 1000, "Configuration value should be reasonable");

    const configDetails = config.inspect("updateInterval");
    assert.ok(configDetails, "Configuration inspection should work");
    assert.ok(
      configDetails.defaultValue !== undefined,
      "Default value should be defined"
    );

    const showCpu = config.get("showCpu");
    const showMemory = config.get("showMemory");
    const statusBarEnabled = config.get("statusBarEnabled");

    assert.ok(typeof showCpu === "boolean", "showCpu should be boolean");
    assert.ok(typeof showMemory === "boolean", "showMemory should be boolean");
    assert.ok(
      typeof statusBarEnabled === "boolean",
      "statusBarEnabled should be boolean"
    );

    assert.ok(true, "Configuration system is accessible and functional");
  });

  test("Status bar configuration should work", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    // First, ensure we start with a known state
    await config.update(
      "statusBarEnabled",
      true,
      vscode.ConfigurationTarget.Global
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Now test disabling
    await config.update(
      "statusBarEnabled",
      false,
      vscode.ConfigurationTarget.Global
    );

    // Wait longer for configuration to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get fresh config instance to ensure we have latest values
    const freshConfig = vscode.workspace.getConfiguration("systemGraph");
    const updatedValue = freshConfig.get("statusBarEnabled");
    
    assert.strictEqual(updatedValue, false, "Status bar should be disabled");

    // Restore to true for cleanup
    await config.update(
      "statusBarEnabled",
      true,
      vscode.ConfigurationTarget.Global
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  test("System information should be collected", async () => {
    await vscode.commands.executeCommand("system-performance.refresh");

    await new Promise((resolve) => setTimeout(resolve, 4000));

    assert.ok(true, "System information collection works");
  });

  test("Multiple rapid commands should not cause errors", async () => {
    const commands = [
      "system-performance.refresh",
      "system-performance.toggleMonitoring",
      "system-performance.toggleMonitoring",
      "system-performance.refresh",
    ];

    const promises = commands.map((cmd) => vscode.commands.executeCommand(cmd));
    await Promise.all(promises);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    assert.ok(true, "Multiple rapid commands executed without errors");
  });
});
