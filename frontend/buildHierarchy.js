/**
 * Gets the primary field value (name) of a record
 */
const getRecordName = (record, table) => {
    return record.name || record.getCellValueAsString(table.primaryField.id) || 'Unknown';
};

/**
 * Checks if a record is part of the Board Plan hierarchy
 * Returns the board plan workplan source ID if found, null otherwise
 */
const findBoardPlanSource = (
    recordType,
    recordId,
    workplanSources,
    goals,
    objectives,
    goalsLinkField,
    objectivesLinkField,
    objectivesToSourcesLinkField
) => {
    // Helper to check if a workplan source is Board Plan
    const isBoardPlan = (workplanSource) => {
        const name = workplanSource.name || '';
        return name.toLowerCase().includes('board plan');
    };

    switch (recordType) {
        case 'workplanSource': {
            const ws = workplanSources.find(w => w.id === recordId);
            return ws && isBoardPlan(ws) ? recordId : null;
        }

        case 'goal': {
            const goal = goals.find(g => g.id === recordId);
            if (!goal) return null;
            
            const linked = goal.getCellValue(goalsLinkField?.id);
            if (!linked) return null;

            for (const link of linked) {
                const ws = workplanSources.find(w => w.id === link.id);
                if (ws && isBoardPlan(ws)) return link.id;
            }
            return null;
        }

        case 'objective': {
            const objective = objectives.find(o => o.id === recordId);
            if (!objective) return null;

            // Check direct link to workplan sources
            const directLinked = objective.getCellValue(objectivesToSourcesLinkField?.id);
            if (directLinked) {
                for (const link of directLinked) {
                    const ws = workplanSources.find(w => w.id === link.id);
                    if (ws && isBoardPlan(ws)) return link.id;
                }
            }

            // Check through goals
            const goalLinked = objective.getCellValue(objectivesLinkField?.id);
            if (goalLinked) {
                for (const goalLink of goalLinked) {
                    const goal = goals.find(g => g.id === goalLink.id);
                    if (!goal) continue;

                    const wsLinked = goal.getCellValue(goalsLinkField?.id);
                    if (wsLinked) {
                        for (const wsLink of wsLinked) {
                            const ws = workplanSources.find(w => w.id === wsLink.id);
                            if (ws && isBoardPlan(ws)) return wsLink.id;
                        }
                    }
                }
            }
            return null;
        }

        case 'activity': {
            // Activities don't need to check - they're always leaves
            return null;
        }

        default:
            return null;
    }
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
 * Helper function to create a record object (without T/TA sessions or activity details)
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
 * Helper function to create a record object with T/TA sessions (for non-Board Plan)
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
 * Helper function to create an activity object with comments and status (for Board Plan)
 */
const createActivityObjectWithDetails = (activity, activitiesTable, startDate, endDate, startDateField, endDateField, commentsFieldId, statusFieldId) => {
    const comments = activity.getCellValueAsString(commentsFieldId) || '';
    const status = activity.getCellValueAsString(statusFieldId) || '';

    return {
        tableId: activitiesTable.id,
        recordId: activity.id,
        type: 'activity',
        recordName: getRecordName(activity, activitiesTable),
        activityComments: comments,
        activityStatus: status,
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
 * Recursively collects activities from a Board Plan subtree
 */
const collectActivitiesFromSubtree = (node) => {
    const activities = [];

    const traverse = (n) => {
        if (n.type === 'activity' && (n.activityComments || n.activityStatus)) {
            activities.push({
                name: n.recordName,
                comments: n.activityComments || '',
                status: n.activityStatus || 'Not Started'
            });
        }

        if (n.children && n.children.length > 0) {
            for (const child of n.children) {
                traverse(child);
            }
        }
    };

    traverse(node);
    return activities;
};

/**
 * Recursively collects activity details from all activities in a subtree (for Board Plan)
 */
const collectActivityDetails = (node) => {
    const activities = [];

    const traverse = (n) => {
        if (n.type === 'activity' && (n.activityComments || n.activityStatus)) {
            activities.push({
                recordName: n.recordName,
                comments: n.activityComments || '',
                status: n.activityStatus || ''
            });
        }

        if (n.children && n.children.length > 0) {
            for (const child of n.children) {
                traverse(child);
            }
        }
    };

    traverse(node);
    return activities;
};

/**
 * Post-processes the hierarchy to add T/TA sessions to bottom-level nodes only (for non-Board Plan)
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
 * Post-processes the hierarchy to add activity details to bottom-level nodes (for Board Plan)
 */
const addInheritedActivityDetails = (node, bottomLevel) => {
    if (node.type !== 'activity') {
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                addInheritedActivityDetails(child, bottomLevel);
            }

            // Only add activity details to nodes that match the bottom level
            if (node.type === bottomLevel) {
                const collectedActivities = collectActivityDetails(node);
                if (collectedActivities.length > 0) {
                    node.activityDetails = collectedActivities;
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
 * Removes all children from nodes at the bottom level
 * This is used when we've rolled up data to the bottom level and don't need the subtree
 */
const removeChildrenAtBottomLevel = (node, bottomLevel) => {
    if (node.children && node.children.length > 0) {
        // Recursively process children first
        for (const child of node.children) {
            removeChildrenAtBottomLevel(child, bottomLevel);
        }
        
        // If this node is at the bottom level, remove all its children
        if (node.type === bottomLevel) {
            node.children = [];
        }
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
    ttaDateField,
    activitiesCommentsFieldId = 'fldkAnMJgK3XdrGF4',
    activitiesStatusFieldId = 'fld6Cro64lmv8jrd3'
) => {
    // Determine if this is a Board Plan report
    const boardPlanSourceId = findBoardPlanSource(
        topLevel,
        topLevelId,
        workplanSources,
        goals,
        objectives,
        goalsLinkField,
        objectivesLinkField,
        objectivesToSourcesLinkField
    );

    const isBoardPlan = boardPlanSourceId !== null;

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

                        // Always get linked activities
                        const linkedActivities = activities.filter(activity => {
                            const linked = activity.getCellValue(activitiesLinkField?.id);
                            return linked && linked.some(l => l.id === objective.id) &&
                                   isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                        });

                        for (const activity of linkedActivities) {
                            let actObj;
                            if (isBoardPlan) {
                                actObj = createActivityObjectWithDetails(activity, activitiesTable, startDate, endDate, activitiesStartDateField, activitiesEndDateField, activitiesCommentsFieldId, activitiesStatusFieldId);
                            } else {
                                actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                            }
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

                    // Always get linked activities
                    const linkedActivities = activities.filter(activity => {
                        const linked = activity.getCellValue(activitiesLinkField?.id);
                        return linked && linked.some(l => l.id === objective.id) &&
                               isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                    });

                    for (const activity of linkedActivities) {
                        let actObj;
                        if (isBoardPlan) {
                            actObj = createActivityObjectWithDetails(activity, activitiesTable, startDate, endDate, activitiesStartDateField, activitiesEndDateField, activitiesCommentsFieldId, activitiesStatusFieldId);
                        } else {
                            actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                        }
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

                // Always get linked activities
                const linkedActivities = activities.filter(activity => {
                    const linked = activity.getCellValue(activitiesLinkField?.id);
                    return linked && linked.some(l => l.id === objective.id) &&
                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                });

                for (const activity of linkedActivities) {
                    let actObj;
                    if (isBoardPlan) {
                        actObj = createActivityObjectWithDetails(activity, activitiesTable, startDate, endDate, activitiesStartDateField, activitiesEndDateField, activitiesCommentsFieldId, activitiesStatusFieldId);
                    } else {
                        actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                    }
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

            // Always get linked activities
            const linkedActivities = activities.filter(activity => {
                const linked = activity.getCellValue(activitiesLinkField?.id);
                return linked && linked.some(l => l.id === topLevelId) &&
                       isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
            });

            for (const activity of linkedActivities) {
                let actObj;
                if (isBoardPlan) {
                    actObj = createActivityObjectWithDetails(activity, activitiesTable, startDate, endDate, activitiesStartDateField, activitiesEndDateField, activitiesCommentsFieldId, activitiesStatusFieldId);
                } else {
                    actObj = createRecordObjectWithTTA(activity, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                }
                root.children.push(actObj);
            }

            break;
        }

        case 'activity': {
            const topRecord = activities.find(a => a.id === topLevelId);
            if (!topRecord) return null;

            if (isActivityInDateRange(topRecord, startDate, endDate, activitiesStartDateField, activitiesEndDateField)) {
                if (isBoardPlan) {
                    return createActivityObjectWithDetails(topRecord, activitiesTable, startDate, endDate, activitiesStartDateField, activitiesEndDateField, activitiesCommentsFieldId, activitiesStatusFieldId);
                } else {
                    return createRecordObjectWithTTA(topRecord, activitiesTable, 'activity', ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField, ttaSummaryForAIFieldId);
                }
            }

            return null;
        }

        default:
            return null;
    }

    // Post-processing based on whether it's a Board Plan and the bottom level
    if (bottomLevel !== 'activity') {
        if (isBoardPlan) {
            addInheritedActivityDetails(root, bottomLevel);
        } else {
            addInheritedTTA(root, bottomLevel);
        }
        // Remove all children at the bottom level (for both Board Plans and regular T/TA)
        removeChildrenAtBottomLevel(root, bottomLevel);
    }

    return root;
};

/**
 * Converts the full hierarchical structure to super compact format
 * Removes tableId, recordId, and T/TA session IDs (not needed for report generation)
 */
export const toSuperCompactFormat = (node) => {
    if (!node) return null;

    const compact = {
        t: node.type,
        n: node.recordName,
    };

    // Add T/TA sessions if present
    if (node.ttaSessions && node.ttaSessions.length > 0) {
        compact.tta = node.ttaSessions.map(s => s.summary);
    }

    // Add activity details if present (Board Plan)
    if (node.activityDetails && node.activityDetails.length > 0) {
        compact.ad = node.activityDetails.map(a => ({
            n: a.recordName,
            c: a.comments,
            s: a.status
        }));
    }

    // Add individual activity fields if present (Board Plan leaf nodes)
    if (node.activityComments || node.activityStatus) {
        compact.ac = node.activityComments || '';
        compact.as = node.activityStatus || '';
    }

    compact.c = node.children.map(child => toSuperCompactFormat(child));

    return compact;
};

/**
 * Restore full format from super compact
 * Note: tableId and recordId will be null since they're not stored
 */
export const fromSuperCompactFormat = (compact) => {
    if (!compact) return null;

    const node = {
        tableId: null,
        recordId: null,
        type: compact.t,
        recordName: compact.n,
        children: compact.c.map(child => fromSuperCompactFormat(child))
    };

    // Restore T/TA sessions if present
    if (compact.tta) {
        node.ttaSessions = compact.tta.map(summary => ({
            id: null,
            summary: summary
        }));
    } else {
        node.ttaSessions = [];
    }

    // Restore activity details if present (Board Plan)
    if (compact.ad) {
        node.activityDetails = compact.ad.map(a => ({
            recordName: a.n,
            comments: a.c,
            status: a.s
        }));
    }

    // Restore individual activity fields if present (Board Plan leaf nodes)
    if (compact.ac !== undefined) {
        node.activityComments = compact.ac;
    }
    if (compact.as !== undefined) {
        node.activityStatus = compact.as;
    }

    return node;
};