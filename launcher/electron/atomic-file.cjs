const fs = require("node:fs");
const path = require("node:path");

let sequence = 0;
const waitCell = new Int32Array(new SharedArrayBuffer(4));
const WINDOWS_RENAME_RETRY_DELAYS_MS = [25, 50, 100, 150, 250, 350, 500];

function waitSync(milliseconds) {
  Atomics.wait(waitCell, 0, 0, milliseconds);
}

function renameAtomicFile(
  source,
  destination,
  {
    platform = process.platform,
    rename = fs.renameSync,
    wait = waitSync,
  } = {},
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(source, destination);
      return;
    } catch (error) {
      const transientWindowsError = platform === "win32"
        && ["EBUSY", "EPERM", "EACCES"].includes(error?.code);
      const delay = WINDOWS_RENAME_RETRY_DELAYS_MS[attempt];
      if (!transientWindowsError || delay === undefined) throw error;
      wait(delay);
    }
  }
}

function writePrivateFileAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(directory, 0o700); } catch {}
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}-${++sequence}`;
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    renameAtomicFile(temporary, filePath);
    try { fs.chmodSync(filePath, 0o600); } catch {}
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

module.exports = {
  WINDOWS_RENAME_RETRY_DELAYS_MS,
  renameAtomicFile,
  writePrivateFileAtomic,
};
