import * as vscode from "vscode";

export class TestHelper {
  private static originalShowInformationMessage: any;
  private static mockInstalled = false;

  static installGlobalMock(): void {
    if (TestHelper.mockInstalled) {
      return;
    }
    
    TestHelper.originalShowInformationMessage = vscode.window.showInformationMessage;
    
    (vscode.window as any).showInformationMessage = async (message: string, options?: any, ...items: string[]) => {
      if (message.includes("System Performance Extension needs access")) {
        return "Grant Access";
      }
      return items && items.length > 0 ? items[0] : undefined;
    };
    
    TestHelper.mockInstalled = true;
  }

  static restoreGlobalMock(): void {
    if (!TestHelper.mockInstalled) {
      return;
    }
    
    (vscode.window as any).showInformationMessage = TestHelper.originalShowInformationMessage;
    TestHelper.mockInstalled = false;
  }

  static async setupExtensionForTesting(): Promise<vscode.Extension<any>> {
    TestHelper.installGlobalMock();
    
    const extension = vscode.extensions.getExtension("bubablue00.system-performance")!;

    if (!extension.isActive) {
      try {
        await extension.activate();
      } catch (error) {
        console.log("Extension activation handled:", error);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 6000));

    return extension;
  }

  static async cleanupExtension(): Promise<void> {
    const config = vscode.workspace.getConfiguration("systemGraph");
    await config.update("statusBarEnabled", true, vscode.ConfigurationTarget.Global);
    await config.update("updateInterval", 4000, vscode.ConfigurationTarget.Global);
    
    TestHelper.restoreGlobalMock();
  }
}
