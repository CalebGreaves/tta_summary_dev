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
        return true;
    }

    const activityStart = activity.getCellValue(startDateField?.id);
    const activityEnd = activity.getCellValue(endDateField?.id);

    if (!activityStart || !activityEnd) {
        return false;
    }

    const userStart = startDate ? new Date(startDate) : null;
    const userEnd = endDate ? new Date(endDate) : null;
    const actStart = new Date(activityStart);
    const actEnd = new Date(activityEnd);

    if (userStart && actEnd < userStart) return false;
    if (userEnd && actStart > userEnd) return false;

    return true;
};

/**
 * Helper function to create a record object (without T/TA sessions)
 */
const createRecordObject = (record, table, recordType) => {
    return {
        tableId: table.id,
        recordId: record.id,
        type: recordType,
        recordName: getRecordName(record, table),
        ttaSessions: [],
        children: []
    };
};

/**
 * Helper function to create a record object with T/TA sessions
 */
const createRecordObjectWithTTA = (record, table, recordType, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId) => {
    const ttaForRecord = ttaSessions.filter(session => {
        const linked = session.getCellValue(ttaSessionsLinkField?.id);
        if (!linked || !linked.some(l => l.id === record.id)) return false;

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
 */
const collectTTAFromActivities = (node) => {
    const ttaMap = new Map();

    const traverse = (n) => {
        if (n.type === 'activity' && n.ttaSessions && n.ttaSessions.length > 0) {
            for (const session of n.ttaSessions) {
                if (!ttaMap.has(session.id)) {
                    ttaMap.set(session.id, session);
                }
            }
        }

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
 * Post-processes the hierarchy to add T/TA sessions to bottom-level nodes only
 */
const addInheritedTTA = (node, bottomLevel) => {
    if (node.type !== 'activity') {
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                addInheritedTTA(child, bottomLevel);
            }

            // Only add T/TA to nodes that match the bottom level
            if (node.type === bottomLevel) {
                const collectedTTA = collectTTAFromActivities(node);
                if (collectedTTA.length > 0) {
                    node.ttaSessions = collectedTTA;
                }
            }
        }
    }
};

/**
 * Removes activity nodes from the tree (used when activities are not the bottom level)
 */
const removeActivityNodes = (node) => {
    if (node.children && node.children.length > 0) {
        // First, recursively process children
        for (const child of node.children) {
            removeActivityNodes(child);
        }
        
        // Then remove activity children
        node.children = node.children.filter(child => child.type !== 'activity');
    }
};

/**
 * Builds a hierarchical record structure for report generation
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
    let root = null;

    switch (topLevel) {
        case 'workplanSource': {
            const topRecord = workplanSources.find(ws => ws.id === topLevelId);
            if (!topRecord) return null;

            root = createRecordObject(topRecord, workplanSourcesTable, 'workplanSource');

            // Get linked goals
            const linkedGoals = goals.filter(goal => {
                const linked = goal.getCellValue(goalsLinkField?.id);
                return linked && linked.some(l => l.id === topLevelId);
            });

            if (linkedGoals.length > 0) {
                // Normal path: workplan source → goals → objectives → activities
                for (const goal of linkedGoals) {
                    const goalObj = createRecordObject(goal, goalsTable, 'goal');

                    // Get linked objectives
                    const linkedObjectives = objectives.filter(obj => {
                        const linked = obj.getCellValue(objectivesLinkField?.id);
                        return linked && linked.some(l => l.id === goal.id);
                    });

                    for (const objective of linkedObjectives) {
                        const objObj = createRecordObject(objective, objectivesTable, 'objective');

                        // Always get linked activities for T/TA collection
                        const linkedActivities = activities.filter(activity => {
                            const linked = activity.getCellValue(activitiesLinkField?.id);
                            return linked && linked.some(l => l.id === objective.id) &&
                                   isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                        });

                        for (const activity of linkedActivities) {
                            const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                            objObj.children.push(actObj);
                        }

                        goalObj.children.push(objObj);
                    }

                    root.children.push(goalObj);
                }
            } else {
                // No goals: workplan source → objectives → activities (skip goal level)
                const linkedObjectives = objectives.filter(obj => {
                    const linked = obj.getCellValue(objectivesToSourcesLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId);
                });

                for (const objective of linkedObjectives) {
                    const objObj = createRecordObject(objective, objectivesTable, 'objective');

                    // Always get linked activities for T/TA collection
                    const linkedActivities = activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => l.id === objective.id) &&
                               isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                    });

                    for (const activity of linkedActivities) {
                        const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                        objObj.children.push(actObj);
                    }

                    root.children.push(objObj);
                }
            }

            break;
        }

        case 'goal': {
            const topRecord = goals.find(g => g.id === topLevelId);
            if (!topRecord) return null;

            root = createRecordObject(topRecord, goalsTable, 'goal');

            // Get linked objectives
            const linkedObjectives = objectives.filter(obj => {
                const linked = obj.getCellValue(objectivesLinkField?.id);
                return linked && linked.some(l => l.id === topLevelId);
            });

            for (const objective of linkedObjectives) {
                const objObj = createRecordObject(objective, objectivesTable, 'objective');

                // Always get linked activities for T/TA collection
                const linkedActivities = activities.filter(activity => {
                    const linked = activity.getCellValue(activitiesLinkField?.id);
                    return linked && linked.some(l => l.id === objective.id) &&
                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                });

                for (const activity of linkedActivities) {
                    const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                    objObj.children.push(actObj);
                }

                root.children.push(objObj);
            }

            break;
        }

        case 'objective': {
            const topRecord = objectives.find(o => o.id === topLevelId);
            if (!topRecord) return null;

            root = createRecordObject(topRecord, objectivesTable, 'objective');

            // Always get linked activities for T/TA collection
            const linkedActivities = activities.filter(activity => {
                const linked = activity.getCellValue(activitiesLinkField?.id);
                return linked && linked.some(l => l.id === topLevelId) &&
                       isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
            });

            for (const activity of linkedActivities) {
                const actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                root.children.push(actObj);
            }

            break;
        }

        case 'activity': {
            const topRecord = activities.find(a => a.id === topLevelId);
            if (!topRecord) return null;

            if (isActivityInDateRange(topRecord, startDate, endDate, activitiesStartDateField, activitiesEndDateField)) {
                return createRecordObjectWithTTA(topRecord, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
            }

            return null;
        }

        default:
            return null;
    }

    // Only add inherited T/TA when bottom level is not activity
    if (bottomLevel !== 'activity') {
        addInheritedTTA(root, bottomLevel);
        removeActivityNodes(root);
    }

    return root;
};

/**
 * Converts the full hierarchical structure to super compact format
 * Removes tableId, recordId, and T/TA session IDs (not needed for report generation)
 */
export const toSuperCompactFormat = (node) => {
    if (!node) return null;

    return {
        t: node.type,
        n: node.recordName,
        tta: node.ttaSessions.map(s => s.summary), // Just summaries, no IDs
        c: node.children.map(child => toSuperCompactFormat(child))
    };
};

/**
 * Restore full format from super compact
 * Note: tableId and recordId will be null since they're not stored
 */
export const fromSuperCompactFormat = (compact) => {
    if (!compact) return null;

    return {
        tableId: null, // Not stored in compact format
        recordId: null, // Not stored in compact format
        type: compact.t,
        recordName: compact.n,
        ttaSessions: compact.tta.map(summary => ({
            id: null, // Not stored in compact format
            summary: summary
        })),
        children: compact.c.map(child => fromSuperCompactFormat(child))
    };
};