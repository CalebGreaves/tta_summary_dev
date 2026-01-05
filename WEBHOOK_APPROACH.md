# Alternative Approach: Webhook for Word Generation

## Option: Trigger Make from the Block

Instead of Make watching for new records, you could trigger Make directly from the Airtable Block when the report is ready.

## How It Works

1. **User generates report** in Airtable Block
2. **AI processes** and creates markdown summary
3. **Block receives markdown** and displays it
4. **Block calls Make webhook** with the markdown content
5. **Make generates Word document** and uploads it to Airtable

## Implementation in the Block

Add this to the `pollForCompletion` function in [frontend/index.js](frontend/index.js):

```javascript
// After receiving the report
if (status === 'Ready' && report) {
    setGeneratedReport(report);
    const sections = parseMarkdownToSections(report);
    setParsedSections(sections);
    setIsGenerating(false);
    clearInterval(pollInterval);

    // Trigger Make webhook to generate Word document
    try {
        await fetch('YOUR_MAKE_WEBHOOK_URL', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                recordId: recordId,
                markdown: report,
                startDate: startDate,
                endDate: endDate,
            }),
        });
        console.log('Word document generation triggered');
    } catch (error) {
        console.error('Failed to trigger Word generation:', error);
    }
}
```

## Make Webhook Configuration

### 1. Webhook Trigger
- **Module**: Webhooks > Custom webhook
- **Method**: POST
- **Expected data**:
  ```json
  {
    "recordId": "recXXXXXXXXXXXXXX",
    "markdown": "# Report Title\n\n## Section 1...",
    "startDate": "2025-01-01",
    "endDate": "2025-01-31"
  }
  ```

### 2. Convert Markdown to Word
- **Module**: CloudConvert > Convert a File
- **Input**: `{{markdown}}` from webhook
- **Input Format**: markdown
- **Output Format**: docx

### 3. Upload to Airtable
- **Module**: Airtable > Update a Record
- **Record ID**: `{{recordId}}` from webhook
- **Fields**:
  - Attachment field: File from CloudConvert
  - Filename: `TTA_Report_{{startDate}}_to_{{endDate}}.docx`

### 4. Response (Optional)
- **Module**: Webhooks > Webhook Response
- **Status**: 200
- **Body**: `{"success": true}`

## Benefits of Webhook Approach

✅ **Immediate**: Word doc is generated as soon as report is ready
✅ **User-triggered**: Only generates when user actually requests a report
✅ **Simple**: No complex polling or watching in Make
✅ **Feedback**: Can show success/failure to user in the Block

## Potential Issues

⚠️ **CORS**: Make webhooks might have CORS restrictions
⚠️ **Async**: User won't see Word doc immediately (Make takes a few seconds)
⚠️ **Error handling**: Need to handle Make failures gracefully

## Recommendation

I recommend the **polling approach** (from MAKE_AUTOMATION_GUIDE.md) because:
- No code changes needed in the Block
- More reliable (no webhook timeouts)
- Works even if user closes the Block
- Easier to debug and monitor

The webhook approach is good if you need:
- Real-time Word generation
- User confirmation that Word is being generated
- Integration with other Make workflows
