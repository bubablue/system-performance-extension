import "./vscodeStub";
import * as assert from "assert";
import * as os from "os";
import { configValues, resetConfig } from "./vscodeStub";
import { realModule, freshRequire, quietErrors, stub, withPlatform } from "./helpers";

const si = realModule("systeminformation");
const siUtil = realModule("systeminformation/lib/util");

type Session = typeof import("../../powerShellSession");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const neverAnswered = () => new Promise<string>(() => {});

suite("Persistent PowerShell session gating", () => {
  let start: ReturnType<typeof stub>;
  let release: ReturnType<typeof stub>;
  let runner: ReturnType<typeof stub>;
  let sentCommands: string[];
  let answerCommand: (cmd: string) => Promise<string>;

  setup(() => {
    resetConfig();
    sentCommands = [];
    answerCommand = async () => "";
    start = stub(si, "powerShellStart", () => {});
    release = stub(si, "powerShellRelease", () => {});
    runner = stub(siUtil, "powerShell", (cmd: string) => {
      sentCommands.push(cmd);
      return answerCommand(cmd);
    });
  });

  teardown(() => {
    start.restore();
    release.restore();
    runner.restore();
  });

  function load(
    platform: NodeJS.Platform,
    timings: Partial<Session["sessionTimings"]> = {}
  ): Session {
    const session = withPlatform(platform, () => freshRequire<Session>("powerShellSession"));
    Object.assign(session.sessionTimings, { commandTimeoutMs: 20, restartGraceMs: 0 }, timings);
    return session;
  }

  test("starts one session on Windows and is idempotent", () => {
    const session = load("win32");
    const state = { powerShellStarted: false };

    withPlatform("win32", () => {
      session.startPersistentPowerShell(state);
      session.startPersistentPowerShell(state);
    });

    assert.strictEqual(start.counter.calls, 1);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("never starts a session on macOS or Linux", () => {
    const session = load("darwin");
    const state = { powerShellStarted: false };

    withPlatform("darwin", () => session.startPersistentPowerShell(state));
    withPlatform("linux", () => session.startPersistentPowerShell(state));

    assert.strictEqual(start.counter.calls, 0);
    assert.strictEqual(state.powerShellStarted, false);
  });

  test("respects the systemGraph.windows.persistentPowerShell setting", () => {
    const session = load("win32");
    const state = { powerShellStarted: false };
    configValues["systemGraph.windows.persistentPowerShell"] = false;

    withPlatform("win32", () => session.startPersistentPowerShell(state));

    assert.strictEqual(start.counter.calls, 0);
    assert.strictEqual(state.powerShellStarted, false);
  });

  test("releases the session once and resets state", () => {
    const session = load("win32");
    const state = { powerShellStarted: false };

    withPlatform("win32", () => session.startPersistentPowerShell(state));
    session.stopPersistentPowerShell(state);
    session.stopPersistentPowerShell(state);

    assert.strictEqual(release.counter.calls, 1);
    assert.strictEqual(state.powerShellStarted, false);
  });

  test("stop is a no-op when nothing was started", () => {
    const session = load("win32");
    session.stopPersistentPowerShell({ powerShellStarted: false });
    assert.strictEqual(release.counter.calls, 0);
  });

  test("a failing spawn is logged and leaves the session marked as not started", async () => {
    const session = load("win32");
    start.restore();
    start = stub(si, "powerShellStart", () => {
      throw new Error("powershell.exe not found");
    });
    const state = { powerShellStarted: false };

    await quietErrors(() =>
      withPlatform("win32", () => session.startPersistentPowerShell(state))
    );

    assert.strictEqual(state.powerShellStarted, false);
    session.stopPersistentPowerShell(state);
    assert.strictEqual(release.counter.calls, 0);
  });

  test("a failing release still resets state", async () => {
    const session = load("win32");
    release.restore();
    release = stub(si, "powerShellRelease", () => {
      throw new Error("stdin closed");
    });
    const state = { powerShellStarted: false };

    withPlatform("win32", () => session.startPersistentPowerShell(state));
    await quietErrors(() => session.stopPersistentPowerShell(state));

    assert.strictEqual(state.powerShellStarted, false);
  });

  test("commands sent through the session end with a blank line so multi-line statements run", async () => {
    const session = load("win32");
    const state = { powerShellStarted: false };
    const multiLine = "Get-CimInstance Win32_Process | select-Object ProcessId,\n  Caption | ConvertTo-Json";

    withPlatform("win32", () => session.startPersistentPowerShell(state));
    await siUtil.powerShell(multiLine);

    assert.deepStrictEqual(sentCommands, [multiLine + os.EOL]);
  });

  test("restarting the session does not stack blank lines", async () => {
    const session = load("win32");
    const state = { powerShellStarted: false };

    withPlatform("win32", () => {
      session.startPersistentPowerShell(state);
      session.stopPersistentPowerShell(state);
      session.startPersistentPowerShell(state);
    });
    await siUtil.powerShell("Get-Date");

    assert.deepStrictEqual(sentCommands, ["Get-Date" + os.EOL]);
  });

  test("commands are left untouched when no session is started", async () => {
    const session = load("win32");
    configValues["systemGraph.windows.persistentPowerShell"] = false;

    withPlatform("win32", () =>
      session.startPersistentPowerShell({ powerShellStarted: false })
    );
    await siUtil.powerShell("Get-Date");

    assert.deepStrictEqual(sentCommands, ["Get-Date"]);
  });

  test("a settings change that keeps the session enabled leaves the running session alone", () => {
    const session = load("win32");
    const state = { powerShellStarted: false };

    withPlatform("win32", () => {
      session.startPersistentPowerShell(state);
      session.syncPersistentPowerShell(state);
    });

    assert.strictEqual(start.counter.calls, 1);
    assert.strictEqual(release.counter.calls, 0);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("disabling the setting releases the session and re-enabling starts a new one", () => {
    const session = load("win32");
    const state = { powerShellStarted: false };

    withPlatform("win32", () => {
      session.startPersistentPowerShell(state);
      configValues["systemGraph.windows.persistentPowerShell"] = false;
      session.syncPersistentPowerShell(state);
    });
    assert.strictEqual(release.counter.calls, 1);
    assert.strictEqual(state.powerShellStarted, false);

    withPlatform("win32", () => {
      configValues["systemGraph.windows.persistentPowerShell"] = true;
      session.syncPersistentPowerShell(state);
    });
    assert.strictEqual(start.counter.calls, 2);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("re-enabling within the grace period waits for the old session to exit before starting", async () => {
    const session = load("win32", { restartGraceMs: 50 });
    const state = { powerShellStarted: false };

    session.startPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = false;
    session.syncPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = true;
    session.syncPersistentPowerShell(state);

    assert.strictEqual(start.counter.calls, 1, "no second session while the first may still be exiting");
    assert.strictEqual(state.powerShellStarted, false);

    await sleep(80);
    assert.strictEqual(start.counter.calls, 2);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("disabling again during the grace period cancels the pending start", async () => {
    const session = load("win32", { restartGraceMs: 50 });
    const state = { powerShellStarted: false };

    session.startPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = false;
    session.syncPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = true;
    session.syncPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = false;
    session.syncPersistentPowerShell(state);

    await sleep(80);
    assert.strictEqual(start.counter.calls, 1);
    assert.strictEqual(state.powerShellStarted, false);
  });

  test("a command the session never answers resolves empty and restarts the session", async () => {
    const session = load("win32");
    const state = { powerShellStarted: false };
    answerCommand = neverAnswered;

    session.startPersistentPowerShell(state);
    const output = await quietErrors(() => siUtil.powerShell("Get-Date"));

    assert.strictEqual(output, "");
    assert.strictEqual(release.counter.calls, 1);
    assert.strictEqual(start.counter.calls, 2);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("a command that times out without a session resolves empty and starts nothing", async () => {
    const session = load("win32");
    configValues["systemGraph.windows.persistentPowerShell"] = false;
    answerCommand = neverAnswered;

    session.startPersistentPowerShell({ powerShellStarted: false });
    const output = await siUtil.powerShell("Get-Date");

    assert.strictEqual(output, "");
    assert.strictEqual(start.counter.calls, 0);
    assert.strictEqual(release.counter.calls, 0);
  });

  test("a command stuck in a replaced session does not restart the current one", async () => {
    const session = load("win32", { commandTimeoutMs: 30 });
    const state = { powerShellStarted: false };
    answerCommand = neverAnswered;

    session.startPersistentPowerShell(state);
    const stuck = siUtil.powerShell("Get-Date");
    configValues["systemGraph.windows.persistentPowerShell"] = false;
    session.syncPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = true;
    session.syncPersistentPowerShell(state);

    assert.strictEqual(await stuck, "");
    assert.strictEqual(release.counter.calls, 1, "only the release from disabling");
    assert.strictEqual(start.counter.calls, 2);
    assert.strictEqual(state.powerShellStarted, true);
  });

  test("an answer from the restarted session clears the restart count", async () => {
    const session = load("win32");
    const state: Parameters<Session["startPersistentPowerShell"]>[0] = { powerShellStarted: false };
    answerCommand = neverAnswered;

    session.startPersistentPowerShell(state);
    await quietErrors(() => siUtil.powerShell("Get-Date"));
    assert.strictEqual(state.unansweredRestarts, 1);

    answerCommand = async () => "ok";
    assert.strictEqual(await siUtil.powerShell("Get-Date"), "ok");
    assert.strictEqual(state.unansweredRestarts, 0);
  });

  test("falls back to one PowerShell per query after repeated unanswered restarts", async () => {
    const session = load("win32");
    const state = { powerShellStarted: false };
    answerCommand = neverAnswered;

    session.startPersistentPowerShell(state);
    await quietErrors(async () => {
      for (let i = 0; i <= session.MAX_UNANSWERED_RESTARTS; i++) {
        await siUtil.powerShell("Get-Date");
      }
    });

    assert.strictEqual(start.counter.calls, 1 + session.MAX_UNANSWERED_RESTARTS);
    assert.strictEqual(state.powerShellStarted, false);

    session.syncPersistentPowerShell(state);
    assert.strictEqual(state.powerShellStarted, false, "an unrelated settings change does not retry");

    sentCommands.length = 0;
    await siUtil.powerShell("Get-Date");
    assert.deepStrictEqual(sentCommands, ["Get-Date"], "queries go to their own PowerShell again");

    configValues["systemGraph.windows.persistentPowerShell"] = false;
    session.syncPersistentPowerShell(state);
    configValues["systemGraph.windows.persistentPowerShell"] = true;
    session.syncPersistentPowerShell(state);
    assert.strictEqual(state.powerShellStarted, true, "toggling the setting tries again");
  });
});
