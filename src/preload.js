const { contextBridge, ipcRenderer } = require('electron');

// Expose secure API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // License validation
    validateLicense: (licenseKey) => ipcRenderer.invoke('validate-license', licenseKey),
    
    // Browser control
    launchBrowser: () => ipcRenderer.invoke('launch-browser'),
    
    // Script management
    startScripts: (config) => ipcRenderer.invoke('start-scripts', config),
    stopScripts: () => ipcRenderer.invoke('stop-scripts'),
    
    // Utility
    showMessage: (title, message) => ipcRenderer.invoke('show-message', { title, message })
});