
export const configValues: Record<string, unknown> = {};

export function resetConfig(): void {
  for (const key of Object.keys(configValues)) {
    delete configValues[key];
  }
}

class Disposable {
  constructor(private readonly callOnDispose: () => void = () => {}) {}
  dispose(): void {
    this.callOnDispose();
  }
}

class EventEmitter<T> {
  private listeners: Array<(value: T) => void> = [];
  readonly event = (listener: (value: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    });
  };
  fire(value: T): void {
    this.listeners.forEach((l) => l(value));
  }
  dispose(): void {
    this.listeners = [];
  }
}

function getConfiguration(section?: string) {
  const prefix = section ? `${section}.` : "";
  return {
    get<T>(key: string, defaultValue?: T): T | undefined {
      const full = prefix + key;
      return full in configValues ? (configValues[full] as T) : defaultValue;
    },
    update: async () => {},
  };
}

function createStatusBarItem() {
  return {
    text: "",
    tooltip: "",
    command: undefined,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  };
}

export const vscodeStub = {
  Disposable,
  EventEmitter,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  workspace: {
    getConfiguration,
    onDidChangeConfiguration: () => new Disposable(),
  },
  window: {
    createStatusBarItem,
    showInformationMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showWarningMessage: async () => undefined,
  },
  commands: {
    registerCommand: () => new Disposable(),
    executeCommand: async () => undefined,
  },
  Uri: { file: (p: string) => ({ fsPath: p }), joinPath: () => ({}) },
};

const moduleAny = require("module") as any;
if (!moduleAny.__vscodeStubInstalled) {
  const originalLoad = moduleAny._load;
  moduleAny._load = function (request: string, ...rest: unknown[]) {
    if (request === "vscode") {
      return vscodeStub;
    }
    return originalLoad.call(this, request, ...rest);
  };
  moduleAny.__vscodeStubInstalled = true;
}
