import { closeMainWindow, environment, showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { join } from "path";

export async function runScript(name: string): Promise<void> {
  // Close Raycast first so the window you were using is the active one again
  await closeMainWindow();

  const message = await new Promise<string>((resolve) => {
    execFile("/usr/bin/osascript", ["-l", "JavaScript", join(environment.assetsPath, name)], (error, stdout, stderr) => {
      resolve(stdout.trim() || stderr.trim() || error?.message || "Done");
    });
  });

  await showHUD(message);
}
