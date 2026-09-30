// ============================================
// features/assignmentExport/ui.js
// Handles UI injection and interaction
// ============================================

const ICONS = {
    download: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    spinner: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    clipboard: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="4" rx="1" ry="1"></rect><path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4"></path></svg>`
};

let bulkExportInterval = null;
let copyAllReadyState = null; // { wrapper, onConfirm, onCancel, timeoutId } — set while Copy All awaits its confirming click

function clearBulkExportAnimation() {
    if (bulkExportInterval) {
        clearInterval(bulkExportInterval);
        bulkExportInterval = null;
    }
    const iconEl = document.getElementById("scaler-export-icon");
    if (iconEl) {
        iconEl.style.fontSize = "";
        iconEl.style.fontWeight = "";
        iconEl.style.letterSpacing = "";
        iconEl.style.whiteSpace = "";
    }
}

function startBulkExportAnimation(text) {
    clearBulkExportAnimation();
    
    const iconEl = document.getElementById("scaler-export-icon");
    if (!iconEl) return;
    
    iconEl.style.fontSize = "10px";
    iconEl.style.fontWeight = "bold";
    iconEl.style.letterSpacing = "-0.5px";
    iconEl.style.whiteSpace = "nowrap";

    let dots = 1;
    const updateText = () => {
        const dotStr = ".".repeat(dots);
        iconEl.innerHTML = text === "" ? `↓ ${dotStr}` : `↓ ${text}${dotStr}`;
        dots = (dots % 3) + 1;
    };
    
    updateText();
    bulkExportInterval = setInterval(updateText, 300);
}

/**
 * Updates the text of the export button (used for progress)
 * Maintains the existing API by routing the text to the tooltip.
 * @param {string} text - The new text to display
 */
function updateExportButtonText(text) {
    const tooltip = document.getElementById("scaler-export-tooltip");
    if (tooltip) tooltip.innerText = text;

    const match = text.match(/(?:Exporting|Collecting) (\d+\/\d+)\.\.\./);
    if (match) {
        startBulkExportAnimation(match[1]);
    } else if (text === "Zipping...") {
        startBulkExportAnimation("ZIP");
    } else if (text === "Copying...") {
        startBulkExportAnimation("COPY");
    }
}

/**
 * Sets the export button status temporarily for success/failure
 * @param {'success'|'error'} status
 * @param {string} [message] - Tooltip text; defaults to the Export wording so
 *   existing call sites (Export This Problem / Export All) don't need to change.
 */
function setExportStatus(status, message) {
    clearBulkExportAnimation();
    const wrapper = document.querySelector("[data-assignment-export-injected]");
    if (!wrapper) return;

    const iconEl = document.getElementById("scaler-export-icon");
    const tooltip = document.getElementById("scaler-export-tooltip");
    if (!iconEl) return;

    if (status === "success") {
        iconEl.innerHTML = ICONS.check;
        iconEl.style.color = "#10b981"; // green
        if (tooltip) tooltip.innerText = message || "Export Complete";
    } else if (status === "error") {
        iconEl.innerHTML = ICONS.error;
        iconEl.style.color = "#ef4444"; // red
        if (tooltip) tooltip.innerText = message || "Export Failed";
    }

    setTimeout(() => {
        iconEl.innerHTML = ICONS.download;
        iconEl.style.color = "currentColor";
        if (tooltip) tooltip.innerText = "Export";
        wrapper.removeAttribute("data-exporting");
        
        const linkEl = document.getElementById("scaler-export-btn");
        if (linkEl) {
            linkEl.style.cursor = "pointer";
            linkEl.style.transform = "translateY(0) scale(1)";
            linkEl.style.boxShadow = "none";
            // Trigger hover check in case mouse is still over it
            if (wrapper.matches(":hover")) {
                linkEl.style.transform = "translateY(-2px) scale(1.02)";
                linkEl.style.boxShadow = "0 4px 12px rgba(252, 184, 75, 0.3)";
                linkEl.style.backgroundColor = "#fcb84b";
            }
        }
    }, 1500);
}

/**
 * Arms the given button into a "ready to copy" state after Copy All has
 * finished collecting every problem. The actual clipboard write happens on
 * the NEXT click (a fresh user gesture) rather than here, because
 * navigator.clipboard needs one and collection itself can take many seconds.
 * @param {HTMLElement} wrapper - The button wrapper to arm, captured by the
 *   caller BEFORE collection started. If collection outlives that page (a
 *   SPA navigation swapped in a new button), this element is stale/detached
 *   and must not be re-looked-up — arming a different page's button would be
 *   wrong, so a stale wrapper cancels instead of arming.
 * @param {number} count - Number of problems collected, shown in the tooltip.
 * @param {() => void} onConfirm - Called when the user clicks to confirm the copy.
 * @param {() => void} onCancel - Called if the state is cleared WITHOUT confirming
 *   (60s timeout, teardown, re-injection, or a stale/missing wrapper) — used to
 *   release the caller's exporting lock so it never gets stuck.
 */
function setCopyAllReady(wrapper, count, onConfirm, onCancel) {
    clearCopyAllReady(false);

    if (!wrapper || !wrapper.isConnected) {
        // The bulk animation interval draws on whichever button currently
        // matches [data-assignment-export-injected] (updateExportButtonText
        // uses getElementById, not this wrapper) — if we don't stop it here
        // it keeps animating forever on a DIFFERENT page's button.
        clearBulkExportAnimation();

        const currentWrapper = document.querySelector("[data-assignment-export-injected]");
        if (currentWrapper) {
            setExportStatus("error", "Copy cancelled (page changed)");
        }

        if (typeof onCancel === "function") onCancel();
        return;
    }

    clearBulkExportAnimation();
    wrapper.removeAttribute("data-exporting");
    wrapper.setAttribute("data-copy-ready", "true");

    const iconEl = wrapper.querySelector("#scaler-export-icon");
    const tooltip = wrapper.querySelector("#scaler-export-tooltip");
    if (iconEl) {
        iconEl.innerHTML = ICONS.clipboard;
        iconEl.style.color = "#2563eb"; // blue — a distinct "ready" affordance
    }
    if (tooltip) tooltip.innerText = `Click to copy ${count} problems`;

    const timeoutId = setTimeout(() => {
        clearCopyAllReady(false);
    }, 60000);

    copyAllReadyState = { wrapper, onConfirm, onCancel, timeoutId };
}

/**
 * Cancels a pending "ready to copy" state and restores that button's idle
 * appearance, acting only on the wrapper stored in copyAllReadyState (never
 * re-querying the document, so it can't touch a different page's button).
 * Calls the state's onCancel unless `confirmed` is true (i.e. the user's
 * click is what's clearing it, and the caller is about to run onConfirm
 * itself).
 * @param {boolean} [confirmed]
 */
function clearCopyAllReady(confirmed) {
    const state = copyAllReadyState;
    if (!state) {
        // Nothing pending — leave the icon/tooltip alone. Just in case,
        // remove a stray attribute if one is somehow still set.
        const stray = document.querySelector("[data-copy-ready]");
        if (stray) stray.removeAttribute("data-copy-ready");
        return;
    }

    if (state.timeoutId) clearTimeout(state.timeoutId);
    copyAllReadyState = null;

    const wrapper = state.wrapper;
    if (wrapper) {
        wrapper.removeAttribute("data-copy-ready");
        const iconEl = wrapper.querySelector("#scaler-export-icon");
        const tooltip = wrapper.querySelector("#scaler-export-tooltip");
        if (iconEl) {
            iconEl.innerHTML = ICONS.download;
            iconEl.style.color = "currentColor";
        }
        if (tooltip) tooltip.innerText = "Export";
    }

    if (!confirmed && typeof state.onCancel === "function") {
        state.onCancel();
    }
}


/**
 * Injects the export dropdown button into the DOM
 */
function createExportButton(onExportCurrent, onExportAll, onCopyCurrent, onCopyAll) {
    let headingTextDiv = document.querySelector(".cr-p-heading__text") || 
                         document.querySelector('[class*="heading__text"]') || 
                         document.querySelector('[class*="heading_text"]');

    if (!headingTextDiv) {
        const badges = Array.from(document.querySelectorAll('span, div'));
        let badge = badges.find(el => el.textContent.trim() === "Solved" || el.textContent.trim() === "Unsolved");
        if (badge && badge.parentElement) {
            headingTextDiv = badge.parentElement;
        } else {
            return;
        }
    }

    if (headingTextDiv.querySelector("[data-assignment-export-injected]")) {
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-assignment-export-injected", "true");
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-block";
    wrapper.style.marginLeft = "12px";

    const linkContainer = document.createElement("a");
    linkContainer.id = "scaler-export-btn";
    linkContainer.href = "javascript:void(0);";
    linkContainer.className = "scaler-export-assignment";
    linkContainer.style.display = "inline-flex";
    linkContainer.style.alignItems = "center";
    linkContainer.style.justifyContent = "center";
    linkContainer.style.width = "32px";
    linkContainer.style.height = "32px";
    linkContainer.style.padding = "6px";
    // LeetCode-like button styles
    linkContainer.style.backgroundColor = "#ffefd6";
    linkContainer.style.borderRadius = "8px";
    linkContainer.style.boxShadow = "none";
    linkContainer.style.textDecoration = "none";
    linkContainer.style.transition = "all 0.2s ease";
    linkContainer.style.cursor = "pointer";
    linkContainer.style.color = "#000";
    linkContainer.removeAttribute("title"); // Use custom tooltip instead
    linkContainer.setAttribute("aria-label", "Export Assignment");
    linkContainer.style.outline = "none";

    linkContainer.addEventListener("focus", () => {
        linkContainer.style.boxShadow = "0 0 0 2px var(--color-primary-light, rgba(99, 102, 241, 0.4))";
    });
    linkContainer.addEventListener("blur", () => {
        linkContainer.style.boxShadow = "none";
    });

    const exportIcon = document.createElement("span");
    exportIcon.id = "scaler-export-icon";
    exportIcon.innerHTML = ICONS.download;
    exportIcon.style.width = "18px";
    exportIcon.style.height = "18px";
    exportIcon.style.display = "flex";
    exportIcon.style.alignItems = "center";
    exportIcon.style.justifyContent = "center";

    linkContainer.appendChild(exportIcon);

    // Custom Tooltip
    const tooltip = document.createElement("div");
    tooltip.id = "scaler-export-tooltip";
    tooltip.innerText = "Export";
    tooltip.style.position = "absolute";
    tooltip.style.bottom = "calc(100% + 8px)";
    tooltip.style.left = "50%";
    tooltip.style.transform = "translateX(-50%)";
    tooltip.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
    tooltip.style.color = "#ffffff";
    tooltip.style.padding = "4px 8px";
    tooltip.style.borderRadius = "4px";
    tooltip.style.fontSize = "12px";
    tooltip.style.fontFamily = "inherit";
    tooltip.style.whiteSpace = "nowrap";
    tooltip.style.pointerEvents = "none";
    tooltip.style.opacity = "0";
    tooltip.style.visibility = "hidden";
    tooltip.style.transition = "opacity 0.2s ease, visibility 0.2s ease";
    tooltip.style.zIndex = "10000";

    wrapper.appendChild(tooltip);

    const dropdownMenu = document.createElement("div");
    dropdownMenu.style.position = "absolute";
    dropdownMenu.style.top = "100%";
    dropdownMenu.style.right = "0";
    dropdownMenu.style.marginTop = "4px";
    dropdownMenu.style.backgroundColor = "#fff";
    dropdownMenu.style.border = "1px solid #ddd";
    dropdownMenu.style.borderRadius = "6px";
    dropdownMenu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
    dropdownMenu.style.display = "none";
    dropdownMenu.style.flexDirection = "column";
    dropdownMenu.style.minWidth = "160px";
    dropdownMenu.style.zIndex = "9999";
    dropdownMenu.style.overflow = "hidden";

    const optCurrent = document.createElement("div");
    optCurrent.innerText = "Export This Problem";
    optCurrent.style.padding = "8px 12px";
    optCurrent.style.fontSize = "13px";
    optCurrent.style.cursor = "pointer";
    optCurrent.style.color = "#333";
    optCurrent.style.transition = "background-color 0.2s";
    optCurrent.addEventListener("mouseenter", () => {
        if (!wrapper.hasAttribute("data-exporting")) optCurrent.style.backgroundColor = "#f5f5f5";
    });
    optCurrent.addEventListener("mouseleave", () => optCurrent.style.backgroundColor = "transparent");

    const optAll = document.createElement("div");
    optAll.innerText = "Export All (ZIP)";
    optAll.style.padding = "8px 12px";
    optAll.style.fontSize = "13px";
    optAll.style.cursor = "pointer";
    optAll.style.color = "#333";
    optAll.style.borderTop = "1px solid #eee";
    optAll.style.transition = "background-color 0.2s";
    optAll.addEventListener("mouseenter", () => {
        if (!wrapper.hasAttribute("data-exporting")) optAll.style.backgroundColor = "#f5f5f5";
    });
    optAll.addEventListener("mouseleave", () => optAll.style.backgroundColor = "transparent");

    const optCopyCurrent = document.createElement("div");
    optCopyCurrent.innerText = "Copy This Problem";
    optCopyCurrent.style.padding = "8px 12px";
    optCopyCurrent.style.fontSize = "13px";
    optCopyCurrent.style.cursor = "pointer";
    optCopyCurrent.style.color = "#333";
    optCopyCurrent.style.borderTop = "1px solid #eee";
    optCopyCurrent.style.transition = "background-color 0.2s";
    optCopyCurrent.addEventListener("mouseenter", () => {
        if (!wrapper.hasAttribute("data-exporting")) optCopyCurrent.style.backgroundColor = "#f5f5f5";
    });
    optCopyCurrent.addEventListener("mouseleave", () => optCopyCurrent.style.backgroundColor = "transparent");

    const optCopyAll = document.createElement("div");
    optCopyAll.innerText = "Copy All";
    optCopyAll.style.padding = "8px 12px";
    optCopyAll.style.fontSize = "13px";
    optCopyAll.style.cursor = "pointer";
    optCopyAll.style.color = "#333";
    optCopyAll.style.transition = "background-color 0.2s";
    optCopyAll.addEventListener("mouseenter", () => {
        if (!wrapper.hasAttribute("data-exporting")) optCopyAll.style.backgroundColor = "#f5f5f5";
    });
    optCopyAll.addEventListener("mouseleave", () => optCopyAll.style.backgroundColor = "transparent");

    dropdownMenu.appendChild(optCurrent);
    dropdownMenu.appendChild(optAll);
    dropdownMenu.appendChild(optCopyCurrent);
    dropdownMenu.appendChild(optCopyAll);
    wrapper.appendChild(linkContainer);
    wrapper.appendChild(dropdownMenu);

    linkContainer.addEventListener("mouseenter", () => {
        tooltip.style.opacity = "1";
        tooltip.style.visibility = "visible";
        if (!wrapper.hasAttribute("data-exporting")) {
            linkContainer.style.backgroundColor = "#fcb84b";
            linkContainer.style.transform = "translateY(-2px) scale(1.02)";
            linkContainer.style.boxShadow = "0 4px 12px rgba(252, 184, 75, 0.3)";
        }
    });
    linkContainer.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
        tooltip.style.visibility = "hidden";
        if (!wrapper.hasAttribute("data-exporting")) {
            linkContainer.style.transform = "translateY(0) scale(1)"; // reset active state
            linkContainer.style.backgroundColor = "#ffefd6";
            linkContainer.style.boxShadow = "none";
        }
    });
    linkContainer.addEventListener("mousedown", () => {
        if (!wrapper.hasAttribute("data-exporting")) {
            linkContainer.style.transform = "translateY(0) scale(0.96)";
            linkContainer.style.backgroundColor = "#fcb84b";
        }
    });
    linkContainer.addEventListener("mouseup", () => {
        if (!wrapper.hasAttribute("data-exporting")) {
            linkContainer.style.transform = "translateY(-2px) scale(1.02)";
            linkContainer.style.backgroundColor = "#fcb84b";
        }
    });

    const closeDropdown = () => {
        dropdownMenu.style.display = "none";
    };

    linkContainer.addEventListener("click", (e) => {
        e.stopPropagation();

        // Copy All finished collecting and is waiting for this click (a fresh
        // user gesture) to actually write to the clipboard.
        if (wrapper.hasAttribute("data-copy-ready")) {
            const state = copyAllReadyState;
            clearCopyAllReady(true);
            if (state && typeof state.onConfirm === "function") state.onConfirm();
            return;
        }

        if (wrapper.hasAttribute("data-exporting")) return;

        // Close any other open dropdowns globally
        document.querySelectorAll("[data-assignment-export-injected] > div:nth-child(2)").forEach(menu => {
            if (menu !== dropdownMenu) menu.style.display = "none";
        });
        
        dropdownMenu.style.display = dropdownMenu.style.display === "none" ? "flex" : "none";
    });

    document.addEventListener("click", (e) => {
        if (!wrapper.contains(e.target)) {
            closeDropdown();
        }
    });
    
    // Wrapper for exporting clicks to disable UI
    const handleExport = (callback, isBulk) => {
        if (wrapper.hasAttribute("data-exporting")) return;
        wrapper.setAttribute("data-exporting", "true");
        tooltip.innerText = "Exporting...";
        
        if (isBulk) {
            startBulkExportAnimation("");
        }
        
        linkContainer.style.backgroundColor = "#ffefd6";
        linkContainer.style.cursor = "not-allowed";
        linkContainer.style.transform = "translateY(0) scale(1)";
        linkContainer.style.boxShadow = "none";
        closeDropdown();
        callback();
    };

    optCurrent.addEventListener("click", (e) => {
        e.stopPropagation();
        handleExport(onExportCurrent, false);
    });

    optAll.addEventListener("click", (e) => {
        e.stopPropagation();
        handleExport(onExportAll, true);
    });

    optCopyCurrent.addEventListener("click", (e) => {
        e.stopPropagation();
        handleExport(onCopyCurrent, false);
    });

    optCopyAll.addEventListener("click", (e) => {
        e.stopPropagation();
        handleExport(onCopyAll, true);
    });

    headingTextDiv.appendChild(wrapper);
}
