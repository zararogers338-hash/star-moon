const fs = require("node:fs");
const path = require("node:path");

// Installation changes ownership to root. A file readable only by its build
// user will become unreadable by the desktop user despite a valid checksum.
// Never repair modes here: fail before publishing and rebuild with a safe umask.
function validatePublicPayload(root) {
  const visit = directory => {
    const metadata = fs.lstatSync(directory);
    if (metadata.isSymbolicLink()) return;
    const required = metadata.isDirectory() ? 0o555 : 0o444;
    if ((metadata.mode & required) !== required) {
      throw new Error(`Packaged payload is not readable by an ordinary installed user: ${directory}`);
    }
    if (metadata.isDirectory()) for (const entry of fs.readdirSync(directory)) visit(path.join(directory, entry));
  };
  if (process.platform !== "win32") visit(root);
}

module.exports = { validatePublicPayload };
