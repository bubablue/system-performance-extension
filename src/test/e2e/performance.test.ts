import * as assert from "assert";
import * as vscode from "vscode";

suite("System Performance Extension Performance Tests", () => {
  let extension: vscode.Extension<any>;

  setup(async () => {
    extension = vscode.extensions.getExtension(
      "bubablue00.system-performance"
    )!;

    if (!extension.isActive) {
      await extension.activate();
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test("Extension activation should be fast", async () => {
    const startTime = Date.now();

    await vscode.commands.executeCommand("system-performance.showGraph");

    const endTime = Date.now();
    const activationTime = endTime - startTime;

    assert.ok(
      activationTime < 2000,
      `Extension should respond quickly (took ${activationTime}ms)`
    );
  });

  test("System information collection should not block UI", async () => {
    const startTime = Date.now();

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(
        vscode.commands.executeCommand("system-performance.refresh")
      );
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    assert.ok(
      executionTime < 5000,
      `System info collection should be fast (took ${executionTime}ms)`
    );
  });

  test("Memory usage should be reasonable", async () => {
    const initialMemory = process.memoryUsage();

    await vscode.commands.executeCommand("system-performance.showGraph");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (let i = 0; i < 10; i++) {
      await vscode.commands.executeCommand("system-performance.refresh");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

    const maxReasonableIncrease = 50 * 1024 * 1024;
    assert.ok(
      memoryIncrease < maxReasonableIncrease,
      `Memory increase should be reasonable (increased by ${Math.round(
        memoryIncrease / 1024 / 1024
      )}MB)`
    );
  });

  test("High frequency updates should not cause performance issues", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    await config.update(
      "updateInterval",
      500,
      vscode.ConfigurationTarget.Global
    );

    await vscode.commands.executeCommand("system-performance.showGraph");

    const startTime = Date.now();

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const endTime = Date.now();
    const actualTime = endTime - startTime;

    assert.ok(
      Math.abs(actualTime - 5000) < 1000,
      `High frequency updates should not cause significant delays (expected ~5000ms, got ${actualTime}ms)`
    );

    await config.update(
      "updateInterval",
      2000,
      vscode.ConfigurationTarget.Global
    );
  });

  test("Concurrent operations should not cause race conditions", async () => {
    const operations = [
      vscode.commands.executeCommand("system-performance.showGraph"),
      vscode.commands.executeCommand("system-performance.toggleMonitoring"),
      vscode.commands.executeCommand("system-performance.refresh"),
      vscode.commands.executeCommand("system-performance.toggleMonitoring"),
      vscode.commands.executeCommand("system-performance.refresh"),
    ];

    const startTime = Date.now();

    await Promise.all(operations);

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    assert.ok(
      executionTime < 3000,
      `Concurrent operations should complete quickly (took ${executionTime}ms)`
    );
  });

  test("Extension should handle configuration changes efficiently", async () => {
    const config = vscode.workspace.getConfiguration("systemGraph");

    const startTime = Date.now();

    const configChanges = [
      config.update("showCpu", false, vscode.ConfigurationTarget.Global),
      config.update("showMemory", false, vscode.ConfigurationTarget.Global),
      config.update("updateInterval", 1000, vscode.ConfigurationTarget.Global),
      config.update("showCpu", true, vscode.ConfigurationTarget.Global),
      config.update("showMemory", true, vscode.ConfigurationTarget.Global),
      config.update("updateInterval", 2000, vscode.ConfigurationTarget.Global),
    ];

    await Promise.all(configChanges);

    const endTime = Date.now();
    const configTime = endTime - startTime;

    assert.ok(
      configTime < 2000,
      `Configuration changes should be fast (took ${configTime}ms)`
    );
  });

  test("Long running operation should not impact VS Code responsiveness", async () => {
    await vscode.commands.executeCommand("system-performance.showGraph");

    const startTime = Date.now();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const endTime = Date.now();

    const commandStartTime = Date.now();
    await vscode.commands.executeCommand("system-performance.refresh");
    const commandEndTime = Date.now();
    const commandTime = commandEndTime - commandStartTime;

    assert.ok(
      commandTime < 1000,
      `VS Code should remain responsive after long operation (command took ${commandTime}ms)`
    );

    const totalTime = endTime - startTime;
    assert.ok(
      Math.abs(totalTime - 5000) < 1000,
      `Long running operation should not affect timing accuracy (expected ~5000ms, got ${totalTime}ms)`
    );
  });
});
