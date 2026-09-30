// ============================================
// features/assignmentExport/markdown.js
// Handles markdown generation
// ============================================

/**
 * Converts parsed data into a formatted Markdown string
 */
function generateMarkdown({ title, sessionTitle, questionNumber, questionType, statement, mcqOptions, code }) {
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    return [
        "# " + (title || "Assignment"),
        "",
        "**Session:**",
        (sessionTitle || "Unknown"),
        "",
        "**Question Number:**",
        (questionNumber || "1"),
        "",
        "**Question Type:**",
        (questionType || "Coding"),
        "",
        "**Exported using:**",
        "Scaler++",
        "",
        "**Export Date:**",
        today,
        "",
        "---",
        "",
        "## Problem Statement",
        (statement || "No problem statement found."),
        "",
        mcqOptions ? mcqOptions : "## Code\n````\n" + (code || "No code found in the editor.") + "\n````\n"
    ].filter(s => s !== undefined && s !== null).join("\n");
}

/**
 * Escapes a value for safe insertion into HTML text content.
 */
function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Parses the Markdown-ish lines produced by extractMCQOptions() (e.g.
 * "- [ ] **A)** Option text") into structured {letter, text} items. A line
 * that doesn't match the expected pattern is kept as {raw: line} rather than
 * dropped, so both generateHtml() and generatePlainText() can still render it.
 */
function parseMcqOptionLines(mcqOptions) {
    if (!mcqOptions) return [];
    const optionPattern = /^-\s*\[ \]\s*\*\*([^)]+)\)\*\*\s*(.*)$/;
    return String(mcqOptions)
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0 && !/^##\s*Options$/i.test(line))
        .map(line => {
            const match = line.match(optionPattern);
            return match ? { letter: match[1], text: match[2] } : { raw: line };
        });
}

/**
 * Converts parsed data into the rendered HTML equivalent of generateMarkdown()'s
 * output, for putting a rich preview (rather than raw Markdown source) on the
 * clipboard. Every scraped value is HTML-escaped before insertion.
 */
function generateHtml({ title, sessionTitle, questionNumber, questionType, statement, code, mcqOptions }) {
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    const metaRow = (label, value) =>
        '<p style="margin:4px 0;"><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</p>';

    const statementHtml = escapeHtml(statement || "No problem statement found.")
        .split(/\n\s*\n/)
        .map(block => '<p style="margin:8px 0;">' + block.split("\n").join("<br>") + '</p>')
        .join("\n");

    const optionItems = parseMcqOptionLines(mcqOptions);
    let bodyHtml;
    if (optionItems.length > 0) {
        const listItems = optionItems
            .map(item => item.raw !== undefined
                ? '<li>' + escapeHtml(item.raw) + '</li>'
                : '<li>☐ <strong>' + escapeHtml(item.letter) + ')</strong> ' + escapeHtml(item.text) + '</li>')
            .join("\n");
        bodyHtml =
            '<h2 style="margin:16px 0 8px;">Options</h2>' +
            '<ul style="list-style:none;padding-left:0;margin:0;">' + listItems + '</ul>';
    } else {
        bodyHtml =
            '<h2 style="margin:16px 0 8px;">Code</h2>' +
            '<pre style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;background:#f5f5f5;' +
            'padding:12px;border-radius:6px;white-space:pre;overflow-x:auto;margin:0;">' +
            '<code>' + escapeHtml(code || "No code found in the editor.") + '</code></pre>';
    }

    return (
        '<div>' +
        '<h1 style="margin:0 0 12px;">' + escapeHtml(title || "Assignment") + '</h1>' +
        metaRow("Session", sessionTitle || "Unknown") +
        metaRow("Question Number", questionNumber || "1") +
        metaRow("Question Type", questionType || "Coding") +
        metaRow("Exported using", "Scaler++") +
        metaRow("Export Date", today) +
        '<hr style="margin:16px 0;">' +
        '<h2 style="margin:16px 0 8px;">Problem Statement</h2>' +
        statementHtml +
        bodyHtml +
        '</div>'
    );
}

/**
 * Converts parsed data into a clean, symbol-free plain-text rendering — no
 * "#", "**" or code fences — for paste targets that only read text/plain.
 */
function generatePlainText({ title, sessionTitle, questionNumber, questionType, statement, code, mcqOptions }) {
    const today = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    const lines = [
        title || "Assignment",
        "",
        "Session: " + (sessionTitle || "Unknown"),
        "Question Number: " + (questionNumber || "1"),
        "Question Type: " + (questionType || "Coding"),
        "Exported using: Scaler++",
        "Export Date: " + today,
        "",
        "----------------------------------------",
        "",
        "Problem Statement",
        (statement || "No problem statement found."),
        ""
    ];

    const optionItems = parseMcqOptionLines(mcqOptions);
    if (optionItems.length > 0) {
        lines.push("Options");
        optionItems.forEach(item => {
            lines.push(item.raw !== undefined ? item.raw : item.letter + ") " + item.text);
        });
    } else {
        lines.push("Code");
        lines.push(code || "No code found in the editor.");
    }

    return lines.join("\n");
}

/**
 * Joins every problem's rendered HTML into one combined document for
 * "Copy All", in the given order, with a header and a visible divider
 * between problems.
 */
function joinProblemsHtml(sessionTitle, results) {
    const list = results || [];
    const n = list.length;
    const parts = [
        '<h1 style="margin:0 0 4px;">' + escapeHtml(sessionTitle || "Assignment") + '</h1>',
        '<p style="margin:0 0 16px;">' + n + ' problems exported by Scaler++</p>'
    ];
    list.forEach((r, i) => {
        if (i > 0) {
            parts.push(
                '<hr style="margin:24px 0 8px;">' +
                '<p style="color:#888888;font-size:12px;margin:0 0 12px;">Problem ' + (i + 1) + ' of ' + n + '</p>'
            );
        }
        parts.push(generateHtml(r.fields));
    });
    return '<div>' + parts.join("\n") + '</div>';
}

/**
 * Joins every problem's plain-text rendering (see COPY_PLAIN_TEXT_FORMAT in
 * clipboard.js) into one combined string for "Copy All", in the given order,
 * with a header and a divider between problems. In "markdown" mode the
 * divider is an HTML-comment so it can't be confused with the "---" a single
 * problem's own Markdown rendering may contain; in "rendered" mode (the
 * default) it's a plain line, since an HTML comment would itself be a stray
 * markup symbol in an otherwise symbol-free plain-text rendering.
 */
function joinProblemsPlainText(sessionTitle, results) {
    const list = results || [];
    const n = list.length;
    const useMarkdown = typeof COPY_PLAIN_TEXT_FORMAT !== "undefined" && COPY_PLAIN_TEXT_FORMAT === "markdown";
    const renderOne = (fields) => useMarkdown ? generateMarkdown(fields) : generatePlainText(fields);
    const dividerFor = (n1) => useMarkdown
        ? "\n\n<!-- ========== Problem " + n1 + " of " + n + " ========== -->\n\n"
        : "\n\n========== Problem " + n1 + " of " + n + " ==========\n\n";

    const header = (sessionTitle || "Assignment") + "\n\n" + n + " problems exported by Scaler++\n";
    const body = list
        .map((r, i) => (i === 0 ? "" : dividerFor(i + 1)) + renderOne(r.fields))
        .join("");

    return header + "\n" + body;
}
