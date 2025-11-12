import {initializeBlock, useBase, useRecords, useCustomProperties} from '@airtable/blocks/interface/ui';
import {FieldType} from '@airtable/blocks/interface/models';
import {useState, useMemo, useCallback} from 'react';
import './style.css';

// Define custom properties outside component for stable identity
function getCustomProperties(base) {
    return [
        {
            key: 'workplanSourcesTable',
            label: 'Workplan Sources Table',
            type: 'table',
            defaultValue: base.tables.find((table) => 
                table.name.toLowerCase().includes('workplan') && table.name.toLowerCase().includes('source')
            ),
        },
        {
            key: 'goalsTable',
            label: 'Goals Table',
            type: 'table',
            defaultValue: base.tables.find((table) => 
                table.name.toLowerCase().includes('goal')
            ),
        },
        {
            key: 'objectivesTable',
            label: 'Objectives Table',
            type: 'table',
            defaultValue: base.tables.find((table) => 
                table.name.toLowerCase().includes('objective')
            ),
        },
        {
            key: 'activitiesTable',
            label: 'Activities Table',
            type: 'table',
            defaultValue: base.tables.find((table) => 
                table.name.toLowerCase().includes('activit')
            ),
        },
        {
            key: 'ttaSessionsTable',
            label: 'T/TA Sessions Table',
            type: 'table',
            defaultValue: base.tables.find((table) => 
                table.name.toLowerCase().includes('session') || 
                table.name.toLowerCase().includes('t/ta')
            ),
        },
    ];
}

function ReportSelectorApp() {
    const {customPropertyValueByKey, errorState} = useCustomProperties(getCustomProperties);
    
    // State for selections
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkplanSource, setSelectedWorkplanSource] = useState(null);
    const [selectedGoals, setSelectedGoals] = useState([]);
    const [selectedObjectives, setSelectedObjectives] = useState([]);
    const [selectedActivities, setSelectedActivities] = useState([]);
    
    // Get tables from custom properties
    const workplanSourcesTable = customPropertyValueByKey.workplanSourcesTable;
    const goalsTable = customPropertyValueByKey.goalsTable;
    const objectivesTable = customPropertyValueByKey.objectivesTable;
    const activitiesTable = customPropertyValueByKey.activitiesTable;
    const ttaSessionsTable = customPropertyValueByKey.ttaSessionsTable;
    
    // Load records
    const workplanSources = useRecords(workplanSourcesTable || null);
    const goals = useRecords(goalsTable || null);
    const objectives = useRecords(objectivesTable || null);
    const activities = useRecords(activitiesTable || null);
    const ttaSessions = useRecords(ttaSessionsTable || null);
    
    // Find link fields to understand relationships
    const goalsLinkField = useMemo(() => {
        if (!goalsTable) return null;
        return goalsTable.fields.find(field => 
            field.config.type === FieldType.MULTIPLE_RECORD_LINKS &&
            field.config.options?.linkedTableId === workplanSourcesTable?.id
        );
    }, [goalsTable, workplanSourcesTable]);
    
    const objectivesLinkField = useMemo(() => {
        if (!objectivesTable) return null;
        return objectivesTable.fields.find(field => 
            field.config.type === FieldType.MULTIPLE_RECORD_LINKS &&
            field.config.options?.linkedTableId === goalsTable?.id
        );
    }, [objectivesTable, goalsTable]);
    
    const activitiesLinkField = useMemo(() => {
        if (!activitiesTable) return null;
        return activitiesTable.fields.find(field => 
            field.config.type === FieldType.MULTIPLE_RECORD_LINKS &&
            field.config.options?.linkedTableId === objectivesTable?.id
        );
    }, [activitiesTable, objectivesTable]);
    
    const ttaSessionsLinkField = useMemo(() => {
        if (!ttaSessionsTable) return null;
        return ttaSessionsTable.fields.find(field => 
            field.config.type === FieldType.MULTIPLE_RECORD_LINKS &&
            field.config.options?.linkedTableId === activitiesTable?.id
        );
    }, [ttaSessionsTable, activitiesTable]);
    
    const ttaSessionsDateField = useMemo(() => {
        if (!ttaSessionsTable) return null;
        return ttaSessionsTable.fields.find(field => 
            field.config.type === FieldType.DATE || field.config.type === FieldType.DATE_TIME
        );
    }, [ttaSessionsTable]);
    
    // Filter goals by selected workplan source
    const filteredGoals = useMemo(() => {
        if (!selectedWorkplanSource || !goals || !goalsLinkField) return [];
        return goals.filter(goal => {
            const linkedRecords = goal.getCellValue(goalsLinkField);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => link.id === selectedWorkplanSource);
        });
    }, [goals, selectedWorkplanSource, goalsLinkField]);
    
    // Filter objectives by selected goals
    const filteredObjectives = useMemo(() => {
        if (selectedGoals.length === 0 || !objectives || !objectivesLinkField) return [];
        return objectives.filter(objective => {
            const linkedRecords = objective.getCellValue(objectivesLinkField);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => selectedGoals.includes(link.id));
        });
    }, [objectives, selectedGoals, objectivesLinkField]);
    
    // Filter activities by selected objectives
    const filteredActivities = useMemo(() => {
        if (selectedObjectives.length === 0 || !activities || !activitiesLinkField) return [];
        return activities.filter(activity => {
            const linkedRecords = activity.getCellValue(activitiesLinkField);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => selectedObjectives.includes(link.id));
        });
    }, [activities, selectedObjectives, activitiesLinkField]);
    
    // Filter T/TA sessions by selected activities and date range
    const filteredSessions = useMemo(() => {
        if (!ttaSessions || !ttaSessionsLinkField) return [];
        
        return ttaSessions.filter(session => {
            // Filter by activities if any are selected
            if (selectedActivities.length > 0) {
                const linkedActivities = session.getCellValue(ttaSessionsLinkField);
                if (!linkedActivities) return false;
                const hasSelectedActivity = linkedActivities.some(link => 
                    selectedActivities.includes(link.id)
                );
                if (!hasSelectedActivity) return false;
            }
            
            // Filter by date range
            if ((startDate || endDate) && ttaSessionsDateField) {
                const sessionDate = session.getCellValue(ttaSessionsDateField);
                if (!sessionDate) return false;
                
                const date = new Date(sessionDate);
                if (startDate && date < new Date(startDate)) return false;
                if (endDate && date > new Date(endDate)) return false;
            }
            
            return true;
        });
    }, [ttaSessions, selectedActivities, startDate, endDate, ttaSessionsLinkField, ttaSessionsDateField]);
    
    // Handle workplan source selection
    const handleWorkplanSourceChange = (e) => {
        const value = e.target.value;
        setSelectedWorkplanSource(value || null);
        // Reset downstream selections
        setSelectedGoals([]);
        setSelectedObjectives([]);
        setSelectedActivities([]);
    };
    
    // Handle goal selection
    const handleGoalToggle = (goalId) => {
        setSelectedGoals(prev => {
            const newSelection = prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId];
            
            // Reset downstream selections if changed
            if (newSelection.length !== prev.length) {
                setSelectedObjectives([]);
                setSelectedActivities([]);
            }
            return newSelection;
        });
    };
    
    // Handle objective selection
    const handleObjectiveToggle = (objectiveId) => {
        setSelectedObjectives(prev => {
            const newSelection = prev.includes(objectiveId)
                ? prev.filter(id => id !== objectiveId)
                : [...prev, objectiveId];
            
            // Reset downstream selections if changed
            if (newSelection.length !== prev.length) {
                setSelectedActivities([]);
            }
            return newSelection;
        });
    };
    
    // Handle activity selection
    const handleActivityToggle = (activityId) => {
        setSelectedActivities(prev => 
            prev.includes(activityId)
                ? prev.filter(id => id !== activityId)
                : [...prev, activityId]
        );
    };
    
    // Show error state
    if (errorState) {
        return (
            <div className="p-8 bg-red-redLight3 dark:bg-red-redDark1 min-h-screen">
                <div className="max-w-2xl mx-auto bg-white dark:bg-gray-gray800 rounded-lg shadow-lg p-6">
                    <h2 className="text-2xl font-bold text-red-red dark:text-red-redLight1 mb-4">
                        Configuration Error
                    </h2>
                    <p className="text-gray-gray700 dark:text-gray-gray200">
                        {errorState.message}
                    </p>
                </div>
            </div>
        );
    }
    
    // Show configuration instructions if tables not set
    if (!workplanSourcesTable || !goalsTable || !objectivesTable || !activitiesTable || !ttaSessionsTable) {
        return (
            <div className="p-8 bg-gray-gray50 dark:bg-gray-gray800 min-h-screen">
                <div className="max-w-2xl mx-auto bg-white dark:bg-gray-gray700 rounded-lg shadow-lg p-6">
                    <h2 className="text-2xl font-bold text-gray-gray900 dark:text-gray-gray100 mb-4">
                        Configure Report Selector
                    </h2>
                    <p className="text-gray-gray600 dark:text-gray-gray300 mb-4">
                        Please configure the tables in the properties panel to use this report selector.
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-gray-gray700 dark:text-gray-gray200">
                        <li>Workplan Sources Table</li>
                        <li>Goals Table</li>
                        <li>Objectives Table</li>
                        <li>Activities Table</li>
                        <li>T/TA Sessions Table</li>
                    </ul>
                </div>
            </div>
        );
    }
    
    return (
        <div className="p-4 sm:p-6 min-h-screen bg-gray-gray50 dark:bg-gray-gray800">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-display font-bold text-gray-gray900 dark:text-gray-gray100 mb-6">
                    Work Report Selector
                </h1>
                
                {/* Date Range Selection */}
                <div className="bg-white dark:bg-gray-gray700 rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-xl font-semibold text-gray-gray800 dark:text-gray-gray100 mb-4">
                        Time Period
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-gray300 dark:border-gray-gray600 rounded-md 
                                         bg-white dark:bg-gray-gray800 text-gray-gray900 dark:text-gray-gray100
                                         focus:outline-none focus:ring-2 focus:ring-blue-blue"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-gray300 dark:border-gray-gray600 rounded-md 
                                         bg-white dark:bg-gray-gray800 text-gray-gray900 dark:text-gray-gray100
                                         focus:outline-none focus:ring-2 focus:ring-blue-blue"
                            />
                        </div>
                    </div>
                </div>
                
                {/* Hierarchy Selection */}
                <div className="bg-white dark:bg-gray-gray700 rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-xl font-semibold text-gray-gray800 dark:text-gray-gray100 mb-4">
                        Select Scope
                    </h2>
                    
                    {/* Workplan Source */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                            Workplan Source
                        </label>
                        <select
                            value={selectedWorkplanSource || ''}
                            onChange={handleWorkplanSourceChange}
                            className="w-full px-3 py-2 border border-gray-gray300 dark:border-gray-gray600 rounded-md 
                                     bg-white dark:bg-gray-gray800 text-gray-gray900 dark:text-gray-gray100
                                     focus:outline-none focus:ring-2 focus:ring-blue-blue"
                        >
                            <option value="">Select a workplan source...</option>
                            {workplanSources.map(source => (
                                <option key={source.id} value={source.id}>
                                    {source.getCellValueAsString(workplanSourcesTable.primaryField)}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Goals */}
                    {selectedWorkplanSource && filteredGoals.length > 0 && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                                Goals ({selectedGoals.length} selected)
                            </label>
                            <div className="border border-gray-gray300 dark:border-gray-gray600 rounded-md p-3 max-h-48 overflow-y-auto
                                          bg-gray-gray50 dark:bg-gray-gray800">
                                {filteredGoals.map(goal => (
                                    <label key={goal.id} className="flex items-center space-x-2 py-1 cursor-pointer
                                                                      hover:bg-gray-gray100 dark:hover:bg-gray-gray700 rounded px-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedGoals.includes(goal.id)}
                                            onChange={() => handleGoalToggle(goal.id)}
                                            className="w-4 h-4 text-blue-blue border-gray-gray300 dark:border-gray-gray600 rounded
                                                     focus:ring-2 focus:ring-blue-blue"
                                        />
                                        <span className="text-gray-gray900 dark:text-gray-gray100">
                                            {goal.getCellValueAsString(goalsTable.primaryField)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Objectives */}
                    {selectedGoals.length > 0 && filteredObjectives.length > 0 && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                                Objectives ({selectedObjectives.length} selected)
                            </label>
                            <div className="border border-gray-gray300 dark:border-gray-gray600 rounded-md p-3 max-h-48 overflow-y-auto
                                          bg-gray-gray50 dark:bg-gray-gray800">
                                {filteredObjectives.map(objective => (
                                    <label key={objective.id} className="flex items-center space-x-2 py-1 cursor-pointer
                                                                          hover:bg-gray-gray100 dark:hover:bg-gray-gray700 rounded px-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedObjectives.includes(objective.id)}
                                            onChange={() => handleObjectiveToggle(objective.id)}
                                            className="w-4 h-4 text-blue-blue border-gray-gray300 dark:border-gray-gray600 rounded
                                                     focus:ring-2 focus:ring-blue-blue"
                                        />
                                        <span className="text-gray-gray900 dark:text-gray-gray100">
                                            {objective.getCellValueAsString(objectivesTable.primaryField)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* Activities */}
                    {selectedObjectives.length > 0 && filteredActivities.length > 0 && (
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-gray700 dark:text-gray-gray200 mb-2">
                                Activities ({selectedActivities.length} selected)
                            </label>
                            <div className="border border-gray-gray300 dark:border-gray-gray600 rounded-md p-3 max-h-48 overflow-y-auto
                                          bg-gray-gray50 dark:bg-gray-gray800">
                                {filteredActivities.map(activity => (
                                    <label key={activity.id} className="flex items-center space-x-2 py-1 cursor-pointer
                                                                         hover:bg-gray-gray100 dark:hover:bg-gray-gray700 rounded px-2">
                                        <input
                                            type="checkbox"
                                            checked={selectedActivities.includes(activity.id)}
                                            onChange={() => handleActivityToggle(activity.id)}
                                            className="w-4 h-4 text-blue-blue border-gray-gray300 dark:border-gray-gray600 rounded
                                                     focus:ring-2 focus:ring-blue-blue"
                                        />
                                        <span className="text-gray-gray900 dark:text-gray-gray100">
                                            {activity.getCellValueAsString(activitiesTable.primaryField)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                {/* Summary */}
                <div className="bg-blue-blueLight3 dark:bg-blue-blueDark1 rounded-lg shadow-md p-6">
                    <h2 className="text-xl font-semibold text-blue-blueDark1 dark:text-blue-blueLight1 mb-2">
                        Summary
                    </h2>
                    <p className="text-gray-gray800 dark:text-gray-gray100 text-lg">
                        <span className="font-bold text-blue-blue dark:text-blue-blueLight1">
                            {filteredSessions.length}
                        </span>
                        {' '}T/TA Sessions match your selection
                    </p>
                    {startDate && endDate && (
                        <p className="text-gray-gray700 dark:text-gray-gray200 mt-2 text-sm">
                            Date range: {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
                        </p>
                    )}
                    <button
                        disabled={filteredSessions.length === 0}
                        className="mt-4 px-6 py-3 bg-blue-blue hover:bg-blue-blueDark1 disabled:bg-gray-gray300 
                                 disabled:cursor-not-allowed text-white font-semibold rounded-md
                                 transition-colors duration-200 shadow-md"
                    >
                        Generate Report
                    </button>
                </div>
            </div>
        </div>
    );
}

initializeBlock({interface: () => <ReportSelectorApp />});