import { LaunchProps } from "@raycast/api";
import { sendPrompt } from "./send-prompt";

export default async function Command(props: LaunchProps<{ arguments: Arguments.AskGeminiIncognito }>) {
  await sendPrompt(props.arguments.prompt, "temporary");
}
