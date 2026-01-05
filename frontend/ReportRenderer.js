import React, { useState } from 'react';
import { Box, Text, Icon } from '@airtable/blocks/ui';
import { parseInlineMarkdown, parseMarkdownContent } from './markdownParser';

/**
 * Renders formatted inline text with bold, italic, code support
 */
const InlineText = ({ text, size = 'default' }) => {
    const segments = parseInlineMarkdown(text);

    return (
        <Text size={size}>
            {segments.map((segment, idx) => {
                let style = {};
                if (segment.bold) style.fontWeight = 'bold';
                if (segment.italic) style.fontStyle = 'italic';
                if (segment.code) {
                    style.fontFamily = 'monospace';
                    style.backgroundColor = '#f0f0f0';
                    style.padding = '2px 4px';
                    style.borderRadius = '3px';
                }

                return (
                    <span key={idx} style={style}>
                        {segment.text}
                    </span>
                );
            })}
        </Text>
    );
};

/**
 * Renders markdown content (paragraphs, lists)
 */
const MarkdownContent = ({ content }) => {
    if (!content) return null;

    const elements = parseMarkdownContent(content);

    return (
        <Box marginTop={2}>
            {elements.map((element, idx) => {
                if (element.type === 'paragraph') {
                    return (
                        <Box key={idx} marginBottom={2}>
                            <InlineText text={element.content} />
                        </Box>
                    );
                } else if (element.type === 'list') {
                    return (
                        <Box key={idx} marginBottom={2} marginLeft={3}>
                            {element.items.map((item, itemIdx) => (
                                <Box key={itemIdx} display="flex" marginBottom={1}>
                                    <Text marginRight={2}>•</Text>
                                    <InlineText text={item} />
                                </Box>
                            ))}
                        </Box>
                    );
                }
                return null;
            })}
        </Box>
    );
};

/**
 * Collapsible section component for hierarchical display
 */
const CollapsibleSection = ({ section, depth = 0 }) => {
    const [isExpanded, setIsExpanded] = useState(true);

    const hasChildren = section.children && section.children.length > 0;
    const hasContent = section.content && section.content.trim().length > 0;

    // Determine heading size based on level
    const getHeadingSize = (level) => {
        switch (level) {
            case 1: return 'xlarge';
            case 2: return 'large';
            case 3: return 'default';
            default: return 'small';
        }
    };

    // Determine colors based on depth
    const getBackgroundColor = (level) => {
        switch (level) {
            case 1: return 'lightGray1';
            case 2: return 'white';
            case 3: return 'lightGray1';
            default: return 'white';
        }
    };

    const headingSize = getHeadingSize(section.level);
    const bgColor = getBackgroundColor(section.level);
    const leftMargin = depth * 2; // Indent nested sections

    return (
        <Box
            marginLeft={leftMargin}
            marginBottom={2}
            backgroundColor={bgColor}
            padding={2}
            borderRadius="default"
            border="default"
        >
            {/* Section Header */}
            <Box
                display="flex"
                alignItems="center"
                onClick={() => setIsExpanded(!isExpanded)}
                style={{ cursor: hasChildren || hasContent ? 'pointer' : 'default' }}
            >
                {(hasChildren || hasContent) && (
                    <Box marginRight={2}>
                        <Icon
                            name={isExpanded ? 'chevronDown' : 'chevronRight'}
                            size={16}
                        />
                    </Box>
                )}
                <Text size={headingSize} fontWeight="bold">
                    {section.title}
                </Text>
            </Box>

            {/* Section Content */}
            {isExpanded && hasContent && (
                <Box marginLeft={hasChildren || hasContent ? 4 : 0}>
                    <MarkdownContent content={section.content} />
                </Box>
            )}

            {/* Child Sections */}
            {isExpanded && hasChildren && (
                <Box marginTop={2}>
                    {section.children.map((child, idx) => (
                        <CollapsibleSection
                            key={idx}
                            section={child}
                            depth={depth + 1}
                        />
                    ))}
                </Box>
            )}
        </Box>
    );
};

/**
 * Main component for rendering the hierarchical report
 */
export const ReportRenderer = ({ sections }) => {
    if (!sections || sections.length === 0) {
        return (
            <Box padding={3}>
                <Text textColor="light">No report content to display.</Text>
            </Box>
        );
    }

    return (
        <Box>
            {sections.map((section, idx) => (
                <CollapsibleSection key={idx} section={section} depth={0} />
            ))}
        </Box>
    );
};

/**
 * Expand/Collapse All buttons component
 */
export const ReportControls = ({ sections, onExpandAll, onCollapseAll }) => {
    return (
        <Box display="flex" gap={2} marginBottom={2}>
            <Text
                onClick={onExpandAll}
                style={{
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    color: '#0084ff'
                }}
            >
                Expand All
            </Text>
            <Text
                onClick={onCollapseAll}
                style={{
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    color: '#0084ff'
                }}
            >
                Collapse All
            </Text>
        </Box>
    );
};
