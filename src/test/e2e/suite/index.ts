import { glob } from "glob";
import * as path from "path";
import { TestHelper } from "../testHelper";

export async function run(): Promise<void> {
  TestHelper.installGlobalMock();
  
  const Mocha = await import("mocha");
  const mocha = new Mocha.default({
    ui: "tdd",
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname, "..");
  const files = await glob("**/**.test.js", { cwd: testsRoot });

  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures: number) => {
        TestHelper.restoreGlobalMock();
        
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      console.error(err);
      TestHelper.restoreGlobalMock();
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
