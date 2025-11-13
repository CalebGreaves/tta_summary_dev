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
 * Builds a hierarchical record list for report generation
 * Returns an array of {tableId, recordId, recordName, hierarchyLevel, ttaSessions} objects
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
    const records = [];

    switch (topLevel) {
        case 'workplanSource': {
            const topRecord = workplanSources.find(ws => ws.id === topLevelId);
            if (!topRecord) return records;

            const ttaForRecord = getTTASessionsForRecord(topLevelId, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
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

            records.push({
                tableId: workplanSourcesTable.id,
                recordId: topLevelId,
                recordName: getRecordName(topRecord, workplanSourcesTable),
                hierarchyLevel: 1,
                ttaSessions: ttaData
            });

            if (bottomLevel === 'goal' || bottomLevel === 'objective' || bottomLevel === 'activity') {
                // Get goals linked to this workplan source
                const linkedGoals = goals.filter(goal => {
                    const linked = goal.getCellValue(goalsLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId);
                });

                for (const goal of linkedGoals) {
                    const ttaForGoal = getTTASessionsForRecord(goal.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                    const goalTTAData = ttaForGoal
                        .sort((a, b) => {
                            const dateA = a.getCellValue(ttaDateField?.id);
                            const dateB = b.getCellValue(ttaDateField?.id);
                            return new Date(dateA) - new Date(dateB);
                        })
                        .map(session => ({
                            id: session.id,
                            summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                        }));

                    records.push({
                        tableId: goalsTable.id,
                        recordId: goal.id,
                        recordName: getRecordName(goal, goalsTable),
                        hierarchyLevel: 2,
                        ttaSessions: goalTTAData
                    });

                    if (bottomLevel === 'objective' || bottomLevel === 'activity') {
                        // Get objectives linked to this goal
                        const linkedObjectives = objectives.filter(obj => {
                            const linked = obj.getCellValue(objectivesLinkField?.id);
                            return linked && linked.some(l => l.id === goal.id);
                        });

                        for (const objective of linkedObjectives) {
                            const ttaForObjective = getTTASessionsForRecord(objective.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                            const objTTAData = ttaForObjective
                                .sort((a, b) => {
                                    const dateA = a.getCellValue(ttaDateField?.id);
                                    const dateB = b.getCellValue(ttaDateField?.id);
                                    return new Date(dateA) - new Date(dateB);
                                })
                                .map(session => ({
                                    id: session.id,
                                    summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                                }));

                            records.push({
                                tableId: objectivesTable.id,
                                recordId: objective.id,
                                recordName: getRecordName(objective, objectivesTable),
                                hierarchyLevel: 3,
                                ttaSessions: objTTAData
                            });

                            if (bottomLevel === 'activity') {
                                // Get activities linked to this objective, filtered by date range
                                const linkedActivities = activities.filter(activity => {
                                    const linked = activity.getCellValue(activitiesLinkField?.id);
                                    return linked && linked.some(l => l.id === objective.id) &&
                                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                                });

                                for (const activity of linkedActivities) {
                                    const ttaForActivity = getTTASessionsForRecord(activity.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                                    const actTTAData = ttaForActivity
                                        .sort((a, b) => {
                                            const dateA = a.getCellValue(ttaDateField?.id);
                                            const dateB = b.getCellValue(ttaDateField?.id);
                                            return new Date(dateA) - new Date(dateB);
                                        })
                                        .map(session => ({
                                            id: session.id,
                                            summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                                        }));

                                    records.push({
                                        tableId: activitiesTable.id,
                                        recordId: activity.id,
                                        recordName: getRecordName(activity, activitiesTable),
                                        hierarchyLevel: 4,
                                        ttaSessions: actTTAData
                                    });
                                }
                            }
                        }
                    }
                }
            }
            break;
        }

        case 'goal': {
            const topRecord = goals.find(g => g.id === topLevelId);
            if (!topRecord) return records;

            const ttaForRecord = getTTASessionsForRecord(topLevelId, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
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

            records.push({
                tableId: goalsTable.id,
                recordId: topLevelId,
                recordName: getRecordName(topRecord, goalsTable),
                hierarchyLevel: 1,
                ttaSessions: ttaData
            });

            if (bottomLevel === 'objective' || bottomLevel === 'activity') {
                // Get objectives linked to this goal
                const linkedObjectives = objectives.filter(obj => {
                    const linked = obj.getCellValue(objectivesLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId);
                });

                for (const objective of linkedObjectives) {
                    const ttaForObjective = getTTASessionsForRecord(objective.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                    const objTTAData = ttaForObjective.map(session => ({
                        id: session.id,
                        summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                    }));

                    records.push({
                        tableId: objectivesTable.id,
                        recordId: objective.id,
                        recordName: getRecordName(objective, objectivesTable),
                        hierarchyLevel: 2,
                        ttaSessions: objTTAData
                    });

                    if (bottomLevel === 'activity') {
                        // Get activities linked to this objective, filtered by date range
                        const linkedActivities = activities.filter(activity => {
                            const linked = activity.getCellValue(activitiesLinkField?.id);
                            return linked && linked.some(l => l.id === objective.id) &&
                                   isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                        });

                        for (const activity of linkedActivities) {
                            const ttaForActivity = getTTASessionsForRecord(activity.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                            const actTTAData = ttaForActivity.map(session => ({
                                id: session.id,
                                summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                            }));

                            records.push({
                                tableId: activitiesTable.id,
                                recordId: activity.id,
                                recordName: getRecordName(activity, activitiesTable),
                                hierarchyLevel: 3,
                                ttaSessions: actTTAData
                            });
                        }
                    }
                }
            }
            break;
        }

        case 'objective': {
            const topRecord = objectives.find(o => o.id === topLevelId);
            if (!topRecord) return records;

            const ttaForRecord = getTTASessionsForRecord(topLevelId, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
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

            records.push({
                tableId: objectivesTable.id,
                recordId: topLevelId,
                recordName: getRecordName(topRecord, objectivesTable),
                hierarchyLevel: 1,
                ttaSessions: ttaData
            });

            if (bottomLevel === 'activity') {
                // Get activities linked to this objective, filtered by date range
                const linkedActivities = activities.filter(activity => {
                    const linked = activity.getCellValue(activitiesLinkField?.id);
                    return linked && linked.some(l => l.id === topLevelId) &&
                           isActivityInDateRange(activity, startDate, endDate, activitiesStartDateField, activitiesEndDateField);
                });

                for (const activity of linkedActivities) {
                    const ttaForActivity = getTTASessionsForRecord(activity.id, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                    const actTTAData = ttaForActivity.map(session => ({
                        id: session.id,
                        summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                    }));

                    records.push({
                        tableId: activitiesTable.id,
                        recordId: activity.id,
                        recordName: getRecordName(activity, activitiesTable),
                        hierarchyLevel: 2,
                        ttaSessions: actTTAData
                    });
                }
            }
            break;
        }

        case 'activity': {
            const topRecord = activities.find(a => a.id === topLevelId);
            if (!topRecord) return records;

            // Only include activity if it overlaps with date range
            if (isActivityInDateRange(topRecord, startDate, endDate, activitiesStartDateField, activitiesEndDateField)) {
                const ttaForActivity = getTTASessionsForRecord(topLevelId, ttaSessions, ttaSessionsLinkField, startDate, endDate, ttaDateField);
                const actTTAData = ttaForActivity.map(session => ({
                    id: session.id,
                    summary: session.getCellValueAsString(ttaSummaryForAIFieldId) || ''
                }));

                records.push({
                    tableId: activitiesTable.id,
                    recordId: topLevelId,
                    recordName: getRecordName(topRecord, activitiesTable),
                    hierarchyLevel: 1,
                    ttaSessions: actTTAData
                });
            }
            break;
        }

        default:
            break;
    }

    return records;
};
