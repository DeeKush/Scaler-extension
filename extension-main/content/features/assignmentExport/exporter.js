// ============================================
// features/assignmentExport/exporter.js
// Orchestrates the export pipelines
// ============================================



let isExporting = false;

/**
 * Scrapes the current page into the same fields object generateMarkdown(),
 * generateHtml() and generatePlainText() all accept, so Export and Copy stay
 * byte-identical to each other for the same scraped data.
 */
async function buildCurrentProblemFields() {
    const title = extractProblemTitle(document);
    const statement = extractProblemStatement(document);
    const mcqOptions = extractMCQOptions(document);
    const sessionTitle = extractSessionTitle(document);
    const questionType = determineQuestionType(document, mcqOptions);
    const code = await getEditorCode();
    return { title, sessionTitle, questionNumber: "1", questionType, statement, mcqOptions, code };
}

/**
 * Orchestrates the export of the current active problem.
 *
 * @purpose Coordinates data extraction, Markdown generation, and single file downloading.
 * @returns {Promise<void>}
 * @sideeffects Updates UI loading state, reads DOM, triggers browser download.
 * @failures Aborts if already exporting. Displays an alert if extraction or download fails.
 */
async function exportAssignment() {
    if (isExporting) return;
    isExporting = true;

    try {
        updateExportButtonText("Exporting...");

        const fields = await buildCurrentProblemFields();
        const markdownContent = generateMarkdown(fields);

        // Sanitize and Download
        const safeTitle = (fields.title || "Assignment")
            .replace(/[\\/:*?"<>|]/g, "")
            .replace(/\s+/g, " ")
            .replace(/^\.+|\.+$/g, "") // Remove leading/trailing dots
            .substring(0, 80)
            .trim();

        const filename = `01 - ${safeTitle || "Problem"}.md`;
        const blob = new Blob([markdownContent], { type: "text/markdown" });
        downloadBlob(blob, filename);

        setExportStatus("success");
    } catch (e) {
        console.error("Assignment Export failed:", e);
        setExportStatus("error");
    } finally {
        isExporting = false;
    }
}

/**
 * Orchestrates copying the current active problem to the clipboard as a
 * rendered preview (HTML) with a plain-text companion.
 *
 * @purpose Mirrors exportAssignment()'s scraping exactly (via
 *          buildCurrentProblemFields()) so Copy reflects the same data as
 *          Export, but writes to the clipboard instead of downloading a file.
 * @returns {Promise<void>}
 * @sideeffects Updates UI loading state, reads DOM, writes to the clipboard.
 * @failures Aborts if already exporting/copying. Shows an error status on failure.
 */
async function copyAssignment() {
    if (isExporting) return;
    isExporting = true;

    try {
        updateExportButtonText("Copying...");

        const fields = await buildCurrentProblemFields();
        const html = generateHtml(fields);
        const plainText = (typeof COPY_PLAIN_TEXT_FORMAT !== "undefined" && COPY_PLAIN_TEXT_FORMAT === "markdown")
            ? generateMarkdown(fields)
            : generatePlainText(fields);

        const success = await copyRich(html, plainText);
        setExportStatus(success ? "success" : "error", success ? "Copied!" : "Copy failed");
    } catch (e) {
        console.error("Assignment Copy failed:", e);
        setExportStatus("error", "Copy failed");
    } finally {
        isExporting = false;
    }
}


/**
 * Discovers, canonicalizes and deduplicates every problem link in the
 * assignment sidebar. Shared by both Export All (ZIP) and Copy All.
 */
function discoverProblemLinks() {
    // Scan the entire document as strict URL canonicalization prevents duplicate/false exports
    const rawLinks = Array.from(document.querySelectorAll('a[href*="/assignment/problems/"], a[href*="/homework/problems/"]'))
        .map(a => a.href)
        .filter(href => href.startsWith('http'));

    const canonicalLinks = rawLinks.map(href => {
        try {
            const url = new URL(href);
            url.search = ''; // Remove query parameters
            url.hash = '';   // Remove hash fragments

            // Split path into segments and remove empty strings (handles trailing slashes)
            const parts = url.pathname.split('/').filter(Boolean);

            const problemsIdx = parts.indexOf('problems');
            if (problemsIdx === -1 || problemsIdx + 1 >= parts.length) {
                return null;
            }

            const type = parts[problemsIdx - 1];
            if (type !== 'assignment' && type !== 'homework') {
                return null;
            }

            // Reconstruct pathname up to the problem ID, dropping anything after (like /hints)
            const canonicalParts = parts.slice(0, problemsIdx + 2);
            url.pathname = '/' + canonicalParts.join('/');

            return url.href;
        } catch (e) {
            return null;
        }
    }).filter(Boolean);

    return [...new Set(canonicalLinks)];
}

/**
 * Scrapes every problem in `uniqueLinks` via a hidden iframe worker-pool
 * (shared by Export All and Copy All) and returns the index-sorted results.
 *
 * @param {string[]} uniqueLinks
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<{sessionTitle: string, safeSessionFolder: string, results: Array<{index:number, filename:string, fields:object}>, errors: Array}>}
 */
async function collectAllProblemFields(uniqueLinks, onProgress) {
    const sessionTitle = extractSessionTitle(document);
    const safeSessionFolder = sessionTitle
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, " ")
        .replace(/^\.+|\.+$/g, "")
        .trim() || "Assignment";

    let nextIndex = 0;
    let completedCount = 0;
    const results = [];
    const errors = [];

    const worker = async () => {
        while (nextIndex < uniqueLinks.length) {
            const i = nextIndex++;
            const url = uniqueLinks[i];
            try {
                const result = await processProblem(url, i, sessionTitle, safeSessionFolder);
                if (result) results.push(result);
            } catch (e) {
                console.warn(`Failed to process problem at ${url}`, e);
                errors.push({ url, error: e });
            }
            completedCount++;
            if (onProgress) onProgress(completedCount, uniqueLinks.length);
        }
    };

    // Max concurrency: 6
    const maxConcurrency = Math.min(6, uniqueLinks.length);
    const workers = Array.from({ length: maxConcurrency }, () => worker());
    await Promise.all(workers);

    // Preserve deterministic output order despite parallel completion order
    results.sort((a, b) => a.index - b.index);

    return { sessionTitle, safeSessionFolder, results, errors };
}

/**
 * Orchestrates the bulk export of all assignment problems in the sidebar.
 *
 * @purpose Iterates through sidebar links, scrapes them via hidden iframe, zips them, and triggers a download.
 * @returns {Promise<void>}
 * @sideeffects Updates UI loading state, spawns hidden iframe, builds JSZip archive in memory, triggers browser download.
 * @failures Aborts if already exporting, if sidebar links are missing, or if JSZip fails to initialize. Skips individual problems on timeout/error.
 */
async function exportAllAssignments() {
    if (isExporting) return;
    isExporting = true;

    const uniqueLinks = discoverProblemLinks();
    if (uniqueLinks.length === 0) {
        alert("Could not find other problems in the assignment sidebar.");
        isExporting = false;
        return;
    }

    let zip;
    try {
        zip = createZip();
    } catch (e) {
        alert(e.message);
        isExporting = false;
        return;
    }

    try {
        const { safeSessionFolder, results, errors } = await collectAllProblemFields(uniqueLinks, (done, total) => {
            updateExportButtonText(`Exporting ${done}/${total}...`);
        });

        updateExportButtonText("Zipping...");

        for (const r of results) {
            addFileToZip(zip, r.filename, generateMarkdown(r.fields));
        }

        if (errors.length > 0) {
            console.warn("Some problems failed to export:", errors);
        }

        const blob = await generateZipBlob(zip);
        downloadBlob(blob, `${safeSessionFolder}.zip`);

        setExportStatus("success");
    } catch(e) {
        console.error("Bulk Assignment Export failed:", e);
        setExportStatus("error");
    } finally {
        isExporting = false;
    }
}

/**
 * Orchestrates copying every assignment problem to the clipboard as one
 * combined rendered document, using a focus-safe two-step confirmation.
 *
 * @purpose Reuses the same discovery/scraping pipeline as exportAllAssignments()
 *          (discoverProblemLinks + collectAllProblemFields) but joins the
 *          results into one HTML/plain-text pair instead of zipping them.
 *
 *          Collection can take many seconds, and navigator.clipboard requires
 *          a focused document + a fresh user gesture — both of which an
 *          `await`-heavy async flow can lose by the time it's ready to write.
 *          So this does NOT write to the clipboard itself: once collection
 *          finishes, it arms the button into a "ready to copy" state
 *          (setCopyAllReady) and the actual copyRich() call happens on the
 *          NEXT click, which is a fresh synchronous gesture. See
 *          docs/assignment-export.md "Copy Pipeline" for the full rationale.
 * @returns {Promise<void>}
 * @sideeffects Updates UI loading state, spawns hidden iframes, arms a
 *              60s "ready to copy" button state (see ui.js).
 * @failures Aborts if already exporting/copying, or if no sidebar links are
 *           found. Shows an error status if every problem fails to scrape.
 */
async function copyAllAssignments() {
    if (isExporting) return;
    isExporting = true;

    // Captured now, before collection starts, so a later SPA navigation that
    // swaps in a new button can't cause the ready state to arm the WRONG
    // (new) button once this page's collection finishes — see setCopyAllReady().
    const wrapper = document.querySelector("[data-assignment-export-injected]");

    const uniqueLinks = discoverProblemLinks();
    if (uniqueLinks.length === 0) {
        alert("Could not find other problems in the assignment sidebar.");
        isExporting = false;
        return;
    }

    try {
        const { sessionTitle, results, errors } = await collectAllProblemFields(uniqueLinks, (done, total) => {
            updateExportButtonText(`Collecting ${done}/${total}...`);
        });

        if (errors.length > 0) {
            console.warn("Some problems failed to copy:", errors);
        }

        if (results.length === 0) {
            setExportStatus("error", "Copy failed");
            isExporting = false;
            return;
        }

        const combinedHtml = joinProblemsHtml(sessionTitle, results);
        const combinedText = joinProblemsPlainText(sessionTitle, results);

        // Arm the "click to copy" ready state; isExporting is released either
        // when the user confirms (inside onConfirm) or when the ready state
        // is cancelled (timeout/teardown/re-injection, inside onCancel).
        setCopyAllReady(
            wrapper,
            results.length,
            async () => {
                try {
                    const success = await copyRich(combinedHtml, combinedText);
                    setExportStatus(success ? "success" : "error", success ? "Copied!" : "Copy failed");
                } finally {
                    isExporting = false;
                }
            },
            () => {
                isExporting = false;
            }
        );
    } catch (e) {
        console.error("Bulk Assignment Copy failed:", e);
        setExportStatus("error", "Copy failed");
        isExporting = false;
    }
}

/**
 * Processes a single problem URL within a hidden iframe
 */
async function processProblem(url, index, sessionTitle, safeSessionFolder) {
    const iframe = document.createElement('iframe');
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.position = 'absolute';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);
    
    try {
        iframe.src = url;
        
        // Wait for iframe to load (max 10 seconds)
        await Promise.race([
            new Promise(resolve => {
                const onload = () => {
                    iframe.removeEventListener('load', onload);
                    resolve();
                };
                iframe.addEventListener('load', onload);
            }),
            new Promise(resolve => setTimeout(resolve, 10000))
        ]);
        
        // Wait for statement to render
        await new Promise(resolve => {
            let retries = 20;
            const check = () => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc) throw new Error("No doc");
                    const statement = extractProblemStatement(doc);
                    if (statement && statement.trim().length > 0) {
                        resolve();
                    } else if (retries > 0) {
                        retries--;
                        setTimeout(check, 500);
                    } else {
                        resolve(); // Timeout, proceed anyway
                    }
                } catch (e) {
                    if (retries > 0) {
                        retries--;
                        setTimeout(check, 500);
                    } else {
                        resolve();
                    }
                }
            };
            setTimeout(check, 1000);
        });
        
        const doc = iframe.contentDocument;
        if (!doc) throw new Error("Failed to access iframe document");
        
        const title = extractProblemTitle(doc) || ("Problem_" + (index+1));
        const statement = extractProblemStatement(doc);
        const mcqOptions = extractMCQOptions(doc);
        const questionType = determineQuestionType(doc, mcqOptions);
        const code = getIframeEditorCode(iframe);

        const questionNumber = String(index + 1).padStart(2, '0');

        const fields = { title, sessionTitle, questionNumber, questionType, statement, mcqOptions, code };

        const safeTitle = title.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").replace(/^\.+|\.+$/g, "").substring(0, 80).trim();
        const filename = `${safeSessionFolder}/${questionNumber} - ${safeTitle || "Problem"}.md`;

        return { index, filename, fields };
    } finally {
        if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
    }
}
