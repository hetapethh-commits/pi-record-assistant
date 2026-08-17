import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type {
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
} from "@earendil-works/pi-coding-agent";

type RecordMode = "unprefixed" | "prefixed";

class InvalidModeConfigError extends Error {}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function localTime(now: Date): string {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

async function appendRecord(cwd: string, text: string, now: Date): Promise<void> {
  const date = localDate(now);
  const recordsDir = join(cwd, "records");
  const recordPath = join(recordsDir, `${date}.md`);
  const entry = `## ${localTime(now)}\n\n${text}\n`;

  await mkdir(recordsDir, { recursive: true });

  try {
    await writeFile(recordPath, `# ${date}\n\n${entry}`, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    await appendFile(recordPath, `\n${entry}`, "utf8");
  }
}

function removePrefix(text: string): string {
  const textWithoutPrefix = text.slice(1);
  return textWithoutPrefix.startsWith(" ")
    ? textWithoutPrefix.slice(1)
    : textWithoutPrefix;
}

function modeFilePath(cwd: string, configDirName: string): string {
  return join(cwd, configDirName, "record-assistant.json");
}

function isInsideDirectory(parent: string, candidate: string): boolean {
  const pathFromParent = relative(resolve(parent), resolve(candidate));
  return (
    pathFromParent === "" ||
    (pathFromParent !== ".." &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent))
  );
}

function isExternalChannelInput(
  event: InputEvent,
  ctx: ExtensionContext,
  channelSessionRoots: readonly string[],
): boolean {
  if (event.source !== "interactive") return false;
  if (ctx.mode !== "print") return false;

  const sessionDir = ctx.sessionManager.getSessionDir();
  return channelSessionRoots.some((root) =>
    isInsideDirectory(root, sessionDir),
  );
}

function modeDescription(mode: RecordMode): string {
  return mode === "unprefixed"
    ? "外部渠道模式：普通输入记录，- 开头交给 Pi"
    : "外部渠道模式：- 开头记录，普通输入交给 Pi";
}

async function loadMode(
  cwd: string,
  configDirName: string,
): Promise<RecordMode> {
  try {
    const config: unknown = JSON.parse(
      await readFile(modeFilePath(cwd, configDirName), "utf8"),
    );
    if (typeof config !== "object" || config === null || !("mode" in config)) {
      throw new InvalidModeConfigError();
    }

    const mode = config.mode;
    if (mode !== "prefixed" && mode !== "unprefixed") {
      throw new InvalidModeConfigError();
    }
    return mode;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "unprefixed";
    }
    throw error;
  }
}

async function saveMode(
  cwd: string,
  configDirName: string,
  mode: RecordMode,
): Promise<void> {
  const configDir = join(cwd, configDirName);
  await mkdir(configDir, { recursive: true });
  await writeFile(
    modeFilePath(cwd, configDirName),
    `${JSON.stringify({ mode }, null, 2)}\n`,
    "utf8",
  );
}

export function createRecordAssistant(
  configDirName: string,
  channelSessionRoots: readonly string[],
) {
  return function recordAssistant(pi: ExtensionAPI) {
    let mode: RecordMode = "unprefixed";
    let recordQueue: Promise<void> = Promise.resolve();

    function queueRecord(cwd: string, text: string, now: Date): Promise<void> {
      const queuedWrite = recordQueue.then(() => appendRecord(cwd, text, now));
      recordQueue = queuedWrite.then(
        () => undefined,
        () => undefined,
      );
      return queuedWrite;
    }

    pi.on("session_start", async (_event, ctx) => {
      try {
        mode = await loadMode(ctx.cwd, configDirName);
      } catch (error) {
        if (
          !(error instanceof SyntaxError) &&
          !(error instanceof InvalidModeConfigError)
        ) {
          throw error;
        }
        mode = "unprefixed";
        if (ctx.hasUI) {
          ctx.ui.notify("记录助手配置无效，已使用默认模式", "warning");
        }
      }
    });

    pi.registerCommand("record-mode", {
      description: "切换或查看记录助手模式",
      handler: async (args, ctx) => {
        const requestedMode = args.trim().toLowerCase();
        if (requestedMode === "status") {
          if (ctx.hasUI) ctx.ui.notify(modeDescription(mode), "info");
          return;
        }

        if (
          requestedMode !== "" &&
          requestedMode !== "prefixed" &&
          requestedMode !== "unprefixed"
        ) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              "用法：/record-mode [status|prefixed|unprefixed]",
              "warning",
            );
          }
          return;
        }

        const nextMode =
          requestedMode === "prefixed" || requestedMode === "unprefixed"
            ? requestedMode
            : mode === "unprefixed"
              ? "prefixed"
              : "unprefixed";

        await saveMode(ctx.cwd, configDirName, nextMode);
        mode = nextMode;
        if (ctx.hasUI) ctx.ui.notify(modeDescription(mode), "info");
      },
    });

    pi.on("input", async (event, ctx) => {
      if (event.text.startsWith("/")) {
        return { action: "continue" };
      }

      if (!isExternalChannelInput(event, ctx, channelSessionRoots)) {
        return { action: "continue" };
      }

      const isPrefixed = event.text.startsWith("-");
      const shouldRecord =
        mode === "unprefixed" ? !isPrefixed : isPrefixed;

      if (shouldRecord) {
        const now = new Date();
        try {
          await queueRecord(
            ctx.cwd,
            isPrefixed ? removePrefix(event.text) : event.text,
            now,
          );
        } catch {
          if (ctx.hasUI) {
            ctx.ui.notify("记录失败，内容未发送给 Pi", "error");
          }
          return { action: "handled" };
        }
        if (ctx.hasUI) {
          ctx.ui.notify(`已记录到 records/${localDate(now)}.md`, "info");
        }
        return { action: "handled" };
      }

      if (isPrefixed) {
        return {
          action: "transform",
          text: removePrefix(event.text),
        };
      }

      return { action: "continue" };
    });
  };
}
