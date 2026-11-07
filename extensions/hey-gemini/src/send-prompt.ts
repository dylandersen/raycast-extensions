import { closeMainWindow, environment, showHUD } from "@raycast/api";
import { execFile } from "child_process";
import { join } from "path";

export async function sendPrompt(prompt: string, mode?: "temporary"): Promise<void> {
  await closeMainWindow();

  const script = join(environment.assetsPath, "ask-gemini.js");
  const args = ["-l", "JavaScript", script, prompt, ...(mode ? [mode] : [])];
  const failure = await new Promise<string | null>((resolve) => {
    execFile("/usr/bin/osascript", args, (error, _stdout, stderr) => {
      resolve(error ? stderr.trim() || error.message : null);
    });
  });

  if (failure) await showHUD(`Couldn't send to Gemini: ${failure}`);
}
