import { previewCopy } from "./preview-copy";
import type { Language } from "../src/types";

// Visual fixture only. It has no installer, filesystem or native IPC capability.
export function showFarewellPreview(language: string): Promise<void> {
  const copy = previewCopy[language as Language] ?? previewCopy.en;
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "preview-farewell";
    dialog.setAttribute("aria-labelledby", "preview-farewell-message");
    const message = document.createElement("p");
    message.id = "preview-farewell-message";
    message.textContent = copy.farewell;
    const actions = document.createElement("footer");
    const finish = () => { dialog.close(); dialog.remove(); resolve(); };
    for (const [label, className] of [[copy.confirm, "button-primary"], [copy.cancel, "button-secondary"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className!;
      button.textContent = label!;
      button.autofocus = label === copy.cancel;
      button.addEventListener("click", finish, { once: true });
      actions.append(button);
    }
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(); }, { once: true });
    dialog.append(message, actions);
    document.body.append(dialog);
    dialog.showModal();
  });
}
