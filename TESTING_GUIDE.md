# JSON Output Testing Guide

## Overview
This document explains the JSON structure that gets generated when you trigger a report from the Block, and how to test it.

## JSON Structure

The `buildHierarchicalRecordList()` function generates a nested JSON object with the following structure:

```json
{
  "tableId": "tbl72KzV8O1LBmUXj",
  "recordId": "rec123xyz",
  "recordName": "Workplan Source Name",
  "ttaSessions": [
    {
      "id": "recTTA001",
      "summary": "T/TA session summary text"
    },
    {
      "id": "recTTA002",
      "summary": "Another T/TA session summary"
    }
  ],
  "children": [
    {
      "tableId": "tbllMymEmuGkCucVM",
      "recordId": "rec456abc",
      "recordName": "Goal Name",
      "ttaSessions": [
        {
          "id": "recTTA003",
          "summary": "Goal-related T/TA session"
        }
      ],
      "children": [
        {
          "tableId": "tbl9wK640Z5ZY7e7U",
          "recordId": "recObj001",
          "recordName": "Objective Name",
          "ttaSessions": [],
          "children": []
        }
      ]
    }
  ]
}
```

## Key Fields

- **tableId**: The Airtable table ID for this record type
- **recordId**: The unique record ID in Airtable
- **recordName**: The human-readable name of the record (primary field)
- **ttaSessions**: Array of T/TA sessions linked to this record, filtered by:
  - Date range overlap (session date within report date range)
  - Record linkage (session is linked to this record)
  - Sorted chronologically by date (earliest first)
- **children**: Array of nested records at the next level of the hierarchy
  - Empty array if this is the bottom level or no child records exist
  - Each child has the same structure (tableId, recordId, recordName, ttaSessions, children)

## Table ID Reference

- Workplan Sources: `tbl72KzV8O1LBmUXj`
- Goals: `tbllMymEmuGkCucVM`
- Objectives: `tbl9wK640Z5ZY7e7U`
- Activities: `tblzBApG5kIfiN9Bs`
- T/TA Sessions: `tblPxitTbfIhuCfcw`

## T/TA Summary Field

The T/TA session summary comes from field `fldJYcVHEF4jadCdh` (T/TA Summary for AI).

## Testing the JSON Output

### Step 1: Use the Block Interface
1. Open the Work Report Selector Block in your Airtable base
2. Select:
   - **What should the report cover?** Choose a level (e.g., "Goal")
   - **Generate a report about:** Select a specific record (e.g., "Goal 1")
   - **Start Date:** Pick a start date
   - **End Date:** Pick an end date
   - **Show detail down to:** Choose granularity (e.g., "Activity")
3. Click **Generate Report**

### Step 2: View the Debug JSON Output
After clicking "Generate Report":
- The Block will:
  - Build the hierarchical record list
  - Log it to the browser console
  - Display it in a "Debug: Hierarchical Records JSON" section
- You can:
  - **Copy JSON:** Click the "Copy JSON" button to copy the entire JSON to your clipboard
  - **Paste in Editor:** Paste it into VS Code, a JSON validator, or your automation test
  - **Clear:** Click "Clear" to dismiss the debug display

### Step 3: Verify the JSON Structure
Check that your JSON output:
- ✓ Is valid JSON (no syntax errors)
- ✓ Is a single nested object, not an array
- ✓ Has root object with tableId, recordId, recordName, ttaSessions, and children
- ✓ Has correct tableId for the root record type
- ✓ Includes valid recordId from your base
- ✓ Correctly nested children based on the selections (no children at bottom level)
- ✓ T/TA sessions are sorted by date (chronologically)
- ✓ T/TA sessions only include those within the date range
- ✓ Activities are only included if they overlap the date range

## Example JSON (Full Report)

If you select:
- **Top level:** Workplan Source → "Tech Improvement Initiative"
- **Bottom level:** Activity
- **Date range:** Jan 1, 2024 - Dec 31, 2024

You might get:
```json
{
  "tableId": "tbl72KzV8O1LBmUXj",
  "recordId": "recWPS001",
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
          "recordName": "Optimize Database Queries",
          "ttaSessions": [],
          "children": [
            {
              "tableId": "tblzBApG5kIfiN9Bs",
              "recordId": "recAct001",
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

## Using JSON in the Automation

When the "Generate Report" button is clicked:
1. The JSON is created and displayed in the debug section
2. The JSON is also sent to the Report Requests table as the "Hierarchical Records" field
3. The Airtable automation will:
   - Read this JSON from the "Hierarchical Records" field
   - Parse the nested structure recursively
   - For each record in the hierarchy, use the included T/TA sessions data to generate summaries
   - Format output with markdown based on nesting depth:
     - Root level: `#`
     - First children level: `##`
     - Second children level: `###`
     - Third children level: `####`
   - Update the "Generated Report" field with the final formatted report

## Date Filtering Details

### Activities
- Included only if their start date and end date overlap with the report's date range
- Example: If report is Jan 1 - Mar 31, and activity is Feb 15 - Apr 30, it's included
- If activity has no start/end dates, it's excluded

### T/TA Sessions
- Filtered at the individual record level
- A T/TA session is included if:
  - It's linked to the record (via the link field)
  - Its date falls within the report's start and end dates
- Sorted chronologically (earliest date first)

## Debugging Tips

If the JSON looks wrong:
1. Check the browser console for any errors
2. Verify the table IDs match your base
3. Verify field IDs are correct (especially link fields)
4. Check that records are properly linked in your base
5. Verify dates are in the correct format (YYYY-MM-DD)
6. Ensure T/TA sessions have dates in the T/TA Date field (`fldXcKUaiiJTmCXRa`)

## Next Steps

Once you've verified the JSON output:
1. Create the Airtable automation in the Report Requests table
2. The automation should trigger when Status = 'New'
3. Parse the JSON from "Hierarchical Records"
4. Generate summaries and format as markdown
5. Update "Generated Report" field and set Status = 'Ready'
