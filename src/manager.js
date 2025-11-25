const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const { getInstanceState } = require('./instanceStore');

const crypto = require('crypto');
const ENCRYPTION_KEY = 'PcXsWOVLlg3DkjwqcwB6IutsA1ZXfnm3'; 





// Global variables
let managerWindow;
const instancesFilePath = path.join(app.getPath('userData'), 'instances.json');

// Instance data structure
let instances = [];

// Create manager window
function createManagerWindow() {
    managerWindow = new BrowserWindow({
        width: 700,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'manager-preload.js')
        },
        title: 'GhostShell - Instance Manager',
        resizable: false,
        icon: path.join(__dirname, '../assets/icon.png')
    });

    managerWindow.loadFile(path.join(__dirname, 'manager.html'));
    
    managerWindow.on('closed', () => {
        managerWindow = null;
    });
}

// Load instances from file
async function loadInstances() {
    try {
        const raw = await fs.readFile(instancesFilePath, 'utf8');
        const { iv, data } = JSON.parse(raw);

        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(ENCRYPTION_KEY),
            Buffer.from(iv, 'hex')
        );

        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        instances = JSON.parse(decrypted);
        await verifyInstanceStatuses();

    } catch (error) {
        console.error('Error loading encrypted instances:', error);
        instances = [];
    }
}


// Save instances to file
async function saveInstances() {
    try {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);

        let encrypted = cipher.update(JSON.stringify(instances), 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const payload = {
            iv: iv.toString('hex'),
            data: encrypted
        };

        await fs.writeFile(instancesFilePath, JSON.stringify(payload, null, 2));
    } catch (error) {
        console.error('Error saving encrypted instances:', error);
    }
}


// Clean up existing data only on fresh install
async function cleanupExistingDataOnInstall() {
    try {
        const userDataPath = app.getPath('userData');
        const installFlagFile = path.join(userDataPath, '.ghostshell-installed');
        
        // Check if this is a fresh install
        let isFirstRun = false;
        try {
            await fs.access(installFlagFile);
            // Flag exists, this is not a fresh install
            console.log('✅ Existing installation detected, skipping cleanup');
            return;
        } catch (error) {
            // Flag doesn't exist, this is a fresh install
            isFirstRun = true;
        }
        
        if (isFirstRun) {
            console.log('🧹 Fresh installation detected - cleaning up any existing data...');
            
            // Check and delete instances.json
            const instancesFile = path.join(userDataPath, 'instances.json');
            try {
                await fs.access(instancesFile);
                await fs.unlink(instancesFile);
                console.log('🗑️ Removed existing instances.json');
            } catch (error) {
                console.log('✅ No existing instances.json found');
            }
            
            // Check and delete chrome-profiles folder
            const chromeProfilesPath = path.join(userDataPath, 'chrome-profiles');
            try {
                await fs.access(chromeProfilesPath);
                await fs.rmdir(chromeProfilesPath, { recursive: true });
                console.log('🗑️ Removed existing chrome-profiles folder');
            } catch (error) {
                console.log('✅ No existing chrome-profiles found');
            }
            
            // Check and delete debug.log if exists
            const debugLogPath = path.join(userDataPath, 'debug.log');
            try {
                await fs.access(debugLogPath);
                await fs.unlink(debugLogPath);
                console.log('🗑️ Removed existing debug.log');
            } catch (error) {
                console.log('✅ No existing debug.log found');
            }
            
            // Create flag file to mark successful installation
            await fs.writeFile(installFlagFile, Date.now().toString());
            console.log('✅ Fresh install cleanup completed');
        }
        
    } catch (error) {
        console.error('⚠️ Install cleanup error (non-critical):', error.message);
    }
}


// Verify and cleanup instance statuses
async function verifyInstanceStatuses() {
    let statusUpdated = false;
    
    for (let instance of instances) {
        if (instance.status === 'running') {
            const mainModule = require('./main.js');
            const isBrowserRunning = mainModule.isBrowserRunning(instance.id);
            
            if (!isBrowserRunning) {
                console.log(`Updating stale status for instance ${instance.id}: ${instance.name}`);
                instance.status = 'stopped';
                statusUpdated = true;
            }
        }
    }
    
    if (statusUpdated) {
        await saveInstances();
    }
}


// Validate instance with server and update JSON
async function validateInstanceWithServer(instance) {
    try {
        console.log(`🔍 Server validation for instance ${instance.id}...`);
        
        const { machineId } = require('node-machine-id');
        const { SignJWT } = require('jose');
        
        const LICENSE_SERVER_URL = 'https://license-server-9flk.onrender.com';
        const JWT_SECRET = 'e84629515ba2c7c603c31fa6c58f4074e435e05b1220eae448623d9040f017cd';
        
        // Generate fingerprint
        const machineID = await machineId();
        const fingerprint = {
            machine_id: `${machineID}-${instance.id}`,
            platform: process.platform,
            arch: process.arch,
            instance_id: instance.id
        };
        
        const timestamp = new Date().toISOString();
        const version = "1.0.0";
        
        const requestData = {
            license_key: instance.licenseKey,
            fingerprint: fingerprint,
            timestamp: timestamp,
            version: version
        };
        
        // Generate signature
        const secret = new TextEncoder().encode(JWT_SECRET);
        const signature = await new SignJWT(requestData)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(secret);
        
        // Call server
        const response = await fetch(`${LICENSE_SERVER_URL}/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestData, signature: signature }),
            timeout: 10000 // 10 second timeout
        });
        
        const now = new Date().toISOString();
        
        if (!response.ok) {
            const errorData = await response.json();
            // Update instance with server rejection
            instance.lastServerCheck = now;
            instance.serverStatus = 'revoked';
            instance.serverMessage = errorData.detail || 'License validation failed';
            instance.nextCheckDue = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // Try again in 2 hours
            instance.offlineGracePeriod = null;
            
            // FORCE SHUTDOWN if instance is currently running
            await forceShutdownRevokedInstance(instance.id);
            
            return false;
        }
        
        const validationResult = await response.json();
        
        // Update instance with successful validation
        instance.lastServerCheck = now;
        instance.serverStatus = 'valid';
        instance.serverMessage = '';
        instance.expiresAt = validationResult.expires_at; // Update expiry from server
        instance.nextCheckDue = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // Next check in 12 hours
        instance.offlineGracePeriod = null;
        
        console.log(`✅ Server validation successful for instance ${instance.id}`);
        return true;
        
    } catch (error) {
        console.log(`❌ Server validation failed for instance ${instance.id}: ${error.message}`);
        
        const now = new Date().toISOString();
        instance.lastServerCheck = now;
        
        // If we haven't started grace period yet, start it
        if (!instance.offlineGracePeriod) {
            instance.offlineGracePeriod = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now
        }
        
        instance.nextCheckDue = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // Retry in 30 minutes
        
        // Check if grace period expired
        if (new Date() > new Date(instance.offlineGracePeriod)) {
            instance.serverStatus = 'error';
            instance.serverMessage = 'Server unreachable - grace period expired';
            
            // FORCE SHUTDOWN when grace period expires
            await forceShutdownRevokedInstance(instance.id);
            
            return false;
        }
        
        // Still in grace period - allow operation if last known status was valid
        return instance.serverStatus === 'valid';
    }
}


// Force shutdown revoked instances
async function forceShutdownRevokedInstance(instanceId) {
    try {
        console.log(`🛑 FORCING SHUTDOWN of revoked instance ${instanceId}`);
        
        const mainModule = require('./main.js');
        
        // Check if instance is actually running
        const scriptsRunning = mainModule.areScriptsRunning(instanceId);
        const browserRunning = mainModule.isBrowserRunning(instanceId);
        
        if (scriptsRunning || browserRunning) {
            console.log(`🔒 License revoked - forcing shutdown of active instance ${instanceId}`);
            
            // Force stop everything
            await mainModule.stopScripts(instanceId);
            
            // Update instance status
            const instance = instances.find(i => i.id === instanceId);
            if (instance) {
                instance.status = 'revoked';
                await saveInstances();
            }
            
            // Notify UI if manager window is open
            if (managerWindow && !managerWindow.isDestroyed()) {
                managerWindow.webContents.send('auto-action-completed', {
                    instanceId: instanceId,
                    action: 'revoked-shutdown',
                    newButtonState: 'launch-browser'
                });
            }
            
            console.log(`✅ Revoked instance ${instanceId} has been shut down`);
        }
        
    } catch (error) {
        console.error(`❌ Error forcing shutdown of revoked instance ${instanceId}:`, error);
    }
}

// Check for auto-start times
async function checkAutoStartTimes() {
    try {
        await loadInstances();
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;
        
        for (const instance of instances) {
            if (!instance.config.autoStartEnabled || !instance.config.autoStartTime) {
                continue;
            }
            
            const [startHour, startMin] = instance.config.autoStartTime.split(':').map(Number);
            const startTimeMinutes = startHour * 60 + startMin;
            
            // Check if current time matches start time (within 1 minute window)
            if (Math.abs(currentTimeMinutes - startTimeMinutes) <= 1) {
                console.log(`🌅 Auto-start time reached for instance ${instance.id}: ${instance.name}`);
                
                // Check if scripts are not already running
                const mainModule = require('./main.js');
                const scriptsRunning = mainModule.areScriptsRunning(instance.id);
                const browserRunning = mainModule.isBrowserRunning(instance.id);
                
                if (!scriptsRunning && !browserRunning) {
                    console.log(`🚀 Triggering auto-start for ${instance.id}`);
                    try {
                        await mainModule.executeAutoStart(instance.id);
                        
                        // Notify UI that auto-start completed
                        if (managerWindow && !managerWindow.isDestroyed()) {
                            managerWindow.webContents.send('auto-action-completed', {
                                instanceId: instance.id,
                                action: 'start',
                                newButtonState: 'stop-scripts'
                            });
                        }
                        
                    } catch (error) {
                        console.error(`Auto-start failed for ${instance.id}:`, error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in auto-start time checking:', error);
    }
}


// Handle browser close from main.js
function handleBrowserClose(instanceId) {
    if (!instanceId) {
        console.error('handleBrowserClose called without instanceId');
        return;
    }
    
    const targetInstance = instances.find(i => i.id === instanceId);
    if (targetInstance) {
        console.log(`Browser closed, updating status for instance ${instanceId}: ${targetInstance.name}`);
        targetInstance.status = 'stopped';
        saveInstances();
        
        // Refresh UI if manager window is open
        if (managerWindow && !managerWindow.isDestroyed()) {
            managerWindow.webContents.send('instance-status-changed');
        }
    }
}

ipcMain.handle('update-instance-status', async (event, instanceId, status) => {
    const instance = instances.find(i => i.id === instanceId);
    if (instance) {
        instance.status = status;
        await saveInstances();
        return { success: true };
    }
    return { success: false, error: 'Instance not found' };
});


// IPC handlers
ipcMain.handle('get-instances', async () => {
    await loadInstances();
    return instances;
});

ipcMain.handle('create-instance', async (event, licenseKey, instanceName) => {
    try {
        // Import validation functions
        const { machineId } = require('node-machine-id');
        const { SignJWT } = require('jose');
        
        const LICENSE_SERVER_URL = 'https://license-server-9flk.onrender.com';
        const JWT_SECRET = 'e19609515ba2c7c603c31fa6c58f4074e435e05b1220eae448623d9040f017cd8a9b2f3e7c1d4a5b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0';
        
        // Generate temporary fingerprint for validation
        const machineID = await machineId();
        const tempInstanceId = uuidv4(); // Generate temp ID for validation
        
        const fingerprint = {
            machine_id: `${machineID}-${tempInstanceId}`,
            platform: process.platform,
            arch: process.arch,
            instance_id: tempInstanceId
        };
        
        const timestamp = new Date().toISOString();
        const version = "1.0.0";
        
        const requestData = {
            license_key: licenseKey,
            fingerprint: fingerprint,
            timestamp: timestamp,
            version: version
        };
        
        // Generate signature
        const secret = new TextEncoder().encode(JWT_SECRET);
        const signature = await new SignJWT(requestData)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(secret);
        
        // Validate license with server
        const response = await fetch(`${LICENSE_SERVER_URL}/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...requestData,
                signature: signature
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'License validation failed');
        }
        
        const validationResult = await response.json();
        
        // If validation successful, create instance
        // Validate the custom name
        if (!instanceName || instanceName.trim().length === 0) {
            throw new Error('Instance name is required');
        }

        // Check if name already exists
        const existingInstance = instances.find(i => i.name.toLowerCase() === instanceName.trim().toLowerCase());
        if (existingInstance) {
            throw new Error('An instance with this name already exists');
        }

        // If validation successful, create instance
        const newInstance = {
            id: tempInstanceId,
            licenseKey: licenseKey,
            name: instanceName.trim(), 
            created: new Date().toISOString(),
            lastLaunched: null,
            status: 'created',
            validatedAt: new Date().toISOString(),
            expiresAt: validationResult.expires_at,
            lastServerCheck: new Date().toISOString(),
            serverStatus: 'valid',
            serverMessage: '',
            nextCheckDue: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12 hours from now
            offlineGracePeriod: null,
            config: {
                baseStake: 100,
                betInterval: 4.8,
                freeBetInterval: 10, 
                autoStopTime: '',
                dualBettingEnabled: false,
                dualStartTime: '16:00',
                dualEndTime: '02:00',
                dualStake1: 150,
                dualStake2: 150,

                // Intelligence Staking defaults
                intelligenceStakingEnabled: false,
                intelligenceThreshold: 60,

                // Add auto-start defaults
                autoStartEnabled: false,
                autoStartTime: '',
                autoStartSite: '',
                autoStartUsername: '',
                autoStartPassword: '',

                // SportPesa specific features
                sportpesaChatRefreshEnabled: false,
                chatRefreshInterval: 15,
                avatarChangeEnabled: false,        
                avatarChangeInterval: 0,     
                
                
                // Free Bet Strategy default
                freeBetStrategy: 'conservative',
            }
        };
        
        instances.push(newInstance);
        await saveInstances();
        return { success: true, instance: newInstance };
        
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('launch-instance', async (event, instanceId) => {
    const instance = instances.find(i => i.id === instanceId);
    if (instance) {
        // Just return success - no browser launching here
        return { success: true };
    }
    return { success: false, error: 'Instance not found' };
});


// Add these new IPC handlers for UI synchronization
ipcMain.handle('notify-auto-stop-completed', async (event, instanceId) => {
    try {
        console.log(`📡 Auto-stop completed for instance ${instanceId} - notifying UI`);
        
        // Update instance status in storage
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
            instance.status = 'stopped';
            await saveInstances();
        }
        
        // Notify UI if manager window is open
        if (managerWindow && !managerWindow.isDestroyed()) {
            managerWindow.webContents.send('auto-action-completed', {
                instanceId: instanceId,
                action: 'stop',
                newButtonState: 'launch-browser'
            });
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error in notify-auto-stop-completed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('notify-auto-start-completed', async (event, instanceId) => {
    try {
        console.log(`📡 Auto-start completed for instance ${instanceId} - notifying UI`);
        
        // Update instance status in storage
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
            instance.status = 'running';
            instance.lastLaunched = new Date().toISOString();
            await saveInstances();
        }
        
        // Notify UI if manager window is open
        if (managerWindow && !managerWindow.isDestroyed()) {
            managerWindow.webContents.send('auto-action-completed', {
                instanceId: instanceId,
                action: 'start',
                newButtonState: 'stop-scripts'
            });
        }
        
        return { success: true };
    } catch (error) {
        console.error('Error in notify-auto-start-completed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('trigger-auto-start', async (event, instanceId) => {
    try {
        console.log(`🌅 Auto-start triggered for instance ${instanceId}`);
        const mainModule = require('./main.js');
        await mainModule.executeAutoStart(instanceId);
        return { success: true };
    } catch (error) {
        console.error('Auto-start error:', error);
        return { success: false, error: error.message };
    }
});


ipcMain.handle('refresh-instances', async () => {
    await loadInstances();
    return instances;
});

ipcMain.handle('delete-instance', async (event, instanceId) => {
    try {
        const instance = instances.find(i => i.id === instanceId);
        if (!instance) {
            return { success: false, error: 'Instance not found' };
        }

        // 1. Stop any running scripts/browser for this instance
        try {
            const mainModule = require('./main.js');
            await mainModule.stopScripts(instanceId);
            console.log(`✅ Stopped scripts for instance ${instanceId} before deletion`);
        } catch (error) {
            console.log(`⚠️ Could not stop scripts for ${instanceId}: ${error.message}`);
        }

        // 2. Clean up Chrome profile directory
        const profilePath = path.join(app.getPath('userData'), 'chrome-profiles', instanceId);
        try {
            await fs.rm(profilePath, { recursive: true });
            console.log(`✅ Deleted Chrome profile: ${profilePath}`);
        } catch (error) {
            console.log(`⚠️ Could not delete Chrome profile ${profilePath}: ${error.message}`);
        }

        // 3. Clean up instance state
        try {
            const { removeInstanceState } = require('./instanceStore');
            removeInstanceState(instanceId);
            console.log(`✅ Cleaned up instance state for ${instanceId}`);
        } catch (error) {
            console.log(`⚠️ Could not clean instance state: ${error.message}`);
        }

        // 4. Remove from instances array and save
        instances = instances.filter(i => i.id !== instanceId);
        await saveInstances();

        console.log(`✅ Successfully deleted instance ${instanceId}: ${instance.name}`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Error deleting instance ${instanceId}:`, error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('update-instance-name', async (event, instanceId, newName) => {
    const instance = instances.find(i => i.id === instanceId);
    if (instance) {
        instance.name = newName;
        await saveInstances();
        return { success: true };
    }
    return { success: false, error: 'Instance not found' };
});


// Import main.js functions for instance IPC handlers
const mainFunctions = require('./main.js');

// Instance IPC handlers (for instance windows launched from manager)
ipcMain.handle('validate-license', async (event, licenseKey) => {
    try {
        const result = await mainFunctions.validateLicense(licenseKey);
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Add this new IPC handler with the other handlers:
ipcMain.handle('auto-stop-scripts', async (event, instanceId) => {
    try {
        console.log(`🛑 Auto-stop triggered for instance ${instanceId}`);
        const mainModule = require('./main.js');
        await mainModule.stopScripts(instanceId);
        return { success: true };
    } catch (error) {
        console.error('Auto-stop scripts error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('update-script-state', async (event, instanceId, isRunning) => {
    try {
        const mainModule = require('./main.js');
        mainModule.setScriptRunningState(instanceId, isRunning);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// Add after existing IPC handlers
ipcMain.handle('get-browser-state', async (event, instanceId) => {
    try {
        const state = getInstanceState(instanceId);
        const isBrowserRunning = !!state.browserInstance;
        const areScriptsRunning = !!state.isScriptsRunning;

        console.log(`≡🔍 [get-browser-state] Instance: ${instanceId}`);
        console.log(`≡🔍 BrowserInstance:`, isBrowserRunning ? state.browserInstance.constructor.name : null);
        console.log(`≡🔍 isScriptsRunning:`, areScriptsRunning);

        return {
            success: true,
            browserRunning: isBrowserRunning,
            scriptsRunning: areScriptsRunning
        };

    } catch (error) {
        console.error(`❌ Error in get-browser-state for instance ${instanceId}:`, error);
        return { success: false, error: error.message };
    }
});



// Browser and script control for instance pages
ipcMain.handle('launch-browser', async (event, instanceId) => {
    try {
        console.log('🐛 DEBUG: launch-browser handler started');
        
        if (!instanceId) {
            throw new Error('Instance ID is required');
        }
        console.log('🐛 DEBUG: instanceId validated:', instanceId);
        
        // Find the instance
        const instance = instances.find(i => i.id === instanceId);
        if (!instance) {
            throw new Error('Instance not found');
        }
        console.log('🐛 DEBUG: instance found:', instance.name);
        
        // Check if server validation is needed
        const needsServerCheck = !instance.nextCheckDue || new Date() > new Date(instance.nextCheckDue);

        if (needsServerCheck) {
            console.log(`🔍 Server validation needed for instance ${instanceId}...`);
            const serverValid = await validateInstanceWithServer(instance);
            await saveInstances(); // Save updated instance data
            
            if (!serverValid) {
                throw new Error(`License validation failed: ${instance.serverMessage || 'Server rejected license'}`);
            }
        }

        // Check local server status
        if (instance.serverStatus === 'revoked') {
            throw new Error(`License has been revoked: ${instance.serverMessage}`);
        }

        if (instance.serverStatus === 'error' && instance.offlineGracePeriod && new Date() > new Date(instance.offlineGracePeriod)) {
            throw new Error('License validation failed - unable to verify with server');
        }

        // Check local expiry date
        const expiryDate = new Date(instance.expiresAt);
        const currentDate = new Date();

        if (currentDate > expiryDate) {
            const formattedExpiry = expiryDate.toLocaleDateString();
            throw new Error(`License expired on ${formattedExpiry}. Please renew your license.`);
        }
        
        console.log(`✅ License valid until ${expiryDate.toLocaleDateString()}`);
        console.log('🐛 DEBUG: About to require main.js');
        
        const mainModule = require('./main.js');
        console.log('🐛 DEBUG: Successfully required main.js');
        
        console.log('🐛 DEBUG: About to call launchBrowser');
        await mainModule.launchBrowser(instanceId);
        console.log('🐛 DEBUG: launchBrowser completed successfully');
        
        console.log(`✅ Browser launched successfully for instance ${instanceId}`);
        return { success: true };
    } catch (error) {
        console.error('🐛 FULL ERROR in launch-browser:', error);
        console.error('🐛 ERROR STACK:', error.stack);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('start-scripts', async (event, config, instanceId) => {
    try {
        if (!instanceId) {
            throw new Error('Instance ID is required');
        }
        
        const mainModule = require('./main.js');
        await mainModule.injectScripts(instanceId, config);
        
        console.log(`✅ Scripts started successfully for instance ${instanceId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Start scripts error for instance ${instanceId}:`, error);
        return { success: false, error: error.message };
    }
});


// Stop scripts handler
ipcMain.handle('stop-scripts', async (event, instanceId) => {
    try {
        const mainModule = require('./main.js');
        await mainModule.stopScripts(instanceId);
        return { success: true };
    } catch (error) {
        console.error('Stop scripts error:', error);
        return { success: false, error: error.message };
    }
});

// ADD THIS NEW SECTION - Instance cleanup
ipcMain.handle('cleanup-instance-state', async (event, instanceId) => {
    try {
        const { removeInstanceState } = require('./instanceStore');
        const removed = removeInstanceState(instanceId);
        return { success: true, removed };
    } catch (error) {
        return { success: false, error: error.message };
    }
});


// Add this with the other IPC handlers
ipcMain.handle('save-all-config', async (event, instanceId, allConfig) => {
    try {
        console.log(`💾 Auto-saving ALL config for instance ${instanceId}:`, allConfig);
        
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
            // Update ALL config fields
            // Update ALL config fields
            instance.config.baseStake = allConfig.baseStake;
            instance.config.betInterval = allConfig.betInterval;
            instance.config.freeBetInterval = allConfig.freeBetInterval;
            instance.config.autoStopTime = allConfig.autoStopTime;
            instance.config.dualBettingEnabled = allConfig.dualBettingEnabled;
            instance.config.dualStartTime = allConfig.dualStartTime;
            instance.config.dualEndTime = allConfig.dualEndTime;
            instance.config.dualStake1 = allConfig.dualStake1;
            instance.config.dualStake2 = allConfig.dualStake2;
            instance.config.freeBetStrategy = allConfig.freeBetStrategy;
            
            // Intelligence Staking config
            instance.config.intelligenceStakingEnabled = allConfig.intelligenceStakingEnabled;
            instance.config.intelligenceThreshold = allConfig.intelligenceThreshold;
            
            // Auto-start config
            instance.config.autoStartEnabled = allConfig.autoStartEnabled;
            instance.config.autoStartTime = allConfig.autoStartTime;
            instance.config.autoStartSite = allConfig.autoStartSite;
            instance.config.autoStartUsername = allConfig.autoStartUsername;
            instance.config.autoStartPassword = allConfig.autoStartPassword;

            // SportPesa features config  
            instance.config.sportpesaChatRefreshEnabled = allConfig.sportpesaChatRefreshEnabled;
            instance.config.chatRefreshInterval = allConfig.chatRefreshInterval;
            instance.config.avatarChangeEnabled = allConfig.avatarChangeEnabled;      // ADD THIS
            instance.config.avatarChangeInterval = allConfig.avatarChangeInterval;    // ADD THIS
            
            // Save to file
            await saveInstances();
            console.log(`✅ ALL config auto-saved for instance ${instanceId}`);
            return { success: true };
        } else {
            return { success: false, error: 'Instance not found' };
        }
    } catch (error) {
        console.error('Error auto-saving all config:', error);
        return { success: false, error: error.message };
    }
});

// Periodic cleanup of stale instance states
setInterval(() => {
    const { cleanupStaleStates } = require('./instanceStore');
    const cleaned = cleanupStaleStates(2); // Clean states older than 2 hours
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} stale instance states`);
    }
}, 1000 * 60 * 30); // Run every 30 minutes

// App event handlers
app.whenReady().then(async () => {
    // Clean up any existing data first on fresh install (silent)
    await cleanupExistingDataOnInstall();
    
    createManagerWindow();

    // Start auto-start time checking (every minute)
    setInterval(async () => {
        await checkAutoStartTimes();
    }, 60000);

    // Start periodic license validation (every hour)
    setInterval(async () => {
        try {
            await loadInstances();
            let updated = false;
            
            for (const instance of instances) {
                const needsCheck = !instance.nextCheckDue || new Date() > new Date(instance.nextCheckDue);
                if (needsCheck) {
                    console.log(`🔍 Periodic server validation for ${instance.name}...`);
                    await validateInstanceWithServer(instance);
                    updated = true;
                }
            }
            
            if (updated) {
                await saveInstances();
            }
        } catch (error) {
            console.error('Error in periodic license validation:', error);
        }
    }, 60 * 60 * 1000); // Every hour
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createManagerWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});