/**
 * Simple markdown parser for hierarchical report structure
 * Parses markdown into a tree of sections based on heading levels
 */

/**
 * Parse markdown content into a hierarchical structure
 * @param {string} markdown - The markdown text to parse
 * @returns {Array} Array of section objects with nested children
 */
export const parseMarkdownToSections = (markdown) => {
    if (!markdown || typeof markdown !== 'string') {
        return [];
    }

    const lines = markdown.split('\n');
    const sections = [];
    const stack = [{ level: 0, children: sections }]; // Root level

    let currentSection = null;
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if line is a heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
            // Save previous section's content
            if (currentSection) {
                currentSection.content = currentContent.join('\n').trim();
            }

            const level = headingMatch[1].length;
            const title = headingMatch[2];

            // Create new section
            const newSection = {
                level,
                title,
                content: '',
                children: []
            };

            // Find the appropriate parent in the stack
            while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            // Add to parent's children
            const parent = stack[stack.length - 1];
            parent.children.push(newSection);

            // Add to stack
            stack.push(newSection);
            currentSection = newSection;
            currentContent = [];
        } else {
            // Add to current section's content
            currentContent.push(line);
        }
    }

    // Save the last section's content
    if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
    }

    return sections;
};

/**
 * Parse simple markdown formatting within text
 * Handles bold, italic, lists, and paragraphs
 * @param {string} text - Text to parse
 * @returns {Array} Array of parsed elements
 */
export const parseMarkdownContent = (text) => {
    if (!text) return [];

    const lines = text.split('\n');
    const elements = [];
    let currentParagraph = [];
    let inList = false;
    let listItems = [];

    const flushParagraph = () => {
        if (currentParagraph.length > 0) {
            elements.push({
                type: 'paragraph',
                content: currentParagraph.join(' ')
            });
            currentParagraph = [];
        }
    };

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push({
                type: 'list',
                items: listItems
            });
            listItems = [];
            inList = false;
        }
    };

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        // Check for list items
        const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (listMatch) {
            flushParagraph();
            inList = true;
            listItems.push(listMatch[1]);
            continue;
        }

        // Regular text
        if (inList) {
            flushList();
        }
        currentParagraph.push(trimmed);
    }

    flushParagraph();
    flushList();

    return elements;
};

/**
 * Format inline markdown (bold, italic, code)
 * Returns an array of text segments with formatting
 * @param {string} text - Text to format
 * @returns {Array} Array of {text, bold, italic, code} objects
 */
export const parseInlineMarkdown = (text) => {
    if (!text) return [{ text: '', bold: false, italic: false, code: false }];

    const segments = [];
    let remaining = text;

    // Simple regex patterns for inline formatting
    const patterns = [
        { regex: /\*\*(.+?)\*\*/g, style: 'bold' },
        { regex: /__(.+?)__/g, style: 'bold' },
        { regex: /\*(.+?)\*/g, style: 'italic' },
        { regex: /_(.+?)_/g, style: 'italic' },
        { regex: /`(.+?)`/g, style: 'code' }
    ];

    // For simplicity, we'll just handle bold and italic in order
    // A more robust solution would parse all simultaneously

    // Replace bold
    remaining = remaining.replace(/\*\*(.+?)\*\*/g, '<BOLD>$1</BOLD>');
    remaining = remaining.replace(/__(.+?)__/g, '<BOLD>$1</BOLD>');

    // Replace italic
    remaining = remaining.replace(/\*(.+?)\*/g, '<ITALIC>$1</ITALIC>');
    remaining = remaining.replace(/_(.+?)_/g, '<ITALIC>$1</ITALIC>');

    // Replace code
    remaining = remaining.replace(/`(.+?)`/g, '<CODE>$1</CODE>');

    // Now split and parse the tags
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
            segments.push({
                text: part,
                bold: currentBold,
                italic: currentItalic,
                code: currentCode
            });
        }
    }

    return segments.length > 0 ? segments : [{ text, bold: false, italic: false, code: false }];
};

/**
 * Flatten sections into a linear array (for Word document)
 * @param {Array} sections - Hierarchical sections
 * @returns {Array} Flattened array of sections
 */
export const flattenSections = (sections) => {
    const result = [];

    const traverse = (sectionList) => {
        for (const section of sectionList) {
            result.push({
                level: section.level,
                title: section.title,
                content: section.content
            });
            if (section.children && section.children.length > 0) {
                traverse(section.children);
            }
        }
    };

    traverse(sections);
    return result;
};
