# Final Hierarchical JSON Structure

## Complete Example

This is the complete structure that will be generated and sent to the Airtable automation:

```json
{
  "tableId": "tbl72KzV8O1LBmUXj",
  "recordId": "recWPS001",
  "type": "workplanSource",
  "recordName": "Tech Improvement Initiative",
  "ttaSessions": [
    {
      "id": "recTTA001",
      "summary": "Kickoff meeting to discuss tech roadmap"
    }
  ],
  "children": [
    {
      "tableId": "tbllMymEmuGkCucVM",
      "recordId": "recGoal001",
      "type": "goal",
      "recordName": "Improve System Performance",
      "ttaSessions": [
        {
          "id": "recTTA002",
          "summary": "Q1 performance optimization discussion"
        },
        {
          "id": "recTTA003",
          "summary": "Implementation review"
        }
      ],
      "children": [
        {
          "tableId": "tbl9wK640Z5ZY7e7U",
          "recordId": "recObj001",
          "type": "objective",
          "recordName": "Optimize Database Queries",
          "ttaSessions": [],
          "children": [
            {
              "tableId": "tblzBApG5kIfiN9Bs",
              "recordId": "recAct001",
              "type": "activity",
              "recordName": "Review and Profile Slow Queries",
              "ttaSessions": [
                {
                  "id": "recTTA004",
                  "summary": "Query profiling workshop"
                }
              ],
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

## Field Descriptions

### Top-Level Fields

| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| `tableId` | string | `"tbl72KzV8O1LBmUXj"` | Airtable table ID for this record |
| `recordId` | string | `"recWPS001"` | Airtable record ID (unique identifier) |
| `type` | string | `"workplanSource"` | Record type: workplanSource, goal, objective, or activity |
| `recordName` | string | `"Tech Improvement Initiative"` | Human-readable record name |
| `ttaSessions` | array | `[{...}, {...}]` | T/TA sessions linked to this record |
| `children` | array | `[{...}, {...}]` | Child records in the hierarchy |

### T/TA Session Fields

Each object in `ttaSessions` array:

| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| `id` | string | `"recTTA001"` | Airtable record ID for the T/TA session |
| `summary` | string | `"Kickoff meeting..."` | T/TA Summary for AI field content |

### Nested Structure Rules

- **Each child has identical structure** - All children use the same fields as their parents
- **Type hierarchy** - Types at each level:
  - Workplan Source → Goals
  - Goal → Objectives
  - Objective → Activities
  - Activity → No children
- **Empty arrays** - Leaf nodes have `"children": []` and may have `"ttaSessions": []`
- **Depth-based formatting** - Use nesting level to determine markdown heading:
  - Root node → `#`
  - First level children → `##`
  - Second level children → `###`
  - Third level children → `####`

## Data Filtering Applied

### T/TA Sessions
- **Filtered by linkage**: Only sessions linked to the record via the link field
- **Filtered by date range**: Session date must fall within the report's startDate/endDate
- **Sorted chronologically**: Earliest date first
- **No duplicates**: Each session appears only once in the hierarchy

### Activities
- **Filtered by linkage**: Only activities linked to the parent objective
- **Filtered by date range**: Activity start/end dates must overlap with report dates
- **Excluded if no dates**: Activities without start/end dates are excluded
- **Bottom level check**: Only included if `bottomLevel === 'activity'`

## Formatting Examples

Using the `type` field, your automation can generate formatted output:

### Basic Format
```
# Workplansource: Tech Improvement Initiative

T/TA Sessions:
- Kickoff meeting to discuss tech roadmap

## Goal: Improve System Performance

T/TA Sessions:
- Q1 performance optimization discussion
- Implementation review

### Objective: Optimize Database Queries

#### Activity: Review and Profile Slow Queries

T/TA Sessions:
- Query profiling workshop
```

### With Headers Only
```
# Workplansource: Tech Improvement Initiative
## Goal: Improve System Performance
### Objective: Optimize Database Queries
#### Activity: Review and Profile Slow Queries
```

### Type-Based Processing
You can also use the `type` field to apply different formatting:

```javascript
const typeFormatting = {
  'workplanSource': { prefix: '📋', mdLevel: 1 },
  'goal': { prefix: '🎯', mdLevel: 2 },
  'objective': { prefix: '✓', mdLevel: 3 },
  'activity': { prefix: '→', mdLevel: 4 }
};

function formatRecord(record, depth = 0) {
  const config = typeFormatting[record.type];
  const heading = '#'.repeat(config.mdLevel) + ` ${config.prefix} ${record.recordName}`;
  // ... rest of formatting
}
```

## Size Considerations

### Typical Structure Sizes
- **Workplan Source to Activities**: ~15-50 KB of JSON
- **Single Goal to Activities**: ~5-20 KB of JSON
- **Single Objective with Activities**: ~2-10 KB of JSON

### Record Depth
- **Maximum nesting depth**: 4 levels (Workplan Source → Goal → Objective → Activity)
- **All paths don't have to be deep** - Can stop at any level based on `bottomLevel` selection

## Null/Empty Handling

### When Structure is Null
If the top-level record doesn't exist, the entire structure is `null`:
```javascript
const hierarchy = JSON.parse(record.fields['Hierarchical Records']);
if (!hierarchy) {
  // Handle error - record not found or deleted
}
```

### Empty Children Arrays
If there are no children at a level:
```json
{
  "type": "objective",
  "recordName": "No Activities",
  "children": []
}
```

### Empty T/TA Sessions
If no T/TA sessions match the filters:
```json
{
  "type": "goal",
  "recordName": "No Sessions",
  "ttaSessions": []
}
```

## Integration Points

This JSON structure is:
1. **Generated** by the Block's `buildHierarchicalRecordList()` function
2. **Displayed** in the Block UI debug section for verification
3. **Stored** in the Report Requests table's "Hierarchical Records" field
4. **Processed** by the Airtable automation script
5. **Transformed** into the final markdown report

## Processing Flow

```
User selects report options
         ↓
Block generates JSON structure
         ↓
JSON displayed in debug section (for verification)
         ↓
JSON stored in Report Requests table
         ↓
Automation reads JSON from "Hierarchical Records"
         ↓
Automation recursively processes each node
         ↓
Automation generates AI summaries and markdown formatting
         ↓
Final report stored in "Generated Report" field
         ↓
Status updated to "Ready"
```

## Next Steps for Automation

Create an Airtable automation that:
1. Triggers on record creation (Status = 'New')
2. Parses the JSON: `JSON.parse(record.fields['Hierarchical Records'])`
3. Recursively processes the tree structure
4. For each record:
   - Generates AI summary using `ttaSessions` data
   - Formats with markdown based on nesting depth
5. Updates the "Generated Report" field
6. Sets Status to "Ready" or "Error"

See [NESTED_JSON_GUIDE.md](NESTED_JSON_GUIDE.md) for example automation code!
