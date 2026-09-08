const CHAT_ON_STEROIDS_REPOSITORY = "https://github.com/totec448-spec/chat-on-steroids";
const CHAT_ON_STEROIDS_VERSION = "2.0.6";
const CHAT_ON_STEROIDS_EXTENSION_URL = `${CHAT_ON_STEROIDS_REPOSITORY}/releases/download/v${CHAT_ON_STEROIDS_VERSION}/Chat-On-Steroids-Extension.zip`;
const CHAT_ON_STEROIDS_AUDITED_COMMIT = "0f3ec7532b7d598275bf6ebf8f842495d8ab9284";

function companionExtensionInfo() {
  return Object.freeze({
    provider: "chat-on-steroids",
    version: CHAT_ON_STEROIDS_VERSION,
    auditedCommit: CHAT_ON_STEROIDS_AUDITED_COMMIT,
    repository: CHAT_ON_STEROIDS_REPOSITORY,
    downloadUrl: CHAT_ON_STEROIDS_EXTENSION_URL,
    installedByLauncher: false,
    status: "optional-upstream",
  });
}

module.exports = {
  CHAT_ON_STEROIDS_REPOSITORY,
  CHAT_ON_STEROIDS_VERSION,
  CHAT_ON_STEROIDS_EXTENSION_URL,
  CHAT_ON_STEROIDS_AUDITED_COMMIT,
  companionExtensionInfo,
};
