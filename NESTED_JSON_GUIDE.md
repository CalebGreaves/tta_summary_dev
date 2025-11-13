# Nested JSON Structure Guide

## Overview

The hierarchical record list is now returned as a **nested JSON object** rather than a flat array. This structure is much better suited for processing by LLMs (Large Language Models) because it:

1. **Preserves hierarchy naturally** - Parent-child relationships are explicit in the structure
2. **Enables recursive processing** - LLMs can easily traverse nested structures
3. **Reduces context complexity** - Related records are grouped together
4. **Simplifies markdown generation** - Depth in the tree maps directly to markdown heading levels

## Structure Comparison

### Old Format (Flat Array)
```json
[
  { "recordName": "Goal 1", "hierarchyLevel": 1, ... },
  { "recordName": "Objective 1", "hierarchyLevel": 2, ... },
  { "recordName": "Activity 1", "hierarchyLevel": 3, ... },
  { "recordName": "Objective 2", "hierarchyLevel": 2, ... }
]
```

**Problems:**
- Hierarchy levels implied by field values
- Unclear parent-child relationships
- LLM must reconstruct the tree structure

### New Format (Nested Object)
```json
{
  "recordName": "Goal 1",
  "ttaSessions": [...],
  "children": [
    {
      "recordName": "Objective 1",
      "ttaSessions": [...],
      "children": [
        {
          "recordName": "Activity 1",
          "ttaSessions": [...],
          "children": []
        }
      ]
    },
    {
      "recordName": "Objective 2",
      "ttaSessions": [...],
      "children": []
    }
  ]
}
```

**Benefits:**
- Hierarchy is explicit in the JSON structure
- Parent-child relationships are clear
- Tree is already organized for processing
- Natural mapping to markdown heading levels

## How to Process in Automation

### Simple Recursive Function

```javascript
function generateReport(record, depth = 1) {
  // Format the heading using the type field for context
  const typeLabel = record.type.charAt(0).toUpperCase() + record.type.slice(1);
  const heading = '#'.repeat(depth) + ' ' + typeLabel + ': ' + record.recordName;

  // Add T/TA sessions for this record
  let report = heading + '\n\n';
  if (record.ttaSessions && record.ttaSessions.length > 0) {
    report += 'T/TA Sessions:\n';
    for (const session of record.ttaSessions) {
      report += '- ' + session.summary + '\n';
    }
    report += '\n';
  }

  // Recursively process children
  if (record.children && record.children.length > 0) {
    for (const child of record.children) {
      report += generateReport(child, depth + 1);
    }
  }

  return report;
}

// Usage:
const hierarchyData = JSON.parse(record.fields['Hierarchical Records']);
const report = generateReport(hierarchyData);
```

This produces output like:
```
# Goal: Improve Efficiency

T/TA Sessions:
- Planning session

## Objective: Streamline Process

T/TA Sessions:
- Implementation discussion

### Activity: Document Workflow
```

## Example Processing

Given this nested structure:

```json
{
  "recordId": "rec1",
  "type": "goal",
  "recordName": "Goal: Improve Efficiency",
  "ttaSessions": [
    { "id": "rec1", "summary": "Planning session" }
  ],
  "children": [
    {
      "recordId": "rec2",
      "type": "objective",
      "recordName": "Objective: Streamline Process",
      "ttaSessions": [
        { "id": "rec2", "summary": "Implementation discussion" }
      ],
      "children": [
        {
          "recordId": "rec3",
          "type": "activity",
          "recordName": "Activity: Document Workflow",
          "ttaSessions": [],
          "children": []
        }
      ]
    }
  ]
}
```

The LLM processes this as:

```
# Goal: Improve Efficiency
T/TA Sessions:
- Planning session

## Objective: Streamline Process
T/TA Sessions:
- Implementation discussion

### Activity: Document Workflow
```

## Key Advantages for LLM Integration

### 1. Natural Tree Traversal
The nested structure allows the LLM or your automation script to:
- Visit each node exactly once
- Know the exact depth for formatting
- Easily access parent context if needed

### 2. Cleaner Recursion
Instead of filtering by hierarchyLevel:
```javascript
// Old way
const levelTwoRecords = records.filter(r => r.hierarchyLevel === 2);
```

You can simply iterate children:
```javascript
// New way
for (const child of parent.children) {
  // Process child
}
```

### 3. Perfect for Markdown
Map nesting depth to heading levels automatically:
```javascript
const heading = '#'.repeat(depth);
```

No need to pass or calculate hierarchy levels.

### 4. LLM-Friendly Input
When feeding this to Claude or another LLM, the structure is:
- **Self-documenting** - The nesting shows the hierarchy
- **Compact** - No redundant hierarchy level fields
- **Composable** - LLM can easily extract subtrees for partial processing

## Example: Automation Script

This is the type of script you'd use in Airtable automation to process the nested JSON:

```javascript
// Main function to generate report
function generateReport(hierarchyJson) {
  return buildReport(JSON.parse(hierarchyJson), 1);
}

// Recursive helper
function buildReport(node, depth) {
  let output = '';

  // Add heading
  output += '#'.repeat(depth) + ' ' + node.recordName + '\n\n';

  // Add T/TA summary
  if (node.ttaSessions && node.ttaSessions.length > 0) {
    output += 'T/TA Sessions:\n';
    for (const session of node.ttaSessions) {
      output += '- ' + session.summary + '\n';
    }
    output += '\n';
  }

  // Process children
  if (node.children && node.children.length > 0) {
    for (const child of node.children) {
      output += buildReport(child, depth + 1);
    }
  }

  return output;
}

// Use in your automation:
const hierarchyData = trigger.input['Hierarchical Records'];
const report = generateReport(hierarchyData);

// Update the record with the generated report
```

## Field Reference

Each node in the tree has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `tableId` | string | Airtable table ID (tbl...) |
| `recordId` | string | Airtable record ID (rec...) |
| `type` | string | Record type: 'workplanSource', 'goal', 'objective', or 'activity' |
| `recordName` | string | Human-readable record name |
| `ttaSessions` | array | T/TA sessions linked to this record |
| `children` | array | Child records in the hierarchy |

### ttaSessions Structure

Each T/TA session object contains:

```json
{
  "id": "recXXX",
  "summary": "Summary text of the T/TA session"
}
```

- Already filtered by date range
- Sorted chronologically (earliest first)
- Can be empty array if no T/TA sessions for this record

### children Structure

- Array of objects with the same structure as the parent node
- Empty array `[]` if this is a leaf node or bottom-level record
- Already filtered based on user's "bottom level" selection

## Depth Calculation

If you need to know the depth for some reason:

```javascript
function getNodeDepth(node, targetId, currentDepth = 1) {
  if (node.recordId === targetId) {
    return currentDepth;
  }

  for (const child of node.children) {
    const depth = getNodeDepth(child, targetId, currentDepth + 1);
    if (depth !== null) return depth;
  }

  return null;
}

// Usage:
const depth = getNodeDepth(hierarchyRoot, 'rec123');
```

## When Structure is Null

If the top-level record is not found (e.g., it was deleted), the function returns `null` instead of an empty structure.

You should handle this in your automation:

```javascript
const hierarchy = JSON.parse(record.fields['Hierarchical Records']);

if (!hierarchy) {
  // Handle error - record not found
  throw new Error('Selected record no longer exists');
}

const report = generateReport(hierarchy);
```

## Benefits Summary

✅ **Natural hierarchy** - JSON structure mirrors the data hierarchy
✅ **LLM-optimized** - Clean, recursive structure for AI processing
✅ **Markdown-ready** - Depth directly maps to heading levels
✅ **No redundancy** - No hierarchyLevel field needed
✅ **Recursive processing** - Easy to traverse and transform
✅ **Self-documenting** - Structure explains the relationships
