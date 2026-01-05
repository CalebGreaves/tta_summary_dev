import {
    initializeBlock,
    useBase,
    useRecords,
    Box,
    Heading,
    Text,
    Button,
    Label,
    Input,
    Icon,
} from '@airtable/blocks/ui';
import React, {useState, useMemo, useEffect, useRef} from 'react';
import { buildHierarchicalRecordList, toSuperCompactFormat, findWorkplanSource } from './buildHierarchy';
import { parseMarkdownToSections } from './markdownParser';
import { ReportRenderer } from './ReportRenderer';
import { exportToWord, exportToHtml } from './wordExport';

// Convert camelCase or backend names to readable labels
const getReadableLabel = (value) => {
    const labelMap = {
        'workplanSource': 'workplan source',
        'goal': 'goal',
        'objective': 'objective',
        'activity': 'activity',
    };
    return labelMap[value] || value;
};

// Simple fuzzy match function
const fuzzyMatch = (searchTerm, target) => {
    const lowerSearch = searchTerm.toLowerCase();
    const lowerTarget = target.toLowerCase();

    // Exact match gets highest priority
    if (lowerTarget === lowerSearch) return 1000;

    // Starts with search term
    if (lowerTarget.startsWith(lowerSearch)) return 500;

    // Contains search term as a substring
    if (lowerTarget.includes(lowerSearch)) return 100;

    // Fuzzy match: all characters in search appear in target in order
    let searchIdx = 0;
    for (let i = 0; i < lowerTarget.length && searchIdx < lowerSearch.length; i++) {
        if (lowerTarget[i] === lowerSearch[searchIdx]) {
            searchIdx++;
        }
    }
    if (searchIdx === lowerSearch.length) {
        return 10; // All characters matched in order
    }

    return 0; // No match
};

function ReportSelectorApp() {
    const base = useBase();

    // State for selections
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Top-level selection (what level the report is about)
    const [topLevel, setTopLevel] = useState(''); // 'workplanSource', 'goal', 'objective', 'activity'
    const [topLevelId, setTopLevelId] = useState(''); // single record ID
    const [topLevelSearchTerm, setTopLevelSearchTerm] = useState(''); // for searching
    const [topLevelDropdownOpen, setTopLevelDropdownOpen] = useState(false); // dropdown open state

    // Bottom-level selection (the granularity of detail)
    const [bottomLevel, setBottomLevel] = useState(''); // depends on topLevel

    // Report generation state
    const [reportRequestId, setReportRequestId] = useState(''); // ID of the created report request
    const [isGenerating, setIsGenerating] = useState(false); // loading state
    const [generatedReport, setGeneratedReport] = useState(''); // the generated report content (raw markdown)
    const [parsedSections, setParsedSections] = useState([]); // parsed hierarchical sections
    const [debugJsonOutput, setDebugJsonOutput] = useState(''); // for debugging JSON output

    const [jsonCharacterCount, setJsonCharacterCount] = useState(0);

    // Ref for dropdown to handle click-outside
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setTopLevelDropdownOpen(false);
            }
        };

        if (topLevelDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [topLevelDropdownOpen]);

    // Get tables - adjust these names to match your base
    const workplanSourcesTable = base.getTableById('tbl72KzV8O1LBmUXj');
    const goalsTable = base.getTableById('tbllMymEmuGkCucVM');
    const objectivesTable = base.getTableById('tbl9wK640Z5ZY7e7U');
    const activitiesTable = base.getTableById('tblzBApG5kIfiN9Bs');
    const ttaSessionsTable = base.getTableById('tblPxitTbfIhuCfcw');
    
    // Load records
    const workplanSources = useRecords(workplanSourcesTable);
    const goals = useRecords(goalsTable);
    const objectives = useRecords(objectivesTable);
    const activities = useRecords(activitiesTable);
    const ttaSessions = useRecords(ttaSessionsTable);
    
    // Find link fields (adjust field names as needed)
    const goalsLinkField = goalsTable.getFieldById('fldIdc8oiivatAf3v')
    
    const objectivesLinkField = objectivesTable.getFieldById('fldSS5U6Ou0OZjjCJ')
    
    const objectivesToSourcesLinkField = objectivesTable.getFieldById('fldkQACpESCkddXpS')

    const activitiesLinkField = activitiesTable.getFieldById('fldOg2Op1nWUYUgaW')
    
    const activitiesStartDateField = activitiesTable.getFieldById('fldKQTLdFNry5aZjw')

    const activitiesEndDateField = activitiesTable.getFieldById('fld4OE8aBXIPHWIdK')

    const ttaSessionsLinkField = ttaSessionsTable.getFieldById('fldmE4r4v1OwA1xSY')
    
    const ttaSessionsDateField = ttaSessionsTable.getFieldById('fldXcKUaiiJTmCXRa')
    
    // Get the relevant IDs to filter sessions based on top/bottom level selections
    const relevantActivityIds = useMemo(() => {
        if (!topLevel || !topLevelId) return [];

        // Build the chain of IDs based on the top level and bottom level
        switch (topLevel) {
            case 'workplanSource': {
                // Filter activities based on workplan source and bottom level
                if (bottomLevel === 'goal') {
                    // Activities linked to goals linked to workplan source
                    const goalIds = goals.filter(goal => {
                        const linked = goal.getCellValue(goalsLinkField?.id);
                        return linked && linked.some(l => l.id === topLevelId);
                    }).map(g => g.id);

                    return activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => {
                            const objLinkedToGoal = objectives.find(obj => obj.id === l.id);
                            if (!objLinkedToGoal) return false;
                            const objLinked = objLinkedToGoal.getCellValue(objectivesLinkField?.id);
                            return objLinked && objLinked.some(ol => goalIds.includes(ol.id));
                        });
                    }).map(a => a.id);
                } else if (bottomLevel === 'objective') {
                    // Activities linked to objectives linked to workplan source
                    const objIds = objectives.filter(obj => {
                        const linked = obj.getCellValue(objectivesToSourcesLinkField?.id);
                        return linked && linked.some(l => l.id === topLevelId);
                    }).map(o => o.id);

                    return activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => objIds.includes(l.id));
                    }).map(a => a.id);
                } else if (bottomLevel === 'activity') {
                    // Activities directly (need to trace back to workplan source)
                    return activities.filter(activity => {
                        const linkedObjs = activity.getCellValue(activitiesLinkField?.id);
                        if (!linkedObjs) return false;
                        return linkedObjs.some(lo => {
                            const obj = objectives.find(o => o.id === lo.id);
                            if (!obj) return false;
                            const linked = obj.getCellValue(objectivesToSourcesLinkField?.id);
                            return linked && linked.some(l => l.id === topLevelId);
                        });
                    }).map(a => a.id);
                }
                return [];
            }
            case 'goal': {
                // Activities linked to objectives linked to selected goals
                if (bottomLevel === 'goal') {
                    return [];  // Can't show activities if stopping at goal level
                } else if (bottomLevel === 'objective') {
                    const objIds = objectives.filter(obj => {
                        const linked = obj.getCellValue(objectivesLinkField?.id);
                        return linked && linked.some(l => l.id === topLevelId);
                    }).map(o => o.id);

                    return activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => objIds.includes(l.id));
                    }).map(a => a.id);
                } else if (bottomLevel === 'activity') {
                    return activities.filter(activity => {
                        const linkedObjs = activity.getCellValue(activitiesLinkField?.id);
                        if (!linkedObjs) return false;
                        return linkedObjs.some(lo => {
                            const obj = objectives.find(o => o.id === lo.id);
                            if (!obj) return false;
                            const linked = obj.getCellValue(objectivesLinkField?.id);
                            return linked && linked.some(l => l.id === topLevelId);
                        });
                    }).map(a => a.id);
                }
                return [];
            }
            case 'objective': {
                // Activities linked to selected objectives
                if (bottomLevel === 'objective') {
                    return [];  // Can't show activities if stopping at objective level
                } else if (bottomLevel === 'activity') {
                    return activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => l.id === topLevelId);
                    }).map(a => a.id);
                }
                return [];
            }
            case 'activity': {
                // Direct activity selection
                return [topLevelId];
            }
            default:
                return [];
        }
    }, [topLevel, topLevelId, bottomLevel, goals, objectives, activities, goalsLinkField, objectivesLinkField, objectivesToSourcesLinkField, activitiesLinkField]);
    
    // Filter T/TA sessions
    const filteredSessions = useMemo(() => {
        if (!ttaSessions) return [];

        return ttaSessions.filter(session => {
            // Filter by activities if any are selected
            if (relevantActivityIds.length > 0 && ttaSessionsLinkField) {
                const linkedActivities = session.getCellValue(ttaSessionsLinkField.id);
                if (!linkedActivities) return false;
                const hasSelectedActivity = linkedActivities.some(link =>
                    relevantActivityIds.includes(link.id)
                );
                if (!hasSelectedActivity) return false;
            }

            // Filter by date range
            if ((startDate || endDate) && ttaSessionsDateField) {
                const sessionDate = session.getCellValue(ttaSessionsDateField.id);
                if (!sessionDate) return false;

                const date = new Date(sessionDate);
                if (startDate && date < new Date(startDate)) return false;
                if (endDate && date > new Date(endDate)) return false;
            }

            return true;
        });
    }, [ttaSessions, relevantActivityIds, startDate, endDate, ttaSessionsLinkField, ttaSessionsDateField]);
    
    // Handle top-level selection change
    const handleTopLevelChange = (value) => {
        setTopLevel(value);
        setTopLevelId('');
        setBottomLevel('');
    };

    // Handle bottom-level selection change
    const handleBottomLevelChange = (value) => {
        setBottomLevel(value);
    };

    // Check if selected workplan source has any goals
    const selectedWorkplanSourceHasGoals = useMemo(() => {
        if (topLevel !== 'workplanSource' || !topLevelId) return true; // default to true to show goals

        return goals.some(goal => {
            const linked = goal.getCellValue(goalsLinkField?.id);
            return linked && linked.some(l => l.id === topLevelId);
        });
    }, [topLevel, topLevelId, goals, goalsLinkField]);

    // Get available bottom-level options based on top-level selection
    const getBottomLevelOptions = () => {
        switch (topLevel) {
            case 'workplanSource':
                // If this workplan source has goals, show all options. Otherwise, only objectives and activities
                if (selectedWorkplanSourceHasGoals) {
                    return [
                        { value: 'goal', label: 'Goal' },
                        { value: 'objective', label: 'Objective' },
                        { value: 'activity', label: 'Activity' },
                    ];
                } else {
                    return [
                        { value: 'objective', label: 'Objective' },
                        { value: 'activity', label: 'Activity' },
                    ];
                }
            case 'goal':
                return [
                    { value: 'goal', label: 'Goal only' },
                    { value: 'objective', label: 'Objective' },
                    { value: 'activity', label: 'Activity' },
                ];
            case 'objective':
                return [
                    { value: 'objective', label: 'Objective only' },
                    { value: 'activity', label: 'Activity' },
                ];
            case 'activity':
                return [
                    { value: 'activity', label: 'Activity only' },
                ];
            default:
                return [];
        }
    };

    // Reset bottom level if it's no longer a valid option
    useMemo(() => {
        const validOptions = getBottomLevelOptions().map(opt => opt.value);
        if (bottomLevel && !validOptions.includes(bottomLevel)) {
            setBottomLevel('');
        }
    }, [bottomLevel, topLevel, selectedWorkplanSourceHasGoals]);

    // Get filtered options for top-level selector based on search term
    const filteredTopLevelOptions = useMemo(() => {
        if (!topLevel) return [];

        const records = topLevel === 'workplanSource' ? workplanSources :
                       topLevel === 'goal' ? goals :
                       topLevel === 'objective' ? objectives :
                       activities;

        const primaryFieldId = topLevel === 'workplanSource' ? workplanSourcesTable.primaryField.id :
                              topLevel === 'goal' ? goalsTable.primaryField.id :
                              topLevel === 'objective' ? objectivesTable.primaryField.id :
                              activitiesTable.primaryField.id;

        if (!topLevelSearchTerm) {
            // No search term, return all records
            return records.map(record => ({
                value: record.id,
                label: record.name || record.getCellValueAsString(primaryFieldId),
                score: 0
            }));
        }

        // Filter and score based on search term
        return records
            .map(record => {
                const label = record.name || record.getCellValueAsString(primaryFieldId);
                const score = fuzzyMatch(topLevelSearchTerm, label);
                return { value: record.id, label, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);
    }, [topLevel, topLevelSearchTerm, workplanSources, goals, objectives, activities, workplanSourcesTable, goalsTable, objectivesTable, activitiesTable]);
    
    // Report Requests table ID and field IDs
    const REPORTS_TABLE_ID = 'tbljdC7yREJi2o6Xj';
    const REPORT_FIELDS = {
        JSON_1: 'fldEGR4TwA4gS8qha',
        JSON_2: 'fld82DDMxKyvcHfFC',
        JSON_3: 'fldslV70JJFdWp0vZ',
        JSON_4: 'fldpNrAVFWSSzkSIW',
        START_DATE: 'fldf7QFdRUZvFxrj3',
        END_DATE: 'fldL9Ddrp8RrAdFax',
        STATUS: 'fldXhj8L8HcYZ5V7p',
        GENERATED_REPORT: 'fldUAfi1XDaCxKF17',
        ERROR_MESSAGE: 'fldLEVcRaU9iWW8qQ',
        WORKPLAN_SOURCE: 'fldAM3cDCAwMX2aLN',
        REPORT_TYPE: 'fld7Wx45tPFbvWyaP',
    };

    // Report Type - AI Summary record ID
    const AI_SUMMARY_REPORT_TYPE_ID = 'rec3vtTQmY8mch9c0';

    // Handler to generate report
    const handleGenerateReport = async () => {
        try {
            setIsGenerating(true);

            // Build hierarchical record list
            const hierarchicalRecords = buildHierarchicalRecordList(
                topLevel,
                topLevelId,
                bottomLevel,
                workplanSourcesTable,
                goalsTable,
                objectivesTable,
                activitiesTable,
                workplanSources,
                goals,
                objectives,
                activities,
                goalsLinkField,
                objectivesLinkField,
                objectivesToSourcesLinkField,
                activitiesLinkField,
                startDate,
                endDate,
                activitiesStartDateField,
                activitiesEndDateField,
                ttaSessions,
                ttaSessionsLinkField,
                'fldJYcVHEF4jadCdh', // T/TA Summary for AI field
                ttaSessionsDateField,
                'fldkAnMJgK3XdrGF4', // Activity Comments field (for Board Plan)
                'fld6Cro64lmv8jrd3'  // Activity Status field (for Board Plan)
            );

            // Create JSON string (pretty-printed for readability)
            const jsonOutput = JSON.stringify(hierarchicalRecords, null, 2);
            const characterCount = jsonOutput.length;

            console.log('Hierarchical Records JSON length:', characterCount);
            console.log('OUTPUT:', jsonOutput);
            setDebugJsonOutput(jsonOutput);
            setJsonCharacterCount(characterCount);

            // Get the Report Requests table
            const reportsTable = base.getTableById(REPORTS_TABLE_ID);

            if (!reportsTable) {
                alert('Report Requests table not found. Please check the table ID.');
                setIsGenerating(false);
                return;
            }

            console.log('Splitting JSON across multiple Long Text fields...');

            // Split JSON across multiple fields (100,000 chars each)
            const FIELD_LIMIT = 100000;
            const MAX_FIELDS = 4;
            const MAX_TOTAL = FIELD_LIMIT * MAX_FIELDS; // 400,000 characters

            if (characterCount > MAX_TOTAL) {
                console.error(`JSON too large: ${characterCount} characters (limit: ${MAX_TOTAL})`);
                alert(`The report data is too large (${Math.round(characterCount/1000)}KB, limit is ${MAX_TOTAL/1000}KB).\n\n` +
                      `Please:\n` +
                      `1. Select a smaller date range\n` +
                      `2. Select a lower-level item\n` +
                      `3. Reduce the bottom level detail`);
                setIsGenerating(false);
                return;
            }

            try {
                // Split JSON into chunks
                const chunks = [];
                for (let i = 0; i < jsonOutput.length; i += FIELD_LIMIT) {
                    chunks.push(jsonOutput.substring(i, i + FIELD_LIMIT));
                }

                console.log(`Created ${chunks.length} chunk(s)`);
                chunks.forEach((chunk, i) => {
                    console.log(`  Chunk ${i + 1}: ${chunk.length} characters`);
                });

                // Find the workplan source for this report
                const workplanSourceId = findWorkplanSource(
                    topLevel,
                    topLevelId,
                    workplanSources,
                    goals,
                    objectives,
                    activities,
                    goalsLinkField,
                    objectivesLinkField,
                    objectivesToSourcesLinkField,
                    activitiesLinkField
                );

                console.log('Workplan source ID:', workplanSourceId);

                // Create fields object with JSON chunks
                const fields = {};

                // Add JSON chunks to appropriate fields
                if (chunks.length > 0) fields[REPORT_FIELDS.JSON_1] = chunks[0];
                if (chunks.length > 1) fields[REPORT_FIELDS.JSON_2] = chunks[1];
                if (chunks.length > 2) fields[REPORT_FIELDS.JSON_3] = chunks[2];
                if (chunks.length > 3) fields[REPORT_FIELDS.JSON_4] = chunks[3];

                // Add dates if provided
                if (startDate) {
                    fields[REPORT_FIELDS.START_DATE] = startDate;
                }
                if (endDate) {
                    fields[REPORT_FIELDS.END_DATE] = endDate;
                }

                // Add workplan source link
                if (workplanSourceId) {
                    fields[REPORT_FIELDS.WORKPLAN_SOURCE] = [{ id: workplanSourceId }];
                }

                // Add report type link (AI Summary)
                fields[REPORT_FIELDS.REPORT_TYPE] = [{ id: AI_SUMMARY_REPORT_TYPE_ID }];

                // Status field will be set by default value (don't set it to avoid conflicts)

                console.log('Creating Airtable record with JSON split across fields...');
                console.log('Fields:', fields);
                const newRecord = await reportsTable.createRecordsAsync([
                    { fields: fields }
                ]);

                console.log('✅ Record created successfully:', newRecord);

                if (newRecord && newRecord.length > 0) {
                    setReportRequestId(newRecord[0]);
                    pollForCompletion(newRecord[0]);
                }

            } catch (error) {
                console.error('❌ Error:', error);
                console.error('Error message:', error.message);
                alert('Error creating report: ' + error.message);
                setIsGenerating(false);
            }
        } catch (error) {
            console.error('Error building hierarchy or creating report:', error);
            alert('Error creating report request: ' + error.message);
            setIsGenerating(false);
        }
    };

    // Poll for report completion
    const pollForCompletion = (recordId) => {
        const reportsTable = base.getTableById(REPORTS_TABLE_ID);
        const pollInterval = setInterval(async () => {
            try {
                const record = await reportsTable.selectRecordsAsync();
                const reportRecord = record.records.find(r => r.id === recordId);

                if (reportRecord) {
                    const status = reportRecord.getCellValueAsString(REPORT_FIELDS.STATUS);
                    const report = reportRecord.getCellValueAsString(REPORT_FIELDS.GENERATED_REPORT);

                    if (status === 'Ready' && report) {
                        setGeneratedReport(report);
                        // Parse markdown into hierarchical sections
                        const sections = parseMarkdownToSections(report);
                        setParsedSections(sections);
                        setIsGenerating(false);
                        clearInterval(pollInterval);
                    } else if (status === 'Error') {
                        const error = reportRecord.getCellValueAsString('Error Message');
                        alert('Report generation failed: ' + error);
                        setIsGenerating(false);
                        clearInterval(pollInterval);
                    }
                }
            } catch (error) {
                console.error('Error polling for completion:', error);
                setIsGenerating(false);
                clearInterval(pollInterval);
            }
        }, 2000); // Poll every 2 seconds

        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(pollInterval), 300000);
    };

    // Check if tables exist
    if (!workplanSourcesTable || !goalsTable || !objectivesTable || !activitiesTable || !ttaSessionsTable) {
        return (
            <Box padding={3} backgroundColor="lightGray1">
                <Heading size="large">Configuration Needed</Heading>
                <Text marginTop={2}>
                    Please ensure your base has these tables with these exact names:
                </Text>
                <Box marginTop={2}>
                    <Text>• Workplan Sources</Text>
                    <Text>• Goals</Text>
                    <Text>• Objectives</Text>
                    <Text>• Activities</Text>
                    <Text>• T/TA Sessions</Text>
                </Box>
                <Text marginTop={2} textColor="light">
                    (Or update the table names in the code)
                </Text>
            </Box>
        );
    }
    
    return (
        <Box padding={3} backgroundColor="lightGray1" minHeight="100vh" display="flex" justifyContent="center">
            <Box maxWidth="800px" width="100%">
                <Heading size="xlarge" marginBottom={3}>Work Report Selector</Heading>

                {/* Report Level Selection */}
                <Box
                backgroundColor="white"
                padding={3}
                marginBottom={3}
                borderRadius="large"
                border="none"
                style={{ boxShadow: '0 4px 8px 0 rgba(0, 0, 0, 0.15), 0 1px 3px 0 rgba(0, 0, 0, 0.20)' }}
            >
                <Heading size="small" marginBottom={3}>What should the report cover?</Heading>

                {/* Row 1: Top-level selector */}
                <Box>
                    <Text size="small" marginBottom={2} textColor="light">Generate a report about:</Text>
                    <Box display="flex" flexDirection="column">
                        {[
                            { value: 'workplanSource', label: 'Workplan Source' },
                            { value: 'goal', label: 'Goal' },
                            { value: 'objective', label: 'Objective' },
                            { value: 'activity', label: 'Activity' },
                        ].map(option => (
                            <Box key={option.value} display="flex" alignItems="center" gap={2} marginY={2}>
                                <input
                                    type="radio"
                                    id={`topLevel-${option.value}`}
                                    name="topLevel"
                                    value={option.value}
                                    checked={topLevel === option.value}
                                    onChange={() => handleTopLevelChange(option.value)}
                                    style={{ cursor: 'pointer' }}
                                />
                                <label
                                    htmlFor={`topLevel-${option.value}`}
                                    style={{ cursor: 'pointer', marginBottom: 0, marginLeft: 8 }}
                                >
                                    {option.label}
                                </label>
                            </Box>
                        ))}
                    </Box>
                </Box>

                {/* Row 2: Top-level picker, start date, and end date */}
                {topLevel && (
                    <Box display="flex" flexDirection="row" gap={3} marginBottom={3} alignItems="flex-end">
                        {/* Left: Item picker dropdown */}
                        <Box flex={1} ref={dropdownRef} maxWidth="256px" marginRight="32px" position="relative">
                            {/* Dropdown trigger button */}
                            <Box
                                id="topLevelDropdown"
                                padding={2}
                                backgroundColor="white"
                                border="default"
                                borderRadius="default"
                                onClick={() => setTopLevelDropdownOpen(!topLevelDropdownOpen)}
                                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            >
                                <Text>
                                    {topLevelId
                                        ? filteredTopLevelOptions.find(opt => opt.value === topLevelId)?.label || 'Unknown'
                                        : `Select ${getReadableLabel(topLevel)}...`}
                                </Text>
                                <Icon name="caret" size={16} />
                            </Box>

                            {/* Dropdown menu */}
                            {topLevelDropdownOpen && (
                                <Box
                                    marginTop={1}
                                    backgroundColor="white"
                                    border="default"
                                    borderRadius="default"
                                    maxHeight="300px"
                                    overflow="auto"
                                    position="absolute"
                                    zIndex={10}
                                    style={{ top: '100%', left: 0, right: 0, width: '100%', marginTop: '8px' }}
                                >
                                    {/* Search input */}
                                    <Box padding={2} borderBottom="default">
                                        <Input
                                            id="topLevelSearch"
                                            type="text"
                                            placeholder={`Search ${topLevel}...`}
                                            value={topLevelSearchTerm}
                                            onChange={(e) => setTopLevelSearchTerm(e.target.value)}
                                            width="100%"
                                        />
                                    </Box>

                                    {/* Options list */}
                                    {filteredTopLevelOptions.length > 0 ? (
                                        filteredTopLevelOptions.map((option) => (
                                            <Box
                                                key={option.value}
                                                padding={2}
                                                borderBottom="default"
                                                backgroundColor={topLevelId === option.value ? 'lightBlue1' : 'white'}
                                                onClick={() => {
                                                    setTopLevelId(option.value);
                                                    setTopLevelSearchTerm('');
                                                    setTopLevelDropdownOpen(false);
                                                    setBottomLevel('');
                                                }}
                                                style={{ cursor: 'pointer' }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.backgroundColor = topLevelId === option.value ? 'lightBlue1' : 'lightGray1';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.backgroundColor = topLevelId === option.value ? 'lightBlue1' : 'white';
                                                }}
                                            >
                                                <Text>{option.label}</Text>
                                            </Box>
                                        ))
                                    ) : (
                                        <Box padding={2} textColor="light">
                                            No matches found
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Box>

                        {/* Middle: Start Date */}
                        <Box display="flex" flexDirection="column" gap={1} minWidth="150px" marginRight="16px">
                            <Label htmlFor="startDate">Start Date</Label>
                            <Input
                                id="startDate"
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                width="100%"
                            />
                        </Box>

                        {/* Right: End Date */}
                        <Box display="flex" flexDirection="column" gap={1} minWidth="150px">
                            <Label htmlFor="endDate">End Date</Label>
                            <Input
                                id="endDate"
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                width="100%"
                            />
                        </Box>
                    </Box>
                )}

                {/* Row 3: Bottom-level selector - only shows after top level is selected */}
                {topLevel && topLevelId && (
                    <Box>
                        <Text size="small" marginBottom={2} textColor="light">Show detail down to:</Text>
                        <Box display="flex" flexDirection="column" gap={2}>
                            {getBottomLevelOptions().map(option => (
                                <Box key={option.value} display="flex" alignItems="center" gap={2} marginY={2}>
                                    <input
                                        type="radio"
                                        id={`bottomLevel-${option.value}`}
                                        name="bottomLevel"
                                        value={option.value}
                                        checked={bottomLevel === option.value}
                                        onChange={() => handleBottomLevelChange(option.value)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <label
                                        htmlFor={`bottomLevel-${option.value}`}
                                        style={{ cursor: 'pointer', marginBottom: 0, marginLeft: 8 }}
                                    >
                                        {option.label}
                                    </label>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>

            {/* Summary and Report Section */}
            {!isGenerating && !generatedReport && (
                <Box
                    backgroundColor="blueBright"
                    padding={3}
                    borderRadius="default"
                    border="thick"
                >
                    <Heading size="small" marginBottom={1}>Summary</Heading>
                    <Text size="large">
                        <strong>{filteredSessions.length}</strong> T/TA Sessions match your selection
                    </Text>
                    {startDate && endDate && (
                        <Text marginTop={1} textColor="light">
                            Date range: {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
                        </Text>
                    )}
                    <Button
                        variant="primary"
                        size="large"
                        marginTop={2}
                        disabled={!topLevel || !topLevelId || !bottomLevel}
                        onClick={handleGenerateReport}
                    >
                        Generate Report
                    </Button>
                </Box>
            )}

            {/* Loading State */}
            {isGenerating && (
                <Box
                    backgroundColor="blueBright"
                    padding={3}
                    borderRadius="default"
                    border="thick"
                    display="flex"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    minHeight="200px"
                >
                    <Heading size="small" marginBottom={2}>Generating Report...</Heading>
                    <Text marginBottom={2} textColor="light">
                        This may take a moment while the AI summarizes your data.
                    </Text>
                    <Box
                        style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid rgba(0, 0, 0, 0.1)',
                            borderTop: '4px solid #0084ff',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }}
                    />
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </Box>
            )}

            {/* Debug JSON Output */}
            {debugJsonOutput && !isGenerating && !generatedReport && (
                <Box
                    backgroundColor="lightGray2"
                    padding={3}
                    borderRadius="default"
                    border="default"
                    marginBottom={3}
                    style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px', maxHeight: '400px', overflow: 'auto' }}
                >
                    <Heading size="small" marginBottom={2}>Debug: Hierarchical Records JSON</Heading>
                    <Text size="small">{debugJsonOutput}</Text>
                    <Box marginTop={2}>
                        <Button
                            variant="secondary"
                            size="default"
                            onClick={() => {
                                navigator.clipboard.writeText(debugJsonOutput);
                                alert('JSON copied to clipboard!');
                            }}
                        >
                            Copy JSON
                        </Button>
                        <Button
                            variant="secondary"
                            size="default"
                            marginLeft={2}
                            onClick={() => {
                                setDebugJsonOutput('');
                                setGeneratedReport('');
                                setReportRequestId('');
                            }}
                        >
                            Clear
                        </Button>
                    </Box>
                </Box>
            )}

            {/* Generated Report Display */}
            {generatedReport && !isGenerating && parsedSections && (
                <Box
                    backgroundColor="white"
                    padding={3}
                    borderRadius="large"
                    border="thick"
                    marginBottom={3}
                >
                    <Box display="flex" justifyContent="space-between" alignItems="center" marginBottom={3}>
                        <Heading size="large">Generated Report</Heading>
                        <Box display="flex" gap={2}>
                            <Button
                                variant="primary"
                                size="default"
                                icon="download"
                                onClick={() => {
                                    const timestamp = new Date().toISOString().slice(0, 10);
                                    exportToWord(parsedSections, `TTA_Report_${timestamp}.doc`);
                                }}
                            >
                                Download Word
                            </Button>
                            <Button
                                variant="secondary"
                                size="default"
                                icon="download"
                                onClick={() => {
                                    const timestamp = new Date().toISOString().slice(0, 10);
                                    exportToHtml(parsedSections, `TTA_Report_${timestamp}.html`);
                                }}
                            >
                                Download HTML
                            </Button>
                        </Box>
                    </Box>

                    {/* Interactive Report Renderer */}
                    <Box
                        maxHeight="600px"
                        overflow="auto"
                        padding={2}
                        backgroundColor="lightGray1"
                        borderRadius="default"
                    >
                        <ReportRenderer sections={parsedSections} />
                    </Box>

                    {/* Actions */}
                    <Box display="flex" gap={2} marginTop={3} justifyContent="space-between">
                        <Button
                            variant="secondary"
                            size="default"
                            onClick={() => {
                                navigator.clipboard.writeText(generatedReport);
                                alert('Markdown copied to clipboard!');
                            }}
                        >
                            Copy Markdown
                        </Button>
                        <Button
                            variant="secondary"
                            size="default"
                            onClick={() => {
                                setGeneratedReport('');
                                setParsedSections([]);
                                setReportRequestId('');
                                setDebugJsonOutput('');
                            }}
                        >
                            Generate Another Report
                        </Button>
                    </Box>
                </Box>
            )}
            </Box>
        </Box>
    );
}

initializeBlock(() => <ReportSelectorApp />);