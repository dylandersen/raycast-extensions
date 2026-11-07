import { runScript } from "./run-script";

export default async function Command() {
  await runScript("exit-demo.js");
}
