// Relay Highlighter — Step 2: share "which page has the latest result"
// across pages via chrome.storage.local, toggled manually with Alt+Shift+R.
// Only { id, site, ts } is stored; no page content is read or saved.
(() => {
  // Prevent duplicate injection: bail out if this script already ran on this page.
  const FLAG = "relayHighlighterInjected";
  if (document.documentElement.dataset[FLAG]) {
    return;
  }
  document.documentElement.dataset[FLAG] = "true";

  const STORAGE_KEY = "relay.latest";
  const INSTANCE_KEY = "relay.instanceId";

  // After the extension is reloaded, old content scripts lose their context
  // (chrome.runtime.id becomes empty). Check this and stop quietly instead
  // of throwing errors on every storage call.
  const isContextValid = () => {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  };

  // Per-tab instance ID: stable across reloads of the same tab.
  // sessionStorage may be unavailable (blocked, etc.), so fall back to an
  // in-memory-only ID if reading or writing it fails.
  const getInstanceId = () => {
    let id = null;
    try {
      id = sessionStorage.getItem(INSTANCE_KEY);
    } catch {
      id = null;
    }
    if (!id) {
      id = crypto.randomUUID();
      try {
        sessionStorage.setItem(INSTANCE_KEY, id);
      } catch {
        // Keep the generated ID in memory only.
      }
    }
    return id;
  };
  const instanceId = getInstanceId();

  // Host element attached to <html> (outside <body> so page layout is untouched).
  const host = document.createElement("div");
  host.style.pointerEvents = "none";

  // Shadow DOM isolates the border from the page's own styles.
  const shadow = host.attachShadow({ mode: "open" });

  // The red border itself: covers the whole viewport and never intercepts input.
  const border = document.createElement("div");
  border.style.position = "fixed";
  border.style.inset = "0";
  border.style.border = "6px solid #e5262b";
  border.style.boxSizing = "border-box";
  border.style.pointerEvents = "none";
  border.style.zIndex = "2147483647";
  border.style.display = "none"; // Hidden by default.

  shadow.appendChild(border);
  document.documentElement.appendChild(host);

  // Show the border only when this page is the recorded latest page.
  const render = (latest) => {
    const mine = Boolean(latest && latest.id === instanceId);
    border.style.display = mine ? "block" : "none";
  };

  // --- chrome.storage.local helpers (callback style, lastError handled) ---

  const readLatest = (onResult) => {
    if (!isContextValid()) return;
    try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        if (chrome.runtime.lastError) return; // Stop quietly.
        onResult(result ? result[STORAGE_KEY] : undefined);
      });
    } catch {
      // Invalidated context: stop quietly.
    }
  };

  const writeLatest = () => {
    if (!isContextValid()) return;
    try {
      const latest = { id: instanceId, site: location.hostname, ts: Date.now() };
      chrome.storage.local.set({ [STORAGE_KEY]: latest }, () => {
        if (chrome.runtime.lastError) return;
        render(latest);
      });
    } catch {
      // Invalidated context: stop quietly.
    }
  };

  const clearLatest = () => {
    if (!isContextValid()) return;
    try {
      chrome.storage.local.remove(STORAGE_KEY, () => {
        if (chrome.runtime.lastError) return;
        render(undefined);
      });
    } catch {
      // Invalidated context: stop quietly.
    }
  };

  // Initial render from the shared state (keeps the border after a reload).
  readLatest(render);

  // Re-render whenever another page changes the shared state.
  try {
    if (isContextValid()) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !(STORAGE_KEY in changes)) return;
        render(changes[STORAGE_KEY].newValue); // Undefined newValue = cleared.
      });
    }
  } catch {
    // Invalidated context: stop quietly.
  }

  // Toggle this page as "latest" on Alt+Shift+R (capture phase, so sites
  // that stop propagation in input fields cannot swallow the shortcut).
  // Match the physical key via event.code, not the character value, because
  // macOS Option combinations produce special characters.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.repeat) return; // Ignore auto-repeat while the keys are held.
      if (!(event.altKey && event.shiftKey && event.code === "KeyR")) return;
      event.preventDefault();
      readLatest((latest) => {
        if (latest && latest.id === instanceId) {
          clearLatest();
        } else {
          writeLatest();
        }
      });
    },
    true
  );
})();
