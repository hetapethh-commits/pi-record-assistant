import {
  CONFIG_DIR_NAME,
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { createRecordAssistant } from "./extension.ts";

export default createRecordAssistant(CONFIG_DIR_NAME, getAgentDir()) satisfies (
  pi: ExtensionAPI,
) => void;
