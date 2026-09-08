function loginCancelledError() {
  return Object.assign(new Error("ChatGPT sign-in was paused by the user"), { code: "login_cancelled" });
}

function waitForLoginOperation(action, signal) {
  if (signal?.aborted) return Promise.reject(loginCancelledError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(loginCancelledError());
    signal?.addEventListener("abort", onAbort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw loginCancelledError();
      return action();
    }).then(resolve, reject).finally(() => {
      signal?.removeEventListener("abort", onAbort);
    });
  });
}

// A committed document is not a completed sign-in. In particular, streamed HTML
// can display a form before its application scripts have finished hydrating it.
// Never wait for every subresource, or stop that document to satisfy a load timer.
function loadLoginEntry(contents, url, { allowedUrl, signal, timeoutMs = 60_000 } = {}) {
  if (typeof allowedUrl !== "function" || !allowedUrl(url)) {
    return Promise.reject(new Error("ChatGPT sign-in destination is not allowed"));
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error("ChatGPT sign-in navigation timeout must be positive"));
  }
  if (!contents || contents.isDestroyed()) return Promise.reject(new Error("ChatGPT sign-in browser is closed"));
  if (signal?.aborted) return Promise.reject(loginCancelledError());
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      contents.off("did-navigate", onCommitted);
      contents.off("did-fail-load", onFailed);
      contents.off("render-process-gone", onGone);
      contents.off("destroyed", onDestroyed);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = error => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onCommitted = (_event, destination) => {
      finish(allowedUrl(destination) ? null : new Error("ChatGPT sign-in navigated to an unexpected destination"));
    };
    const onFailed = (_event, code, _description, _url, mainFrame) => {
      if (!mainFrame || code === -3) return;
      finish(new Error(`ChatGPT sign-in navigation failed (${code})`));
    };
    const onGone = () => finish(new Error("ChatGPT sign-in renderer stopped"));
    const onDestroyed = () => finish(new Error("ChatGPT sign-in browser is closed"));
    const onAbort = () => finish(loginCancelledError());
    const timer = setTimeout(() => {
      // This only ends our wait; it must not truncate a still-streaming login page.
      finish(new Error("ChatGPT sign-in did not open in time. Reload the sign-in page or return to the guide."));
    }, timeoutMs);
    timer.unref?.();
    contents.on("did-navigate", onCommitted);
    contents.on("did-fail-load", onFailed);
    contents.on("render-process-gone", onGone);
    contents.on("destroyed", onDestroyed);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      Promise.resolve(contents.loadURL(url)).then(() => {
        if (contents.isDestroyed()) onDestroyed();
        else onCommitted(null, contents.getURL());
      }, error => {
        // Chromium can abort the original load when the login page redirects.
        // An abort is not proof of success: keep waiting for an allowed commit.
        if (error?.code === -3 || error?.code === "ERR_ABORTED"
          || /\bERR_ABORTED\b|\(-3\) loading/.test(error?.message || "")) return;
        finish(new Error("ChatGPT sign-in page could not be opened"));
      });
    } catch {
      finish(new Error("ChatGPT sign-in page could not be opened"));
    }
  });
}

module.exports = { loadLoginEntry, loginCancelledError, waitForLoginOperation };
