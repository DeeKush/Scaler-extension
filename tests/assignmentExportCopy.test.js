const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Read markdown.js as a string and eval it so we can test the pure
// generateHtml/generatePlainText/joinProblems* functions it exports.
const markdownSrc = fs.readFileSync(path.join(__dirname, '../extension-main/content/features/assignmentExport/markdown.js'), 'utf8');
eval(markdownSrc);

test('Assignment Copy - generateHtml', async (t) => {

    await t.test('Renders a basic coding problem', () => {
        const html = generateHtml({
            title: 'Test Problem',
            sessionTitle: 'Test Session',
            questionNumber: '03',
            questionType: 'Coding',
            statement: 'This is the statement.',
            mcqOptions: null,
            code: 'console.log("hello");'
        });
        assert.match(html, /<h1[^>]*>Test Problem<\/h1>/);
        // Label and value render on one line (space-separated), matching how
        // the Markdown preview (soft line break) and generatePlainText() both
        // show them — not stacked with a <br>.
        assert.match(html, /<strong>Session:<\/strong> Test Session<\/p>/);
        assert.doesNotMatch(html, /<strong>Session:<\/strong><br>/);
        assert.match(html, /<h2[^>]*>Code<\/h2>/);
        assert.match(html, /<pre[^>]*><code>console\.log\(&quot;hello&quot;\);<\/code><\/pre>/);
        assert.doesNotMatch(html, /<h2[^>]*>Options<\/h2>/);
    });

    await t.test('Renders MCQ options as a checklist and skips the code block', () => {
        const html = generateHtml({
            title: 'MCQ Problem',
            sessionTitle: 'Test Session',
            questionNumber: '01',
            questionType: 'Single Correct MCQ',
            statement: 'What is 2+2?',
            mcqOptions: '\n## Options\n- [ ] **A)** 3\n- [ ] **B)** 4\n',
            code: ''
        });
        assert.match(html, /<h2[^>]*>Options<\/h2>/);
        assert.match(html, /<li>☐ <strong>B\)<\/strong> 4<\/li>/);
        assert.doesNotMatch(html, /<h2[^>]*>Code<\/h2>/);
    });

    await t.test('Falls back to the same defaults as generateMarkdown for missing fields', () => {
        const html = generateHtml({});
        assert.match(html, /<h1[^>]*>Assignment<\/h1>/);
        assert.match(html, /Unknown/);
        assert.match(html, /No problem statement found\./);
        assert.match(html, /No code found in the editor\./);
    });

    await t.test('Escapes a script tag in the statement', () => {
        const html = generateHtml({
            title: 'XSS Problem',
            statement: '<script>alert(1)</script>',
            code: ''
        });
        assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
        assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    });

    await t.test('Escapes < and & in code', () => {
        const html = generateHtml({
            title: 'Code Problem',
            code: 'if (a < b && b > 0) {}'
        });
        assert.match(html, /if \(a &lt; b &amp;&amp; b &gt; 0\) \{\}/);
        assert.doesNotMatch(html, /if \(a < b/);
    });

    await t.test('Splits the statement into paragraphs on blank lines, <br> on single newlines', () => {
        const html = generateHtml({
            title: 'Multiline',
            statement: 'Line one.\nLine two.\n\nSecond paragraph.'
        });
        assert.match(html, /<p[^>]*>Line one\.<br>Line two\.<\/p>/);
        assert.match(html, /<p[^>]*>Second paragraph\.<\/p>/);
    });

    await t.test('Keeps an unparseable MCQ line as escaped plain text instead of dropping it', () => {
        const html = generateHtml({
            title: 'Weird MCQ',
            mcqOptions: '\n## Options\nNot a checkbox line <b>bold</b>\n'
        });
        assert.match(html, /<li>Not a checkbox line &lt;b&gt;bold&lt;\/b&gt;<\/li>/);
    });
});

test('Assignment Copy - generatePlainText', async (t) => {

    await t.test('Contains no Markdown syntax', () => {
        const text = generatePlainText({
            title: 'Test Problem',
            sessionTitle: 'Test Session',
            questionNumber: '01',
            questionType: 'Coding',
            statement: 'Statement here.',
            code: 'const x = 1;'
        });
        assert.doesNotMatch(text, /#/);
        assert.doesNotMatch(text, /\*\*/);
        assert.doesNotMatch(text, /```/);
        assert.match(text, /Session: Test Session/);
        assert.match(text, /const x = 1;/);
    });

    await t.test('Preserves code indentation', () => {
        const code = 'function f() {\n    return 1;\n}';
        const text = generatePlainText({ title: 'Indent', code });
        assert.match(text, /function f\(\) \{\n {4}return 1;\n\}/);
    });

    await t.test('Renders MCQ options as plain "letter) text" lines', () => {
        const text = generatePlainText({
            title: 'MCQ',
            mcqOptions: '\n## Options\n- [ ] **A)** 3\n- [ ] **B)** 4\n'
        });
        assert.match(text, /Options\nA\) 3\nB\) 4/);
        assert.doesNotMatch(text, /Code/);
    });
});

test('Assignment Copy - joinProblemsHtml / joinProblemsPlainText', async (t) => {

    const first = { index: 0, fields: { title: 'First', sessionTitle: 'Session', questionNumber: '01', questionType: 'Coding', statement: 'S1', code: 'code1' } };
    const second = { index: 1, fields: { title: 'Second', sessionTitle: 'Session', questionNumber: '02', questionType: 'Coding', statement: 'S2', code: 'code2' } };
    const ordered = [first, second]; // callers (exporter.js) are responsible for sorting by index first

    await t.test('joinProblemsHtml includes a header and both problems in order with a divider', () => {
        const html = joinProblemsHtml('Session', ordered);
        assert.match(html, /<h1[^>]*>Session<\/h1>/);
        assert.match(html, /2 problems exported by Scaler\+\+/);
        const firstIdx = html.indexOf('First');
        const secondIdx = html.indexOf('Second');
        assert.ok(firstIdx > -1 && secondIdx > -1 && firstIdx < secondIdx);
        assert.match(html, /Problem 2 of 2/);
    });

    await t.test('joinProblemsPlainText (default "rendered" mode) uses a plain divider, no HTML comment', () => {
        const text = joinProblemsPlainText('Session', ordered);
        assert.match(text, /^Session\n\n2 problems exported by Scaler\+\+/);
        assert.match(text, /\n\n========== Problem 2 of 2 ==========\n\n/);
        assert.doesNotMatch(text, /<!--/);
        const firstIdx = text.indexOf('First');
        const secondIdx = text.indexOf('Second');
        assert.ok(firstIdx > -1 && secondIdx > -1 && firstIdx < secondIdx);
    });

    await t.test('joinProblemsPlainText ("markdown" mode) uses the HTML-comment-style divider', () => {
        global.COPY_PLAIN_TEXT_FORMAT = 'markdown';
        try {
            const text = joinProblemsPlainText('Session', ordered);
            assert.match(text, /<!-- ========== Problem 2 of 2 ========== -->/);
        } finally {
            delete global.COPY_PLAIN_TEXT_FORMAT;
        }
    });

    await t.test('Handles a single problem with no divider in either mode', () => {
        const html = joinProblemsHtml('Session', [first]);
        assert.doesNotMatch(html, /Problem 1 of 1/);

        const renderedText = joinProblemsPlainText('Session', [first]);
        assert.doesNotMatch(renderedText, /==========/);
        assert.doesNotMatch(renderedText, /<!--/);

        global.COPY_PLAIN_TEXT_FORMAT = 'markdown';
        try {
            const markdownText = joinProblemsPlainText('Session', [first]);
            assert.doesNotMatch(markdownText, /<!--/);
        } finally {
            delete global.COPY_PLAIN_TEXT_FORMAT;
        }
    });

    await t.test('Handles an empty list', () => {
        const html = joinProblemsHtml('Session', []);
        assert.match(html, /0 problems exported by Scaler\+\+/);
        const text = joinProblemsPlainText('Session', []);
        assert.match(text, /0 problems exported by Scaler\+\+/);
    });

    await t.test('Respects COPY_PLAIN_TEXT_FORMAT = "markdown" when set', () => {
        global.COPY_PLAIN_TEXT_FORMAT = 'markdown';
        try {
            const text = joinProblemsPlainText('Session', [first]);
            assert.match(text, /^# First/m);
        } finally {
            delete global.COPY_PLAIN_TEXT_FORMAT;
        }
    });
});
