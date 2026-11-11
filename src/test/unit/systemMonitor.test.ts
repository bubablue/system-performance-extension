import "./vscodeStub";
import * as assert from "assert";
import * as os from "os";
import { configValues, resetConfig } from "./vscodeStub";
import { realModule, freshRequire, stub, withPlatform } from "./helpers";

const si = realModule("systeminformation");

type MonitorModule = typeof import("../../systemMonitor");

function loadMonitor(platform: NodeJS.Platform): MonitorModule["SystemMonitor"] {
  return withPlatform(platform, () => freshRequire<MonitorModule>("systemMonitor").SystemMonitor);
}

function fakeProvider(visible: boolean) {
  return {
    isVisible: () => visible,
    onDidChangeVisibility: () => ({ dispose: () => {} }),
    sendMessage: () => {},
    updateData: () => {},
  };
}

function fakeStatusBarManager() {
  return {
    updateStatusBarVisibility: () => {},
    updateStatusBarItems: () => {},
  };
}

function monitorWith(
  SystemMonitor: MonitorModule["SystemMonitor"],
  options: { statusBar: boolean; panelVisible: boolean }
) {
  const monitor = new SystemMonitor(
    fakeStatusBarManager() as any,
    fakeProvider(options.panelVisible) as any
  );
  if (options.statusBar) {
    monitor.addStatusBarInstance({} as any);
  }
  return monitor;
}

suite("SystemMonitor metric selection", () => {
  const restores: Array<() => void> = [];

  setup(() => resetConfig());
  teardown(() => {
    restores.splice(0).forEach((r) => r());
  });

  test("Windows memory comes from os and never touches si.mem()", async () => {
    const SystemMonitor = loadMonitor("win32");
    const mem = stub(si, "mem", async () => ({ total: -1 }));
    restores.push(mem.restore);

    const memory = await (SystemMonitor as any).getMemory();

    assert.strictEqual(mem.counter.calls, 0);
    assert.strictEqual(memory.total, os.totalmem());
    assert.ok(memory.active > 0 && memory.active <= memory.total);
    assert.strictEqual(memory.swaptotal, 0);
  });

  test("non-Windows memory still uses si.mem()", async () => {
    const SystemMonitor = loadMonitor("darwin");
    const mem = stub(si, "mem", async () => ({ total: 42, active: 1 }));
    restores.push(mem.restore);

    const memory = await (SystemMonitor as any).getMemory();

    assert.strictEqual(mem.counter.calls, 1);
    assert.strictEqual(memory.total, 42);
  });

  test("disk I/O is never requested on Windows even when the status bar item is on", () => {
    configValues["systemGraph.statusBar.showDisk"] = true;

    const win = loadMonitor("win32");
    monitorWith(win, { statusBar: true, panelVisible: false });
    assert.strictEqual((win as any).computeNeeds().disk, false);

    const mac = loadMonitor("darwin");
    monitorWith(mac, { statusBar: true, panelVisible: false });
    assert.strictEqual((mac as any).computeNeeds().disk, true);
  });

  test("nothing on screen means no metrics are needed", () => {
    const SystemMonitor = loadMonitor("win32");
    monitorWith(SystemMonitor, { statusBar: false, panelVisible: false });

    const needs = (SystemMonitor as any).computeNeeds();
    assert.deepStrictEqual(needs, {
      any: false,
      processes: false,
      network: false,
      disk: false,
    });
  });

  test("process list is skipped when no VS Code metric is displayed", () => {
    const SystemMonitor = loadMonitor("win32");
    configValues["systemGraph.statusBar.showVscodeCpu"] = false;
    configValues["systemGraph.statusBar.showVscodeMemory"] = false;
    configValues["systemGraph.statusBar.showNetwork"] = false;
    monitorWith(SystemMonitor, { statusBar: true, panelVisible: false });

    const needs = (SystemMonitor as any).computeNeeds();
    assert.strictEqual(needs.any, true, "CPU/memory/uptime items still shown");
    assert.strictEqual(needs.processes, false);
    assert.strictEqual(needs.network, false);
  });

  test("a visible panel re-enables process and network queries", () => {
    const SystemMonitor = loadMonitor("win32");
    configValues["systemGraph.statusBar.showVscodeCpu"] = false;
    configValues["systemGraph.statusBar.showVscodeMemory"] = false;
    configValues["systemGraph.statusBar.showNetwork"] = false;
    monitorWith(SystemMonitor, { statusBar: true, panelVisible: true });

    const needs = (SystemMonitor as any).computeNeeds();
    assert.strictEqual(needs.processes, true);
    assert.strictEqual(needs.network, true);
  });

  test("collectSystemData only calls the queries that are needed", async () => {
    const SystemMonitor = loadMonitor("win32");
    const load = stub(si, "currentLoad", async () => ({ currentLoad: 12 }));
    const time = stub(si, "time", async () => ({ uptime: 99 }));
    const procs = stub(si, "processes", async () => {
      throw new Error("should not be called");
    });
    const net = stub(si, "networkStats", async () => {
      throw new Error("should not be called");
    });
    const disk = stub(si, "disksIO", async () => {
      throw new Error("should not be called");
    });
    restores.push(load.restore, time.restore, procs.restore, net.restore, disk.restore);

    const data = await (SystemMonitor as any).collectSystemData({
      any: true,
      processes: false,
      network: false,
      disk: false,
    });

    assert.ok(data, "collection should succeed without the optional queries");
    assert.strictEqual(procs.counter.calls, 0);
    assert.strictEqual(net.counter.calls, 0);
    assert.strictEqual(disk.counter.calls, 0);
    assert.strictEqual(data.processes, null);
    assert.strictEqual(data.disksIO, null);
    assert.deepStrictEqual(data.networkStats, []);
    assert.deepStrictEqual(data.vscodeProcesses, []);
    assert.strictEqual(data.cpu.currentLoad, 12);
    assert.strictEqual(data.time.uptime, 99);
  });

  test("process list is cached across ticks and deduplicated while in flight", async () => {
    const SystemMonitor = loadMonitor("win32");
    let resolveProcesses: (value: any) => void = () => {};
    const procs = stub(
      si,
      "processes",
      () => new Promise((resolve) => (resolveProcesses = resolve))
    );
    restores.push(procs.restore);

    const first = (SystemMonitor as any).getProcesses();
    const second = (SystemMonitor as any).getProcesses();
    assert.strictEqual(procs.counter.calls, 1, "concurrent calls share one query");

    resolveProcesses({ list: [{ name: "Code", command: "", cpu: 1, mem: 2 }] });
    const [a, b] = await Promise.all([first, second]);
    assert.strictEqual(a, b);

    const third = await (SystemMonitor as any).getProcesses();
    assert.strictEqual(procs.counter.calls, 1, "fresh cache is reused");
    assert.strictEqual(third, a);
  });

  test("process cache age follows the larger of the two intervals", () => {
    const SystemMonitor = loadMonitor("win32");

    configValues["systemGraph.updateInterval"] = 2000;
    configValues["systemGraph.processUpdateInterval"] = 12000;
    assert.strictEqual((SystemMonitor as any).getProcessMaxAge(), 11750);

    configValues["systemGraph.updateInterval"] = 9000;
    configValues["systemGraph.processUpdateInterval"] = 1000;
    assert.strictEqual((SystemMonitor as any).getProcessMaxAge(), 8750);
  });
});
