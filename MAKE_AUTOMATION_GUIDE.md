# Make Automation Guide for Word Document Attachment

## Overview
Since Airtable Blocks cannot directly upload attachments to attachment fields, you'll need to use a Make (formerly Integromat) automation to generate and attach the Word document to the report record.

## Automation Trigger
**Watch for new records** in the `Report Requests` table where:
- Status = "Ready" (after AI generates the report)
- Generated Report field is not empty
- Word Document Attachment field is empty (to avoid re-processing)

## Steps in Make Automation

### 1. Get the Report Record
- **Module**: Airtable > Get a Record
- **Record ID**: From trigger
- **Fields to retrieve**:
  - `Generated Report` (field ID: `fldUAfi1XDaCxKF17`)
  - `Start Date` (field ID: `fldf7QFdRUZvFxrj3`)
  - `End Date` (field ID: `fldL9Ddrp8RrAdFax`)

### 2. Convert Markdown to Word
You have two options:

#### Option A: Use Markdown to Word Converter
- **Module**: HTTP > Make a Request (to a markdown-to-docx API)
- **Example APIs**:
  - Cloudmersive Document Conversion API
  - DocRaptor
  - Custom Node.js service using `docx` library

#### Option B: Use Pandoc via CloudConvert
- **Module**: CloudConvert > Convert a File
- **Input**: Markdown text
- **Output Format**: DOCX (Word)
- **CloudConvert API**: Free tier available

#### Option C: Simple HTML to Word
Make can convert HTML to Word directly:
1. Convert markdown to HTML (simple text replacement or use a service)
2. Save as `.doc` file with HTML content (Word can open HTML files)

### 3. Upload to Airtable Attachment Field
- **Module**: Airtable > Update a Record
- **Record ID**: Same record from trigger
- **Fields**:
  - Attachment field ID: `[INSERT_ATTACHMENT_FIELD_ID]`
  - File source: From previous step
  - Filename: `TTA_Report_{{Start Date}}_to_{{End Date}}.docx`

## Alternative: Direct Word Generation in Make

Instead of converting markdown, you can generate the Word document directly in Make:

### Using Make's Built-in Tools
1. **Parse the markdown** to extract sections
2. **Use CloudConvert or DocRaptor** to convert to Word
3. **Upload** to Airtable attachment field

## Code Example for Custom Node.js Service

If you want to host your own converter, here's a simple Node.js service:

```javascript
const express = require('express');
const { Document, Paragraph, TextRun, HeadingLevel, Packer } = require('docx');
const marked = require('marked');

app.post('/markdown-to-docx', async (req, res) => {
  const { markdown } = req.body;

  // Parse markdown and create Word document
  const doc = new Document({
    sections: [{
      properties: {},
      children: parseMarkdownToDocxElements(markdown)
    }]
  });

  const buffer = await Packer.toBuffer(doc);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename=report.docx');
  res.send(buffer);
});
```

## Recommended Make Flow

```
[Airtable Trigger: New Record with Status=Ready]
    ↓
[CloudConvert: Markdown → DOCX]
    ↓
[Airtable: Upload to Attachment Field]
    ↓
[Optional: Update Status Field]
```

## Important Notes

1. **Attachment Field ID**: You'll need to find the attachment field ID in your Report Requests table
2. **File Size**: Word documents are typically much smaller than JSON (usually < 1MB)
3. **Filename Format**: Use a consistent naming convention like `TTA_Report_YYYY-MM-DD.docx`
4. **Error Handling**: Add error handling in Make if markdown conversion fails

## Testing

Test the automation with a small report first to ensure:
- ✅ Markdown converts correctly to Word
- ✅ Formatting is preserved (headings, bold, italic, lists)
- ✅ File uploads to correct attachment field
- ✅ Automation doesn't re-trigger on the same record
