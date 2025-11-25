const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('managerAPI', {
    getInstances: () => ipcRenderer.invoke('get-instances'),
    createInstance: (licenseKey, instanceName) => ipcRenderer.invoke('create-instance', licenseKey, instanceName),
    launchInstanceIPC: (instanceId) => ipcRenderer.invoke('launch-instance', instanceId),
    deleteInstance: (instanceId) => ipcRenderer.invoke('delete-instance', instanceId),
    updateInstanceName: (instanceId, newName) => ipcRenderer.invoke('update-instance-name', instanceId, newName),
    launchBrowser: (instanceId) => ipcRenderer.invoke('launch-browser', instanceId),
    startScripts: (config, instanceId) => ipcRenderer.invoke('start-scripts', config, instanceId),
    stopScripts: (instanceId) => ipcRenderer.invoke('stop-scripts', instanceId),
    getBrowserState: (instanceId) => ipcRenderer.invoke('get-browser-state', instanceId),
    updateInstanceStatus: (instanceId, status) => ipcRenderer.invoke('update-instance-status', instanceId, status),
    updateScriptState: (instanceId, isRunning) => ipcRenderer.invoke('update-script-state', instanceId, isRunning),
    autoStopScripts: (instanceId) => ipcRenderer.invoke('auto-stop-scripts', instanceId),
    triggerAutoStart: (instanceId) => ipcRenderer.invoke('trigger-auto-start', instanceId),
    notifyAutoStopCompleted: (instanceId) => ipcRenderer.invoke('notify-auto-stop-completed', instanceId),
    saveAllConfig: (instanceId, config) => ipcRenderer.invoke('save-all-config', instanceId, config),
    notifyAutoStartCompleted: (instanceId) => ipcRenderer.invoke('notify-auto-start-completed', instanceId),
    
    // Add listener for backend events
    onStatusChanged: (callback) => {
        ipcRenderer.on('instance-status-changed', callback);
        return () => ipcRenderer.removeListener('instance-status-changed', callback);
    },
    
    // Add listener for auto-action events
    onAutoActionCompleted: (callback) => {
        ipcRenderer.on('auto-action-completed', callback);
        return () => ipcRenderer.removeListener('auto-action-completed', callback);
    }
});