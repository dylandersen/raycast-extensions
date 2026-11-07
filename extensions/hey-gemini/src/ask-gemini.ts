import { LaunchProps } from "@raycast/api";
import { sendPrompt } from "./send-prompt";

export default async function Command(props: LaunchProps<{ arguments: Arguments.AskGemini }>) {
  await sendPrompt(props.arguments.prompt);
}
