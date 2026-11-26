// Relay Highlighter — Step 1: toggle a full-page red border with Alt+Shift+R.
// No detection, no cross-page sync, no page content is read or stored.
(() => {
  // Prevent duplicate injection: bail out if this script already ran on this page.
  const FLAG = "relayHighlighterInjected";
  if (document.documentElement.dataset[FLAG]) {
    return;
  }
  document.documentElement.dataset[FLAG] = "true";

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

  let visible = false;

  // Toggle on Alt+Shift+R. Match the physical key via event.code, not the
  // character value, because macOS Option combinations produce special characters.
  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.code === "KeyR") {
      event.preventDefault();
      visible = !visible;
      border.style.display = visible ? "block" : "none";
    }
  });
})();
