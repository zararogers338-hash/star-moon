// Set this only after the owner creates/confirms the fused project's repository.
// A missing URL disables the optional invitation, not access to the application.
const SUPPORT_REPOSITORY_URL = null;
// Do not replace this fork with upstream binaries before its own release feed
// and artifact identities have been configured and verified.
const FORK_UPDATES_READY = false;

module.exports = { SUPPORT_REPOSITORY_URL, FORK_UPDATES_READY };
