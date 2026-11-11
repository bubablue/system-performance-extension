import * as os from "os";
import * as si from "systeminformation";
import * as vscode from "vscode";

const IS_WINDOWS = process.platform === "win32";

export interface PowerShellSessionState {
  powerShellStarted: boolean;
  sessionId?: number;
  releasedAt?: number;
  pendingStart?: NodeJS.Timeout;
  unansweredRestarts?: number;
}

type PowerShellRunner = ((cmd: string) => Promise<string>) & {
  supervised?: true;
};

export interface PowerShellRunnerHost {
  powerShell: PowerShellRunner;
}

export const sessionTimings = {
  commandTimeoutMs: 20000,
  restartGraceMs: 3000,
};

export const MAX_UNANSWERED_RESTARTS = 3;

const siUtil: PowerShellRunnerHost = require("systeminformation/lib/util");

export function supervisePowerShellCommands(
  host: PowerShellRunnerHost,
  state: PowerShellSessionState
): void {
  if (host.powerShell.supervised) {
    return;
  }

  const original = host.powerShell;
  const supervised: PowerShellRunner = (cmd: string) => {
    const session = state.powerShellStarted ? state.sessionId : undefined;
    const command = session === undefined ? cmd : cmd + os.EOL;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve("");
        if (session !== undefined) {
          restartUnansweredSession(state, session);
        }
      }, sessionTimings.commandTimeoutMs);

      original(command)
        .catch(() => "")
        .then((output) => {
          clearTimeout(timer);
          if (session !== undefined && isCurrentSession(state, session)) {
            state.unansweredRestarts = 0;
          }
          resolve(output);
        });
    });
  };
  supervised.supervised = true;
  host.powerShell = supervised;
}

function isCurrentSession(state: PowerShellSessionState, session: number): boolean {
  return state.powerShellStarted && state.sessionId === session;
}

function hasGivenUpOnSession(state: PowerShellSessionState): boolean {
  return (state.unansweredRestarts ?? 0) > MAX_UNANSWERED_RESTARTS;
}

function restartUnansweredSession(state: PowerShellSessionState, session: number): void {
  if (!isCurrentSession(state, session)) {
    return;
  }

  stopPersistentPowerShell(state);
  state.unansweredRestarts = (state.unansweredRestarts ?? 0) + 1;

  if (hasGivenUpOnSession(state)) {
    console.error(
      `Persistent PowerShell session stopped answering ${state.unansweredRestarts} times in a row; falling back to one PowerShell per query`
    );
    return;
  }

  console.error(
    `Persistent PowerShell session did not answer within ${sessionTimings.commandTimeoutMs}ms; restarting it`
  );
  startPersistentPowerShell(state);
}

function isPersistentPowerShellEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("systemGraph")
    .get("windows.persistentPowerShell", true);
}

export function startPersistentPowerShell(state: PowerShellSessionState): void {
  if (!IS_WINDOWS) {
    return;
  }

  supervisePowerShellCommands(siUtil, state);

  if (
    state.powerShellStarted ||
    state.pendingStart ||
    !isPersistentPowerShellEnabled() ||
    hasGivenUpOnSession(state)
  ) {
    return;
  }

  const graceLeftMs =
    (state.releasedAt ?? -Infinity) + sessionTimings.restartGraceMs - Date.now();
  if (graceLeftMs > 0) {
    state.pendingStart = setTimeout(() => {
      state.pendingStart = undefined;
      startPersistentPowerShell(state);
    }, graceLeftMs);
    return;
  }

  try {
    si.powerShellStart();
    state.powerShellStarted = true;
    state.sessionId = (state.sessionId ?? 0) + 1;
  } catch (error) {
    console.error("Failed to start persistent PowerShell session:", error);
  }
}

export function stopPersistentPowerShell(state: PowerShellSessionState): void {
  if (state.pendingStart) {
    clearTimeout(state.pendingStart);
    state.pendingStart = undefined;
  }

  if (!state.powerShellStarted) {
    return;
  }

  try {
    si.powerShellRelease();
  } catch (error) {
    console.error("Failed to release persistent PowerShell session:", error);
  } finally {
    state.powerShellStarted = false;
    state.releasedAt = Date.now();
  }
}

export function syncPersistentPowerShell(state: PowerShellSessionState): void {
  if (isPersistentPowerShellEnabled()) {
    startPersistentPowerShell(state);
  } else {
    stopPersistentPowerShell(state);
    state.unansweredRestarts = 0;
  }
}
