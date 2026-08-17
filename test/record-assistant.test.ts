import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  InputEvent,
  InputEventResult,
  SessionStartEvent,
} from "@earendil-works/pi-coding-agent";

import { createRecordAssistant } from "../extensions/record-assistant/extension.ts";

const recordAssistant = createRecordAssistant(".pi");

type InputHandler = (
  event: InputEvent,
  ctx: ExtensionContext,
) => Promise<InputEventResult | void> | InputEventResult | void;

type CommandHandler = (
  args: string,
  ctx: ExtensionCommandContext,
) => Promise<void>;

type SessionStartHandler = (
  event: SessionStartEvent,
  ctx: ExtensionContext,
) => Promise<void> | void;

type Notification = {
  message: string;
  type: "info" | "warning" | "error" | undefined;
};

type TestExtensionContext = ExtensionContext &
  ExtensionCommandContext & {
    notifications: Notification[];
  };

function registerExtension() {
  let inputHandler: InputHandler | undefined;
  let sessionStartHandler: SessionStartHandler | undefined;
  const commandHandlers = new Map<string, CommandHandler>();
  const pi = {
    on(event: string, handler: InputHandler | SessionStartHandler) {
      if (event === "input") inputHandler = handler as InputHandler;
      if (event === "session_start") {
        sessionStartHandler = handler as SessionStartHandler;
      }
    },
    registerCommand(name: string, options: { handler: CommandHandler }) {
      commandHandlers.set(name, options.handler);
    },
  } as unknown as ExtensionAPI;

  recordAssistant(pi);
  assert.ok(inputHandler, "record-assistant must register an input handler");
  return {
    handleInput: inputHandler,
    commandHandlers,
    async startSession(ctx: ExtensionContext) {
      assert.ok(
        sessionStartHandler,
        "record-assistant must register a session_start handler",
      );
      await sessionStartHandler(
        { type: "session_start", reason: "startup" },
        ctx,
      );
    },
  };
}

function registerInputHandler(): InputHandler {
  return registerExtension().handleInput;
}

async function createTestContext(t: TestContext): Promise<TestExtensionContext> {
  const cwd = await mkdtemp(join(tmpdir(), "pi-record-assistant-"));
  const notifications: Notification[] = [];
  t.after(() => rm(cwd, { recursive: true, force: true }));

  return {
    cwd,
    hasUI: true,
    notifications,
    ui: {
      notify(message: string, type?: Notification["type"]) {
        notifications.push({ message, type });
      },
    },
  } as unknown as TestExtensionContext;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("default mode records an unprefixed message without invoking the agent", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(2026, 7, 17, 14, 23, 45),
  });
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();

  const result = await handleInput(
    {
      type: "input",
      text: "Remember to buy milk",
      source: "interactive",
    },
    ctx,
  );
  const content = await readFile(
    join(ctx.cwd, "records", "2026-08-17.md"),
    "utf8",
  );

  assert.deepEqual(
    { result, content },
    {
      result: { action: "handled" },
      content: "# 2026-08-17\n\n## 14:23:45\n\nRemember to buy milk\n",
    },
  );
});

test("default mode sends a prefixed message to the agent without recording it", async (t) => {
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();

  const result = await handleInput(
    {
      type: "input",
      text: "- Summarize this project",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      result: { action: "transform", text: "Summarize this project" },
      recordsDirectoryExists: false,
    },
  );
});

test("mode command switches prefixed messages from agent input to records", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(2026, 7, 17, 14, 23, 45),
  });
  const ctx = await createTestContext(t);
  const { handleInput, commandHandlers } = registerExtension();
  const toggleMode = commandHandlers.get("record-mode");
  assert.ok(toggleMode, "record-assistant must register /record-mode");

  await toggleMode("", ctx);
  const result = await handleInput(
    {
      type: "input",
      text: "- A prefixed note",
      source: "interactive",
    },
    ctx,
  );
  const content = await readFile(
    join(ctx.cwd, "records", "2026-08-17.md"),
    "utf8",
  );

  assert.deepEqual(
    { result, content },
    {
      result: { action: "handled" },
      content: "# 2026-08-17\n\n## 14:23:45\n\nA prefixed note\n",
    },
  );
});

test("explicit prefixed mode is idempotent and sends unprefixed input to the agent", async (t) => {
  const ctx = await createTestContext(t);
  const { handleInput, commandHandlers } = registerExtension();
  const setMode = commandHandlers.get("record-mode");
  assert.ok(setMode, "record-assistant must register /record-mode");

  await setMode("prefixed", ctx);
  await setMode("prefixed", ctx);
  const result = await handleInput(
    {
      type: "input",
      text: "Ask the agent",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      result: { action: "continue" },
      recordsDirectoryExists: false,
    },
  );
});

test("selected mode survives extension reloads", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(2026, 7, 17, 14, 23, 45),
  });
  const ctx = await createTestContext(t);
  const firstInstance = registerExtension();
  const setMode = firstInstance.commandHandlers.get("record-mode");
  assert.ok(setMode, "record-assistant must register /record-mode");

  await setMode("prefixed", ctx);
  const reloadedInstance = registerExtension();
  await reloadedInstance.startSession(ctx);
  const result = await reloadedInstance.handleInput(
    {
      type: "input",
      text: "- Persisted mode note",
      source: "interactive",
    },
    ctx,
  );
  const content = await readFile(
    join(ctx.cwd, "records", "2026-08-17.md"),
    "utf8",
  );

  assert.deepEqual(
    { result, content },
    {
      result: { action: "handled" },
      content: "# 2026-08-17\n\n## 14:23:45\n\nPersisted mode note\n",
    },
  );
});

test("extension-injected input bypasses recording", async (t) => {
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();

  const result = await handleInput(
    {
      type: "input",
      text: "Internal follow-up",
      source: "extension",
    },
    ctx,
  );

  assert.deepEqual(
    {
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      result: { action: "continue" },
      recordsDirectoryExists: false,
    },
  );
});

test("status reports the current mode without changing it", async (t) => {
  const ctx = await createTestContext(t);
  const { handleInput, commandHandlers } = registerExtension();
  const showStatus = commandHandlers.get("record-mode");
  assert.ok(showStatus, "record-assistant must register /record-mode");

  await showStatus("status", ctx);
  const result = await handleInput(
    {
      type: "input",
      text: "- Ask the agent",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      notifications: ctx.notifications,
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      notifications: [
        {
          message: "记录模式：普通输入记录，- 开头交给 Pi",
          type: "info",
        },
      ],
      result: { action: "transform", text: "Ask the agent" },
      recordsDirectoryExists: false,
    },
  );
});

test("invalid mode argument warns without changing the current mode", async (t) => {
  const ctx = await createTestContext(t);
  const { handleInput, commandHandlers } = registerExtension();
  const setMode = commandHandlers.get("record-mode");
  assert.ok(setMode, "record-assistant must register /record-mode");

  await setMode("unknown", ctx);
  const result = await handleInput(
    {
      type: "input",
      text: "- Ask the agent",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      notifications: ctx.notifications,
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      notifications: [
        {
          message: "用法：/record-mode [status|prefixed|unprefixed]",
          type: "warning",
        },
      ],
      result: { action: "transform", text: "Ask the agent" },
      recordsDirectoryExists: false,
    },
  );
});

test("successful recording reports the daily file", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(2026, 7, 17, 14, 23, 45),
  });
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();

  await handleInput(
    {
      type: "input",
      text: "A note with visible confirmation",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(ctx.notifications, [
    {
      message: "已记录到 records/2026-08-17.md",
      type: "info",
    },
  ]);
});

test("malformed mode config falls back to the default mode with a warning", async (t) => {
  const ctx = await createTestContext(t);
  await mkdir(join(ctx.cwd, ".pi"), { recursive: true });
  await writeFile(
    join(ctx.cwd, ".pi", "record-assistant.json"),
    "not valid json\n",
    "utf8",
  );
  const extension = registerExtension();

  await extension.startSession(ctx);
  const result = await extension.handleInput(
    {
      type: "input",
      text: "- Ask the agent",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      notifications: ctx.notifications,
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      notifications: [
        {
          message: "记录助手配置无效，已使用默认模式",
          type: "warning",
        },
      ],
      result: { action: "transform", text: "Ask the agent" },
      recordsDirectoryExists: false,
    },
  );
});

test("recording failure is handled without sending the note to the agent", async (t) => {
  const ctx = await createTestContext(t);
  await writeFile(join(ctx.cwd, "records"), "blocks the records directory", "utf8");
  const handleInput = registerInputHandler();

  const result = await handleInput(
    {
      type: "input",
      text: "A private note that cannot be written",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    { result, notifications: ctx.notifications },
    {
      result: { action: "handled" },
      notifications: [
        {
          message: "记录失败，内容未发送给 Pi",
          type: "error",
        },
      ],
    },
  );
});

test("slash input bypasses recording so Pi can expand skills and templates", async (t) => {
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();

  const result = await handleInput(
    {
      type: "input",
      text: "/skill:example remember this",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    {
      result,
      recordsDirectoryExists: await pathExists(join(ctx.cwd, "records")),
    },
    {
      result: { action: "continue" },
      recordsDirectoryExists: false,
    },
  );
});

test("non-object mode config falls back to the default mode with a warning", async (t) => {
  const ctx = await createTestContext(t);
  await mkdir(join(ctx.cwd, ".pi"), { recursive: true });
  await writeFile(
    join(ctx.cwd, ".pi", "record-assistant.json"),
    "null\n",
    "utf8",
  );
  const extension = registerExtension();

  await extension.startSession(ctx);
  const result = await extension.handleInput(
    {
      type: "input",
      text: "- Ask the agent",
      source: "interactive",
    },
    ctx,
  );

  assert.deepEqual(
    { notifications: ctx.notifications, result },
    {
      notifications: [
        {
          message: "记录助手配置无效，已使用默认模式",
          type: "warning",
        },
      ],
      result: { action: "transform", text: "Ask the agent" },
    },
  );
});

test("concurrent recording preserves every note in the daily file", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(2026, 7, 17, 14, 23, 45),
  });
  const ctx = await createTestContext(t);
  const handleInput = registerInputHandler();
  const payload = "x".repeat(2 * 1024 * 1024);
  const notes = Array.from(
    { length: 8 },
    (_, index) => `concurrent-note-${index}\n${payload}`,
  );

  const results = await Promise.all(
    notes.map((text) =>
      handleInput(
        { type: "input", text, source: "rpc" },
        ctx,
      ),
    ),
  );
  const content = await readFile(
    join(ctx.cwd, "records", "2026-08-17.md"),
    "utf8",
  );

  assert.ok(results.every((result) => result?.action === "handled"));
  assert.equal(content.match(/^## /gm)?.length, notes.length);
  const entryPrefix = "## 14:23:45\n\n";
  const expectedLength =
    "# 2026-08-17\n\n".length +
    notes.reduce(
      (length, note) => length + entryPrefix.length + note.length + 1,
      0,
    ) +
    (notes.length - 1);
  assert.equal(content.length, expectedLength);
  for (let index = 0; index < notes.length; index += 1) {
    assert.equal(
      content.match(new RegExp(`^concurrent-note-${index}$`, "gm"))?.length,
      1,
    );
    assert.ok(
      content.includes(`${entryPrefix}${notes[index]}\n`),
      `concurrent note ${index} must remain intact`,
    );
  }
});
