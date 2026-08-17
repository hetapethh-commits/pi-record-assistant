import { homedir } from "node:os";
import { join } from "node:path";

import {
  CONFIG_DIR_NAME,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

import { createRecordAssistant } from "./extension.ts";

const channelSessionRoots = [join(homedir(), ".omp-wechat", "sessions")];

export default createRecordAssistant(
  CONFIG_DIR_NAME,
  channelSessionRoots,
) satisfies (pi: ExtensionAPI) => void;
