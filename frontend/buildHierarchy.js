/**
 * Gets the primary field value (name) of a record
 */
const getRecordName = (record, table) => {
    return record.name || record.getCellValueAsString(table.primaryField.id) || 'Unknown';
};

/**
 * Checks if an activity's date range overlaps with the user-selected date range
 */
const isActivityInDateRange = (activity, startDate, endDate, startDateField, endDateField) => {
    if (!startDate && !endDate) {
        // No date filter applied
        return true;
    }

    const activityStart = activity.getCellValue(startDateField?.id);
    const activityEnd = activity.getCellValue(endDateField?.id);

    if (!activityStart || !activityEnd) {
        // Activity doesn't have dates, exclude it
        return false;
    }

    const userStart = startDate ? new Date(startDate) : null;
    const userEnd = endDate ? new Date(endDate) : null;
    const actStart = new Date(activityStart);
    const actEnd = new Date(activityEnd);

    // Check for overlap: activity ends on or after user start AND activity starts on or before user end
    if (userStart && actEnd < userStart) return false; // Activity ends before user range starts
    if (userEnd && actStart > userEnd) return false; // Activity starts after user range ends

    return true;
};

/**
 * Gets T/TA sessions linked to a specific record, filtered by date range
 */
const getTTASessionsForRecord = (recordId, ttaSessions, ttaLinkField, startDate, endDate, ttaDateField) => {
    if (!ttaLinkField) return [];

    const linkedTTA = ttaSessions.filter(session => {
        const linked = session.getCellValue(ttaLinkField?.id);
        if (!linked || !linked.some(l => l.id === recordId)) return false;

        // Filter by date range if dates are provided
        if (!startDate && !endDate) return true;

        const sessionDate = session.getCellValue(ttaDateField?.id);
        if (!sessionDate) return false;

        const date = new Date(sessionDate);
        const userStart = startDate ? new Date(startDate) : null;
        const userEnd = endDate ? new Date(endDate) : null;

        if (userStart && date < userStart) return false;
        if (userEnd && date > userEnd) return false;

        return true;
    });

    return linkedTTA;
};

/**
 * Helper function to create a record object (without T/TA sessions - parent level)
 */
const createRecordObject = (record, table, recordType) => {
    return {
        tableId: table.id,
        recordId: record.id,
        type: recordType,
        recordName: getRecordName(record, table),
        children: []
    };
};

/**
 * Helper function to create a record object with T/TA sessions (leaf level only)
 */
const createRecordObjectWithTTA = (record, table, recordType, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) => {
    const ttaForRecord = getTTASessionsForRecord(record.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
    const ttaData = ttaForRecord
        .sort((a, b) => {
            const dateA = a.getCellValue(ttaDateField?.id);
            const dateB = b.getCellValue(ttaDateField?.id);
            return new Date(dateA) - new Date(dateB);
        })
        .map(session => ({
            id: session.id,
            summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
        }));

    return {
        tableId: table.id,
        recordId: record.id,
        type: recordType,
        recordName: getRecordName(record, table),
        ttaSessions: ttaData,
        children: []
    };
};

/**
 * Recursively collects T/TA sessions from all activities in a subtree
 * Used to get inherited T/TA for non-activity levels
 */
const collectTTAFromActivities = (node) => {
    const ttaMap = new Map(); // Use map to deduplicate by ID

    const traverse = (n) => {
        // If this is an activity with T/TA sessions, collect them
        if (n.type === 'activity' && n.ttaSessions && n.ttaSessions.length > 0) {
            for (const session of n.ttaSessions) {
                if (!ttaMap.has(session.id)) {
                    ttaMap.set(session.id, session);
                }
            }
        }

        // Recursively traverse children
        if (n.children && n.children.length > 0) {
            for (const child of n.children) {
                traverse(child);
            }
        }
    };

    traverse(node);
    return Array.from(ttaMap.values());
};

/**
 * Post-processes the hierarchy to add T/TA sessions to non-activity levels
 * by collecting T/TA from their descendant activities
 */
const addInheritedTTA = (node) => {
    // Only process non-activity nodes
    if (node.type !== 'activity') {
        // If this node has children, recursively process them first
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                addInheritedTTA(child);
            }

            // After processing children, collect T/TA from all descendant activities
            const collectedTTA = collectTTAFromActivities(node);
            if (collectedTTA.length > 0) {
                node.ttaSessions = collectedTTA;
            }
        }
    }
};

/**
 * Builds a hierarchical record structure for report generation (nested)
 * Returns a nested object with structure: { record info, children: [ nested records ] }
 */
export const buildHierarchicalRecordList = (
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
    ttaSummaryForAIFieldId,
    ttaDateField
) => {
    switch (topLevel) {
        case 'workplanSource': {
            const topRecord = workplanSources.find(ws => ws.id === topLevelId);
            if (!topRecord) return null;

            const root = createRecordObject(topRecord, workplanSourcesTable, 'workplanSource');

            if (bottomLevel === 'goal' || bottomLevel === 'objective' || bottomLevel === 'activity') {
                const linkedGoals = goals.filter(goal => {
                    const linked = goal.getCellValue(goalsLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId);
                });

                for (const goal of linkedGoals) {
                    const goalObj = bottomLevel === 'goal' ?
                        createRecordObjectWithTTA(goal, goalsTable, 'goal', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) :
                        createRecordObject(goal, goalsTable, 'goal');

                    if (bottomLevel === 'objective' || bottomLevel === 'activity') {
                        const linkedObjectives = objectives.filter(obj => {
                            const linked = obj.getCellValue(objectivesLinkField?.id);
                            return linked && linked.some(l => l.id === goal.id);
                        });

                        for (const objective of linkedObjectives) {
                            const objObj = bottomLevel === 'objective' ?
                                createRecordObjectWithTTA(objective, objectivesTable, 'objective', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) :
                                createRecordObject(objective, objectivesTable, 'objective');

                            if (bottomLevel === 'activity') {
                                const linkedActivities = activities.filter(activity => {
                                    const linked = activity.getCellValue(activitiesLinkField?.id);
                                    return linked && linked.some(l => l.id === objective.id) &&
                                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                                });

                                for (const activity of linkedActivities) {
                                    const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                                    objObj.children.push(actObj);
                                }
                            }

                            goalObj.children.push(objObj);
                        }
                    }

                    root.children.push(goalObj);
                }

                // Add inherited T/TA from descendant activities
                addInheritedTTA(root);
            }

            return root;
        }

        case 'goal': {
            const topRecord = goals.find(g => g.id === topLevelId);
            if (!topRecord) return null;

            // If goal is the bottom level, create it with T/TA data
            const root = bottomLevel === 'goal' ?
                createRecordObjectWithTTA(topRecord, goalsTable, 'goal', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) :
                createRecordObject(topRecord, goalsTable, 'goal');

            if (bottomLevel === 'objective' || bottomLevel === 'activity') {
                const linkedObjectives = objectives.filter(obj => {
                    const linked = obj.getCellValue(objectivesLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId);
                });

                for (const objective of linkedObjectives) {
                    const objObj = bottomLevel === 'objective' ?
                        createRecordObjectWithTTA(objective, objectivesTable, 'objective', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) :
                        createRecordObject(objective, objectivesTable, 'objective');

                    if (bottomLevel === 'activity') {
                        const linkedActivities = activities.filter(activity => {
                            const linked = activity.getCellValue(activitiesLinkField?.id);
                            return linked && linked.some(l => l.id === objective.id) &&
                                   isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                        });

                        for (const activity of linkedActivities) {
                            const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                            objObj.children.push(actObj);
                        }
                    }

                    root.children.push(objObj);
                }

                // Add inherited T/TA from descendant activities
                addInheritedTTA(root);
            }

            return root;
        }

        case 'objective': {
            const topRecord = objectives.find(o => o.id === topLevelId);
            if (!topRecord) return null;

            // If objective is the bottom level, create it with T/TA data
            const root = bottomLevel === 'objective' ?
                createRecordObjectWithTTA(topRecord, objectivesTable, 'objective', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) :
                createRecordObject(topRecord, objectivesTable, 'objective');

            if (bottomLevel === 'activity') {
                const linkedActivities = activities.filter(activity => {
                    const linked = activity.getCellValue(activitiesLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId) &&
                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                });

                for (const activity of linkedActivities) {
                    const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                    root.children.push(actObj);
                }

                // Add inherited T/TA from descendant activities
                addInheritedTTA(root);
            }

            return root;
        }

        case 'activity': {
            const topRecord = activities.find(a => a.id === topLevelId);
            if (!topRecord) return null;

            // Only include activity if it overlaps with date range
            if (isActivityInDateRange(topRecord, startDate, endDate, activitiesStartDateField, activitiesEndDateField)) {
                return createRecordObjectWithTTA(topRecord, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
            }

            return null;
        }

        default:
            return null;
    }
};
