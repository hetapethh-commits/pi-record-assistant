import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { createRecordAssistant } from "./extension.ts";

export default createRecordAssistant(CONFIG_DIR_NAME) satisfies (
  pi: ExtensionAPI,
) => void;
