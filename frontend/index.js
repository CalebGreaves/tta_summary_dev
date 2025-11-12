import {
    initializeBlock,
    useBase,
    useRecords,
    Box,
    Heading,
    Text,
    Button,
    Select,
    Label,
    Input,
} from '@airtable/blocks/ui';
import React, {useState, useMemo} from 'react';

function ReportSelectorApp() {
    const base = useBase();
    
    // State for selections
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkplanSourceId, setSelectedWorkplanSourceId] = useState('');
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [selectedObjectiveIds, setSelectedObjectiveIds] = useState([]);
    const [selectedActivityIds, setSelectedActivityIds] = useState([]);
    
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
    const goalsLinkField = goalsTable?.getFieldByNameIfExists('Workplan Source') || 
                           goalsTable?.fields.find(f => f.type === 'multipleRecordLinks');
    
    const objectivesLinkField = objectivesTable?.getFieldByNameIfExists('Goal') ||
                                objectivesTable?.fields.find(f => f.type === 'multipleRecordLinks');
    
    const activitiesLinkField = activitiesTable?.getFieldByNameIfExists('Objective') ||
                                activitiesTable?.fields.find(f => f.type === 'multipleRecordLinks');
    
    const ttaSessionsLinkField = ttaSessionsTable?.getFieldByNameIfExists('Activities') ||
                                 ttaSessionsTable?.fields.find(f => f.type === 'multipleRecordLinks');
    
    const ttaSessionsDateField = ttaSessionsTable?.fields.find(f => f.type === 'date' || f.type === 'dateTime');
    
    // Filter goals by selected workplan source
    const filteredGoals = useMemo(() => {
        if (!selectedWorkplanSourceId || !goals || !goalsLinkField) return [];
        return goals.filter(goal => {
            const linkedRecords = goal.getCellValue(goalsLinkField.id);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => link.id === selectedWorkplanSourceId);
        });
    }, [goals, selectedWorkplanSourceId, goalsLinkField]);
    
    // Filter objectives by selected goals
    const filteredObjectives = useMemo(() => {
        if (selectedGoalIds.length === 0 || !objectives || !objectivesLinkField) return [];
        return objectives.filter(objective => {
            const linkedRecords = objective.getCellValue(objectivesLinkField.id);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => selectedGoalIds.includes(link.id));
        });
    }, [objectives, selectedGoalIds, objectivesLinkField]);
    
    // Filter activities by selected objectives
    const filteredActivities = useMemo(() => {
        if (selectedObjectiveIds.length === 0 || !activities || !activitiesLinkField) return [];
        return activities.filter(activity => {
            const linkedRecords = activity.getCellValue(activitiesLinkField.id);
            if (!linkedRecords) return false;
            return linkedRecords.some(link => selectedObjectiveIds.includes(link.id));
        });
    }, [activities, selectedObjectiveIds, activitiesLinkField]);
    
    // Filter T/TA sessions
    const filteredSessions = useMemo(() => {
        if (!ttaSessions) return [];
        
        return ttaSessions.filter(session => {
            // Filter by activities if any are selected
            if (selectedActivityIds.length > 0 && ttaSessionsLinkField) {
                const linkedActivities = session.getCellValue(ttaSessionsLinkField.id);
                if (!linkedActivities) return false;
                const hasSelectedActivity = linkedActivities.some(link => 
                    selectedActivityIds.includes(link.id)
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
    }, [ttaSessions, selectedActivityIds, startDate, endDate, ttaSessionsLinkField, ttaSessionsDateField]);
    
    // Handle selections
    const handleWorkplanSourceChange = (value) => {
        setSelectedWorkplanSourceId(value);
        setSelectedGoalIds([]);
        setSelectedObjectiveIds([]);
        setSelectedActivityIds([]);
    };
    
    const handleGoalToggle = (goalId) => {
        setSelectedGoalIds(prev => {
            const isSelected = prev.includes(goalId);
            if (isSelected) {
                return prev.filter(id => id !== goalId);
            } else {
                return [...prev, goalId];
            }
        });
        setSelectedObjectiveIds([]);
        setSelectedActivityIds([]);
    };
    
    const handleObjectiveToggle = (objectiveId) => {
        setSelectedObjectiveIds(prev => {
            const isSelected = prev.includes(objectiveId);
            if (isSelected) {
                return prev.filter(id => id !== objectiveId);
            } else {
                return [...prev, objectiveId];
            }
        });
        setSelectedActivityIds([]);
    };
    
    const handleActivityToggle = (activityId) => {
        setSelectedActivityIds(prev => {
            const isSelected = prev.includes(activityId);
            if (isSelected) {
                return prev.filter(id => id !== activityId);
            } else {
                return [...prev, activityId];
            }
        });
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
        <Box padding={3} backgroundColor="lightGray1" minHeight="100vh">
            <Heading size="xlarge" marginBottom={3}>Work Report Selector</Heading>
            
            {/* Date Range */}
            <Box 
                backgroundColor="white" 
                padding={3} 
                marginBottom={3}
                borderRadius="default"
                border="thick"
            >
                <Heading size="small" marginBottom={2}>Time Period</Heading>
                <Box display="flex" flexDirection="row" gap={2}>
                    <Box flex={1}>
                        <Label htmlFor="startDate">Start Date</Label>
                        <Input
                            id="startDate"
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            width="100%"
                        />
                    </Box>
                    <Box flex={1}>
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
            </Box>
            
            {/* Hierarchy Selection */}
            <Box 
                backgroundColor="white" 
                padding={3} 
                marginBottom={3}
                borderRadius="default"
                border="thick"
            >
                <Heading size="small" marginBottom={2}>Select Scope</Heading>
                
                {/* Workplan Source */}
                <Box marginBottom={3}>
                    <Label htmlFor="workplanSource">Workplan Source</Label>
                    <Select
                        id="workplanSource"
                        options={[
                            {value: '', label: 'Select a workplan source...'},
                            ...workplanSources.map(s => ({
                                value: s.id,
                                label: s.name || s.getCellValueAsString(workplanSourcesTable.primaryField.id)
                            }))
                        ]}
                        value={selectedWorkplanSourceId}
                        onChange={handleWorkplanSourceChange}
                        width="100%"
                    />
                </Box>
                
                {/* Goals */}
                {selectedWorkplanSourceId && filteredGoals.length > 0 && (
                    <Box marginBottom={3}>
                        <Label>Goals ({selectedGoalIds.length} selected)</Label>
                        <Box 
                            border="default"
                            borderRadius="default"
                            padding={2}
                            maxHeight="200px"
                            overflow="auto"
                            backgroundColor="lightGray1"
                        >
                            {filteredGoals.map(goal => (
                                <Box 
                                    key={goal.id}
                                    display="flex"
                                    alignItems="center"
                                    paddingY={1}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedGoalIds.includes(goal.id)}
                                        onChange={() => handleGoalToggle(goal.id)}
                                        style={{marginRight: '8px'}}
                                    />
                                    <Text>
                                        {goal.name || goal.getCellValueAsString(goalsTable.primaryField.id)}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
                
                {/* Objectives */}
                {selectedGoalIds.length > 0 && filteredObjectives.length > 0 && (
                    <Box marginBottom={3}>
                        <Label>Objectives ({selectedObjectiveIds.length} selected)</Label>
                        <Box 
                            border="default"
                            borderRadius="default"
                            padding={2}
                            maxHeight="200px"
                            overflow="auto"
                            backgroundColor="lightGray1"
                        >
                            {filteredObjectives.map(objective => (
                                <Box 
                                    key={objective.id}
                                    display="flex"
                                    alignItems="center"
                                    paddingY={1}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedObjectiveIds.includes(objective.id)}
                                        onChange={() => handleObjectiveToggle(objective.id)}
                                        style={{marginRight: '8px'}}
                                    />
                                    <Text>
                                        {objective.name || objective.getCellValueAsString(objectivesTable.primaryField.id)}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
                
                {/* Activities */}
                {selectedObjectiveIds.length > 0 && filteredActivities.length > 0 && (
                    <Box marginBottom={3}>
                        <Label>Activities ({selectedActivityIds.length} selected)</Label>
                        <Box 
                            border="default"
                            borderRadius="default"
                            padding={2}
                            maxHeight="200px"
                            overflow="auto"
                            backgroundColor="lightGray1"
                        >
                            {filteredActivities.map(activity => (
                                <Box 
                                    key={activity.id}
                                    display="flex"
                                    alignItems="center"
                                    paddingY={1}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedActivityIds.includes(activity.id)}
                                        onChange={() => handleActivityToggle(activity.id)}
                                        style={{marginRight: '8px'}}
                                    />
                                    <Text>
                                        {activity.name || activity.getCellValueAsString(activitiesTable.primaryField.id)}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>
            
            {/* Summary */}
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
                    disabled={filteredSessions.length === 0}
                >
                    Generate Report
                </Button>
            </Box>
        </Box>
    );
}

initializeBlock(() => <ReportSelectorApp />);