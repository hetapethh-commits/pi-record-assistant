import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = process.argv[2] ?? ".";
const requestId = "verify-record-assistant";
const timeoutMs = 60_000;
const isRemoteSource = /^(?:git:|https?:\/\/|ssh:\/\/|git:\/\/|npm:)/.test(
  source,
);
const agentDir = await mkdtemp(join(tmpdir(), "pi-record-assistant-verify-"));
const piArguments = [
  "--mode",
  "rpc",
  ...(isRemoteSource ? [] : ["--offline"]),
  "--no-session",
  "--no-skills",
  "--no-extensions",
  "-e",
  source,
];

const child = spawn(
  "pi",
  piArguments,
  {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      PI_CODING_AGENT_DIR: agentDir,
    },
    stdio: ["pipe", "pipe", "pipe"],
  },
);

let stdoutBuffer = "";
let stderr = "";
let verificationError;
let verified = false;

const completion = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    verificationError = new Error(`Timed out while loading Pi package: ${source}`);
    child.kill("SIGTERM");
  }, timeoutMs);

  child.on("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf("\n")) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex);
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (message.type !== "response" || message.id !== requestId) continue;

      const commands = message.success ? message.data?.commands : undefined;
      verified =
        Array.isArray(commands) &&
        commands.some(
          (command) =>
            command.name === "record-mode" && command.source === "extension",
        );
      if (!verified) {
        verificationError = new Error(
          `Pi package did not register the /record-mode extension command: ${source}`,
        );
      }
      child.stdin.end();
    }
  });

  child.on("close", (code) => {
    clearTimeout(timeout);
    if (verified && code === 0) {
      resolve();
      return;
    }

    const details = stderr.trim();
    reject(
      verificationError ??
        new Error(
          `Pi package verification exited with code ${code}${details ? `: ${details}` : ""}`,
        ),
    );
  });
});

child.stdin.write(
  `${JSON.stringify({ id: requestId, type: "get_commands" })}\n`,
);

try {
  await completion;
  console.log(`Verified /record-mode from ${source}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await rm(agentDir, { recursive: true, force: true });
}
