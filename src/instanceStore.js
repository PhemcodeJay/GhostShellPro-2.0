// instanceStore.js - Centralized state management for all instances

const instanceStates = {};

function getInstanceState(instanceId) {
    if (!instanceId) {
        console.error('getInstanceState called without instanceId');
        return null;
    }
    
    if (!instanceStates[instanceId]) {
        console.log(`🔧 Creating new state for instance ${instanceId}`);
        instanceStates[instanceId] = {
            browserInstance: null,
            currentPage: null,
            isScriptsRunning: false,
            browserCloseCallback: null,
            scriptCleanupFunctions: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        };
    }
    
    // Update last activity
    instanceStates[instanceId].lastActivity = new Date().toISOString();
    
    return instanceStates[instanceId];
}

function removeInstanceState(instanceId) {
    if (!instanceId) {
        console.error('removeInstanceState called without instanceId');
        return false;
    }
    
    if (instanceStates[instanceId]) {
        console.log(`🗑️ Removing state for instance ${instanceId}`);
        delete instanceStates[instanceId];
        return true;
    }
    
    return false;
}

function getAllInstanceStates() {
    return Object.keys(instanceStates).map(instanceId => ({
        instanceId,
        ...instanceStates[instanceId],
        hasBrowser: !!instanceStates[instanceId].browserInstance,
        hasPage: !!instanceStates[instanceId].currentPage
    }));
}

function cleanupStaleStates(maxAgeHours = 24) {
    const now = new Date();
    const staleInstances = [];
    
    Object.keys(instanceStates).forEach(instanceId => {
        const state = instanceStates[instanceId];
        const lastActivity = new Date(state.lastActivity);
        const ageHours = (now - lastActivity) / (1000 * 60 * 60);
        
        if (ageHours > maxAgeHours && !state.browserInstance) {
            staleInstances.push(instanceId);
        }
    });
    
    staleInstances.forEach(instanceId => {
        console.log(`🧹 Cleaning up stale state for instance ${instanceId}`);
        removeInstanceState(instanceId);
    });
    
    return staleInstances.length;
}

module.exports = {
    getInstanceState,
    removeInstanceState,
    getAllInstanceStates,
    cleanupStaleStates,
    instanceStates
};