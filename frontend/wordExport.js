/**
 * Export markdown report to Word document format
 * Uses Word XML format for compatibility without external libraries
 */

/**
 * Escape XML special characters
 */
const escapeXml = (text) => {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

/**
 * Convert markdown text to Word XML runs (with formatting)
 */
const markdownToWordRuns = (text) => {
    if (!text) return '';

    let runs = '';
    let remaining = text;

    // Convert bold
    remaining = remaining.replace(/\*\*(.+?)\*\*/g, '<BOLD>$1</BOLD>');
    remaining = remaining.replace(/__(.+?)__/g, '<BOLD>$1</BOLD>');

    // Convert italic
    remaining = remaining.replace(/\*(.+?)\*/g, '<ITALIC>$1</ITALIC>');
    remaining = remaining.replace(/_(.+?)_/g, '<ITALIC>$1</ITALIC>');

    // Convert code
    remaining = remaining.replace(/`(.+?)`/g, '<CODE>$1</CODE>');

    // Parse the tagged text
    const parts = remaining.split(/(<BOLD>|<\/BOLD>|<ITALIC>|<\/ITALIC>|<CODE>|<\/CODE>)/);

    let currentBold = false;
    let currentItalic = false;
    let currentCode = false;

    for (const part of parts) {
        if (part === '<BOLD>') {
            currentBold = true;
        } else if (part === '</BOLD>') {
            currentBold = false;
        } else if (part === '<ITALIC>') {
            currentItalic = true;
        } else if (part === '</ITALIC>') {
            currentItalic = false;
        } else if (part === '<CODE>') {
            currentCode = true;
        } else if (part === '</CODE>') {
            currentCode = false;
        } else if (part) {
            const escapedText = escapeXml(part);
            let rPr = '';

            if (currentBold || currentItalic || currentCode) {
                rPr = '<w:rPr>';
                if (currentBold) rPr += '<w:b/><w:bCs/>';
                if (currentItalic) rPr += '<w:i/><w:iCs/>';
                if (currentCode) rPr += '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>';
                rPr += '</w:rPr>';
            }

            runs += `<w:r>${rPr}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
        }
    }

    return runs;
};

/**
 * Generate a Word paragraph from text
 */
const generateParagraph = (text, headingLevel = 0) => {
    const runs = markdownToWordRuns(text);

    let pPr = '<w:pPr>';

    // Apply heading styles
    if (headingLevel > 0) {
        const fontSize = headingLevel === 1 ? 32 : headingLevel === 2 ? 26 : headingLevel === 3 ? 22 : 20;
        pPr += `<w:pStyle w:val="Heading${headingLevel}"/>`;
        pPr += `<w:rPr><w:b/><w:bCs/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>`;
    } else {
        pPr += '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
    }

    pPr += '</w:pPr>';

    return `<w:p>${pPr}${runs}</w:p>`;
};

/**
 * Generate Word list item
 */
const generateListItem = (text) => {
    const runs = markdownToWordRuns(text);

    const pPr = `
        <w:pPr>
            <w:pStyle w:val="ListParagraph"/>
            <w:numPr>
                <w:ilvl w:val="0"/>
                <w:numId w:val="1"/>
            </w:numPr>
        </w:pPr>
    `;

    return `<w:p>${pPr}${runs}</w:p>`;
};

/**
 * Parse markdown content and generate Word XML paragraphs
 */
const parseContentToWordXml = (content) => {
    if (!content || !content.trim()) return '';

    const lines = content.split('\n');
    let xml = '';
    let currentParagraph = [];
    let inList = false;

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            xml += generateParagraph(currentParagraph.join(' '));
            currentParagraph = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            inList = false;
            continue;
        }

        // Check for list items
        const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
            flushParagraph();
            xml += generateListItem(listMatch[1]);
            inList = true;
            continue;
        }

        // Regular text
        if (inList) {
            inList = false;
        }
        currentParagraph.push(trimmed);
    }

    flushParagraph();
    return xml;
};

/**
 * Recursively generate Word XML from sections
 */
const sectionsToWordXml = (sections) => {
    let xml = '';

    for (const section of sections) {
        // Add section heading
        xml += generateParagraph(section.title, section.level);

        // Add section content
        if (section.content && section.content.trim()) {
            xml += parseContentToWordXml(section.content);
        }

        // Add child sections
        if (section.children && section.children.length > 0) {
            xml += sectionsToWordXml(section.children);
        }
    }

    return xml;
};

/**
 * Generate complete Word document XML
 */
const generateWordXml = (sections, title = 'Report') => {
    const contentXml = sectionsToWordXml(sections);

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <w:body>
        ${generateParagraph(title, 1)}
        ${contentXml}
        <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840"/>
            <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
        </w:sectPr>
    </w:body>
</w:document>`;
};

/**
 * Create a downloadable Word document from markdown sections
 * Note: This creates a simplified .doc format (Word XML), not .docx
 */
export const exportToWord = (sections, filename = 'report.doc') => {
    if (!sections || sections.length === 0) {
        alert('No content to export');
        return;
    }

    const wordXml = generateWordXml(sections, 'TTA Summary Report');

    // Create a blob with the Word XML
    const blob = new Blob([wordXml], {
        type: 'application/msword'
    });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Alternative: Export as HTML (can be opened in Word)
 */
export const exportToHtml = (sections, filename = 'report.html') => {
    if (!sections || sections.length === 0) {
        alert('No content to export');
        return;
    }

    let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>TTA Summary Report</title>
    <style>
        body {
            font-family: 'Calibri', 'Arial', sans-serif;
            max-width: 800px;
            margin: 40px auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 { font-size: 24pt; color: #2c3e50; margin-top: 20px; }
        h2 { font-size: 18pt; color: #34495e; margin-top: 16px; }
        h3 { font-size: 14pt; color: #34495e; margin-top: 12px; }
        h4, h5, h6 { font-size: 12pt; color: #34495e; margin-top: 10px; }
        p { margin: 10px 0; }
        ul { margin: 10px 0; padding-left: 30px; }
        li { margin: 5px 0; }
        strong, b { font-weight: bold; }
        em, i { font-style: italic; }
        code {
            font-family: 'Courier New', monospace;
            background-color: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <h1>TTA Summary Report</h1>
`;

    const sectionToHtml = (section) => {
        let sectionHtml = '';

        // Add heading
        sectionHtml += `<h${section.level}>${escapeHtml(section.title)}</h${section.level}>`;

        // Add content
        if (section.content && section.content.trim()) {
            const contentHtml = markdownToHtml(section.content);
            sectionHtml += contentHtml;
        }

        // Add children
        if (section.children && section.children.length > 0) {
            for (const child of section.children) {
                sectionHtml += sectionToHtml(child);
            }
        }

        return sectionHtml;
    };

    for (const section of sections) {
        html += sectionToHtml(section);
    }

    html += `
</body>
</html>`;

    // Create blob and download
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/**
 * Escape HTML special characters
 */
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Convert markdown content to HTML
 */
const markdownToHtml = (content) => {
    if (!content) return '';

    let html = '';
    const lines = content.split('\n');
    let currentParagraph = [];
    let inList = false;

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            const text = currentParagraph.join(' ');
            html += `<p>${formatInlineMarkdown(text)}</p>\n`;
            currentParagraph = [];
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            if (inList) {
                html += '</ul>\n';
                inList = false;
            }
            continue;
        }

        // Check for list items
        const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
            flushParagraph();
            if (!inList) {
                html += '<ul>\n';
                inList = true;
            }
            html += `<li>${formatInlineMarkdown(listMatch[1])}</li>\n`;
            continue;
        }

        // Regular text
        if (inList) {
            html += '</ul>\n';
            inList = false;
        }
        currentParagraph.push(trimmed);
    }

    flushParagraph();
    if (inList) {
        html += '</ul>\n';
    }

    return html;
};

/**
 * Format inline markdown (bold, italic, code) to HTML
 */
const formatInlineMarkdown = (text) => {
    if (!text) return '';

    let result = escapeHtml(text);

    // Convert bold
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

    // Convert italic
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/_(.+?)_/g, '<em>$1</em>');

    // Convert code
    result = result.replace(/`(.+?)`/g, '<code>$1</code>');

    return result;
};
