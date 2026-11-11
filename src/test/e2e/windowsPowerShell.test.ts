import * as assert from "assert";
import { execFile } from "child_process";
import * as si from "systeminformation";
import * as vscode from "vscode";
import { TestHelper } from "./testHelper";

const IS_WINDOWS = process.platform === "win32";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolvesWithin<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms).then(() => undefined)]);
}

function listPowerShellChildren(): Promise<number[]> {
  return new Promise((resolve) => {
    const script =
      `Get-CimInstance Win32_Process -Filter "ParentProcessId=${process.pid}" | ` +
      `Where-Object { ($_.Name -eq 'powershell.exe' -or $_.Name -eq 'pwsh.exe') -and $_.ProcessId -ne $PID } | ` +
      `ForEach-Object { $_.ProcessId }`;
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }
        resolve(
          stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map(Number)
            .filter((n) => !Number.isNaN(n))
        );
      }
    );
  });
}

async function sampleDistinctPids(durationMs: number): Promise<Set<number>> {
  const seen = new Set<number>();
  const end = Date.now() + durationMs;
  while (Date.now() < end) {
    (await listPowerShellChildren()).forEach((pid) => seen.add(pid));
    await sleep(250);
  }
  return seen;
}

suite("Windows PowerShell spawning", function () {
  this.timeout(120000);

  const config = () => vscode.workspace.getConfiguration("systemGraph");

  async function applyPersistent(enabled: boolean): Promise<void> {
    await config().update("windows.persistentPowerShell", !enabled, vscode.ConfigurationTarget.Global);
    await sleep(1500);
    await config().update("windows.persistentPowerShell", enabled, vscode.ConfigurationTarget.Global);
    await sleep(2500);
  }

  async function ensurePollingActive(): Promise<void> {
    await applyPersistent(false);
    for (let attempt = 0; attempt < 4; attempt++) {
      const pids = await sampleDistinctPids(5000);
      if (pids.size >= 1) {
        return;
      }
      await vscode.commands.executeCommand("system-performance.toggleMonitoring");
      await sleep(2500);
    }
  }

  suiteSetup(async function () {
    if (!IS_WINDOWS) {
      this.skip();
    }
    await TestHelper.setupExtensionForTesting();
    await config().update("statusBarEnabled", true, vscode.ConfigurationTarget.Global);
    await config().update("updateInterval", 1000, vscode.ConfigurationTarget.Global);
    await sleep(1500);
    await ensurePollingActive();
  });

  suiteTeardown(async () => {
    if (!IS_WINDOWS) {
      return;
    }
    await config().update("windows.persistentPowerShell", true, vscode.ConfigurationTarget.Global);
    await TestHelper.cleanupExtension();
  });

  test("persistent session enabled: one PowerShell process reused across polls", async () => {
    await applyPersistent(true);

    const pids = await sampleDistinctPids(10000);

    assert.strictEqual(
      pids.size,
      1,
      `expected one long-lived powershell.exe under the extension host, saw ${[...pids].join(",") || "none"}`
    );
  });

  test("persistent session enabled: process list and network queries are answered", async () => {
    const [processes, network] = await Promise.all([
      resolvesWithin(si.processes(), 30000),
      resolvesWithin(si.networkStats(), 30000),
    ]);

    assert.ok(
      processes && processes.list.length > 0,
      "si.processes() never returned through the persistent session"
    );
    assert.ok(network, "si.networkStats() never returned through the persistent session");
  });

  test("re-enabling straight after disabling ends with one working session", async () => {
    await config().update("windows.persistentPowerShell", false, vscode.ConfigurationTarget.Global);
    await config().update("windows.persistentPowerShell", true, vscode.ConfigurationTarget.Global);
    await sleep(6000);

    const pids = await sampleDistinctPids(5000);
    const processes = await resolvesWithin(si.processes(), 30000);

    assert.strictEqual(
      pids.size,
      1,
      `expected the released session gone and one new session, saw ${[...pids].join(",") || "none"}`
    );
    assert.ok(
      processes && processes.list.length > 0,
      "si.processes() never returned through the re-enabled session"
    );
  });

  test("persistent session disabled: PowerShell is spawned per poll (old behaviour)", async () => {
    await applyPersistent(false);

    const pids = await sampleDistinctPids(15000);

    assert.ok(
      pids.size >= 2,
      `expected several short-lived powershell.exe processes without the persistent session, saw ${pids.size}`
    );
  });
});
