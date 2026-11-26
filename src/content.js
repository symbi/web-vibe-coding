// Relay Highlighter — Step 3a: share "which page has the latest result"
// across pages via chrome.storage.local (Step 2), and detect generically
// when this page's AI reply finishes streaming (Step 3a), then mark this
// page as latest automatically. Alt+Shift+R remains as a manual override.
// Only { id, site, ts } is stored; detection only counts how much text
// changed (lengths), never the text itself, which is not read or saved.
// Step 3a-fix: typing in an input area suppresses detection briefly (the
// border follows AI replies, not the user), debug logs carry structural
// target signatures (never text), and a stale border removes itself
// after the extension is reloaded.
(() => {
  // Prevent duplicate injection: bail out if this script already ran on this page.
  const FLAG = "relayHighlighterInjected";
  if (document.documentElement.dataset[FLAG]) {
    return;
  }
  document.documentElement.dataset[FLAG] = "true";

  const STORAGE_KEY = "relay.latest";
  const INSTANCE_KEY = "relay.instanceId";

  // --- Reply-detection tuning (Step 3a) ---
  // Initial guesses, to be adjusted from real use; keep them all here.
  const QUIET_MS = 1500; // No counted change for this long ends a burst.
  const MIN_BURST_MS = 2000; // A burst must last at least this long.
  const MIN_MUTATIONS = 30; // A burst needs at least this many counted records.
  const MIN_ADDED_CHARS = 80; // A burst needs at least this much added text (estimated).
  const NAV_GRACE_MS = 3000; // Ignore changes this long after load / URL change.
  const USER_ACTIVITY_GRACE_MS = 1500; // After the user types in an editable area, ignore page changes this long.

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

  // --- Generic reply-completion detection (Step 3a) ---
  // AI replies stream: the page changes continuously for a while, then
  // stops. A sustained, sizeable run of changes (a "burst") followed by
  // QUIET_MS of silence is treated as "the reply just finished".
  // No site-specific selectors; only change counts and text lengths.
  const startReplyDetector = () => {
    let burstStart = null; // performance.now() of the burst's first record.
    let lastMutationAt = null; // performance.now() of its latest record.
    let mutations = 0;
    let addedChars = 0;
    let quietTimer = null;
    let lastUserActivityAt = -Infinity; // Last input event inside an editable area.
    const targetCounts = new Map(); // Structural signature -> count, for debug logs.
    let graceUntil = performance.now() + NAV_GRACE_MS;
    let lastHref = location.href;
    let stopped = false;

    const resetBurst = () => {
      burstStart = null;
      lastMutationAt = null;
      mutations = 0;
      addedChars = 0;
      targetCounts.clear();
      if (quietTimer !== null) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
    };

    // Extension reloaded: disconnect, clear timers, and remove the stale
    // border from the page (the old script can no longer control it).
    const stopDetector = () => {
      if (stopped) return;
      stopped = true;
      try {
        observer.disconnect();
      } catch {
        // Already gone; nothing to do.
      }
      resetBurst();
      clearInterval(hrefTimer);
      try {
        border.style.display = "none";
        host.remove();
      } catch {
        // Host already removed; nothing to do.
      }
    };

    // True when the record's target sits in an editable area (the user
    // typing is not an AI reply). Text nodes defer to their parent element.
    const isInEditable = (node) => {
      const el = node && node.nodeType === 3 ? node.parentElement : node;
      if (!el || typeof el.closest !== "function") return false;
      return Boolean(
        el.closest('textarea, input, [contenteditable]:not([contenteditable="false"])')
      );
    };

    // Structural signature of a record's target element: tag name, role,
    // data-testid, and up to 3 ancestor tag names, each part truncated to
    // 40 chars. Never includes text, class, id, or other content-bearing
    // attributes, so it is safe to put in debug logs for tuning.
    const signatureOf = (node) => {
      const el = node && node.nodeType === 3 ? node.parentElement : node;
      if (!el || !el.tagName) return null;
      const trunc = (value) => String(value).slice(0, 40);
      let head = trunc(el.tagName.toLowerCase());
      try {
        const role = el.getAttribute ? el.getAttribute("role") : null;
        if (role) head += `[role=${trunc(role)}]`;
        const testId = el.getAttribute ? el.getAttribute("data-testid") : null;
        if (testId) head += `[testid=${trunc(testId)}]`;
      } catch {
        // Attribute access failed; fall back to the tag name alone.
      }
      const parts = [head];
      let ancestor = el.parentElement;
      for (let depth = 0; ancestor && depth < 3; depth += 1) {
        if (ancestor.tagName) parts.push(trunc(ancestor.tagName.toLowerCase()));
        ancestor = ancestor.parentElement;
      }
      return parts.join("<");
    };

    const topTargets = () =>
      [...targetCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

    const onBurstEnd = () => {
      quietTimer = null;
      if (!isContextValid()) {
        stopDetector();
        return;
      }
      const durationMs =
        burstStart === null || lastMutationAt === null ? 0 : lastMutationAt - burstStart;
      const accepted =
        durationMs >= MIN_BURST_MS && mutations >= MIN_MUTATIONS && addedChars >= MIN_ADDED_CHARS;
      // Debug line contains numbers, the verdict, and structural target
      // signatures only, never page text.
      console.debug("[Relay] burst ended", {
        durationMs,
        mutations,
        addedChars,
        accepted,
        topTargets: topTargets(),
      });
      resetBurst();
      if (accepted) {
        writeLatest(); // Always a write (refreshes ts), never a toggle.
      }
    };

    const onMutations = (records) => {
      if (stopped) return;
      if (!isContextValid()) {
        stopDetector();
        return;
      }
      // The user is typing: changes anywhere on the page (previews,
      // counters, suggestion panels around the input box) are not a reply.
      if (performance.now() - lastUserActivityAt < USER_ACTIVITY_GRACE_MS) {
        if (burstStart !== null) {
          console.debug("[Relay] burst discarded (user typing)", { mutations, addedChars });
          resetBurst();
        }
        return;
      }
      if (performance.now() < graceUntil) return; // Load / navigation grace period.

      let counted = 0;
      for (const record of records) {
        if (isInEditable(record.target)) continue;
        counted += 1;
        mutations += 1;
        const signature = signatureOf(record.target);
        if (signature !== null) {
          if (targetCounts.has(signature)) {
            targetCounts.set(signature, targetCounts.get(signature) + 1);
          } else if (targetCounts.size < 50) {
            targetCounts.set(signature, 1);
          }
        }
        if (record.type === "childList") {
          for (const node of record.addedNodes || []) {
            // Only the length is used; the text itself is never stored.
            addedChars += Math.min(node.textContent ? node.textContent.length : 0, 2000);
          }
        } else if (record.type === "characterData") {
          addedChars += 1;
        }
      }
      if (counted === 0) return; // Everything was filtered out (e.g. typing).

      const now = performance.now();
      if (burstStart === null) burstStart = now;
      lastMutationAt = now;
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(onBurstEnd, QUIET_MS);
    };

    // Track genuine user input inside editable areas. Only input-style
    // events count: keydown is deliberately NOT used, because pressing
    // Enter to send a message must not suppress the reply that follows.
    // Listeners are passive and never prevent or modify the events.
    const onUserActivity = (event) => {
      if (isInEditable(event.target)) {
        lastUserActivityAt = performance.now();
      }
    };
    for (const type of [
      "beforeinput",
      "input",
      "compositionstart",
      "compositionupdate",
      "compositionend",
      "paste",
      "cut",
    ]) {
      document.addEventListener(type, onUserActivity, { capture: true, passive: true });
    }

    const observer = new MutationObserver(onMutations);

    // SPA navigation: poll the URL about once a second (no history
    // patching, no extra permissions) and restart the grace period.
    const hrefTimer = setInterval(() => {
      if (stopped) return;
      if (!isContextValid()) {
        stopDetector();
        return;
      }
      if (location.href !== lastHref) {
        lastHref = location.href;
        graceUntil = performance.now() + NAV_GRACE_MS;
        resetBurst(); // Changes from the old page must not carry over.
      }
    }, 1000);

    if (document.body) {
      // Attributes are not observed, and the border lives outside <body>
      // in a Shadow DOM, so this page's own highlight cannot self-trigger.
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  };
  startReplyDetector();
})();
