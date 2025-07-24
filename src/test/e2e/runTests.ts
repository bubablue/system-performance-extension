import { runTests } from "@vscode/test-electron";
import * as path from "path";
import * as os from "os";

async function main() {
  try {
    process.env.NODE_ENV = 'test';
    
    const extensionDevelopmentPath = path.resolve(__dirname, "../../../");

    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    const userDataDir = path.join(os.tmpdir(), "vscode-test-" + Math.random().toString(36).substring(7));

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        "--disable-extensions",
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
        "--disable-telemetry",
        "--no-sandbox",
        `--user-data-dir=${userDataDir}`
      ],
      extensionTestsEnv: {
        NODE_ENV: 'test',
        VSCODE_TEST_MODE: 'true'
      }
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
