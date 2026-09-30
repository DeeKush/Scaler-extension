// ============================================
// features/assignmentExport/clipboard.js
// Rich-content clipboard helper (HTML + plain-text fallback chain)
// ============================================

// Controls what fills the clipboard's text/plain slot when Copy runs.
// Rich editors (Google Docs, Notion, Gmail) read the text/html slot either
// way, so this only matters for plain-text-only paste targets — and many
// LLM chat inputs fall into that bucket, reading text/plain even when a
// page also offers text/html.
//   "rendered": generatePlainText() output — clean prose, no Markdown syntax.
//   "markdown": generateMarkdown() output — Markdown source, useful if the
//               paste target is itself Markdown-aware.
const COPY_PLAIN_TEXT_FORMAT = "rendered"; // "rendered" | "markdown"

/**
 * Copies rich HTML content to the clipboard, with a plain-text companion.
 *
 * @purpose Puts a rendered preview (text/html) and a plain-text fallback
 *          (text/plain) on the clipboard in one write, so both rich editors
 *          and plain-text-only paste targets get a sensible result.
 * @param {string} html - Already-escaped HTML fragment for the text/html slot.
 * @param {string} plainText - Plain-text companion for the text/plain slot.
 * @returns {Promise<boolean>} Whether the copy succeeded via any strategy.
 * @sideeffects Writes to the system clipboard; may briefly insert/remove an
 *              off-screen contenteditable element and touch the page's
 *              current selection (restored afterwards).
 * @failures Never throws. Falls through three strategies in order:
 *           navigator.clipboard.write([ClipboardItem]) -> execCommand("copy")
 *           on a hidden selection -> navigator.clipboard.writeText(plainText).
 *           Returns false (logging each failure) if all three fail.
 */
async function copyRich(html, plainText) {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plainText], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (e) {
    console.error("[Scaler++] copyRich: clipboard.write failed, trying execCommand fallback", e);
  }

  const selection = window.getSelection();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  let container = null;

  try {
    container = document.createElement("div");
    container.setAttribute("contenteditable", "true");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "0";
    container.style.opacity = "0";
    container.innerHTML = html;
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    selection.removeAllRanges();
    selection.addRange(range);

    if (document.execCommand("copy")) {
      return true;
    }
  } catch (e) {
    console.error("[Scaler++] copyRich: execCommand fallback failed", e);
  } finally {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    selection.removeAllRanges();
    if (previousRange) {
      selection.addRange(previousRange);
    }
  }

  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch (e) {
    console.error("[Scaler++] copyRich: writeText fallback failed", e);
    return false;
  }
}
