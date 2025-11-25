const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { machineId } = require('node-machine-id');
const crypto = require('crypto-js');
const { SignJWT } = require('jose');
const os = require('os');
const { getInstanceState } = require('./instanceStore');



// Test environment detection
console.log('🔍 Environment Detection:');
console.log('  app.isPackaged:', require('electron').app.isPackaged);
console.log('  NODE_ENV:', process.env.NODE_ENV);
console.log('  Has npm_package:', Object.keys(process.env).some(key => key.startsWith('npm_package')));

const isDevelopment = !require('electron').app.isPackaged;
console.log('  Final determination - isDevelopment:', isDevelopment);


// License server configuration
const LICENSE_SERVER_URL = 'https://license-server-9flk.onrender.com';
const JWT_SECRET = 'e19609515ba2c7c603c31fa6c58f4074e435e05b1220eae448623d9040f017cd8a9b2f3e7c1d4a5b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0';


const isElevated = async () => {
    const platform = os.platform();

    if (platform === 'win32') {
        const exec = require('child_process').exec;
        return new Promise(resolve => {
            exec('net session', (err, stdout, stderr) => {
                resolve(!err); // No error = running as admin
            });
        });
    } else if (platform === 'darwin' || platform === 'linux') {
        return process.getuid && process.getuid() === 0;
    }

    return false;
};



app.whenReady().then(async () => {

    // Install network service if needed (macOS only)
    await ensureNetworkServiceInstalled();

    // Network operations will be handled by elevated helper process
    // Main app runs with normal privileges for maximum stealth
    console.log('🔍 Electron userData path:', app.getPath('userData'));
    console.log('🔍 Electron __dirname (runtime):', __dirname);
});

const fs = require('fs');


// Create debug logger for EXE version
function debugLog(message) {
    try {
        const logPath = path.join(require('electron').app.getPath('userData'), 'debug.log');
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(logPath, logEntry);
        console.log(message); // Also log to console
    } catch (error) {
        console.error('Debug log error:', error);
    }
}

// Initialize instance state
function initializeInstanceState(instanceId) {
    const state = getInstanceState(instanceId);
    console.log(`🔧 Initialized state for instance ${instanceId}`);
    return state;
}

// Set script running state for specific instance
function setScriptRunningState(instanceId, isRunning) {
    const state = getInstanceState(instanceId);
    state.isScriptsRunning = isRunning;
    console.log(`📝 Instance ${instanceId} script state set to: ${isRunning}`);
}

// Check if scripts are running for specific instance
function areScriptsRunning(instanceId) {
    const state = getInstanceState(instanceId);
    return state.isScriptsRunning;
}

// Check if browser is running for specific instance
function isBrowserRunning(instanceId) {
    const state = getInstanceState(instanceId);
    const isRunning = state.browserInstance &&
        state.browserInstance.process &&
        !state.browserInstance.process()?.killed;
    console.log(`🔍 Instance ${instanceId} browser running: ${isRunning}`);
    return isRunning;
}

// Set browser close callback for specific instance
function setBrowserCloseCallback(instanceId, callback) {
    const state = getInstanceState(instanceId);
    state.browserCloseCallback = callback;
    console.log(`📞 Set browser close callback for instance ${instanceId}`);
}





// Generate machine fingerprint for license validation
async function generateFingerprint() {
    try {
        const machineID = await machineId();
        const windowId = Date.now() + Math.random();
        return {
            machine_id: `${machineID}-${windowId}`,
            platform: process.platform,
            arch: process.arch,
            instance_id: windowId
        };
    } catch (error) {
        console.error('Error generating fingerprint:', error);
        throw error;
    }
}

// Generate JWT signature for license requests
async function generateSignature(data) {
    try {
        const verificationData = {
            license_key: data.license_key,
            fingerprint: data.fingerprint,
            timestamp: data.timestamp,
            version: data.version
        };

        const secret = new TextEncoder().encode(JWT_SECRET);
        const jwt = await new SignJWT(verificationData)
            .setProtectedHeader({ alg: 'HS256' })
            .sign(secret);
        return jwt;
    } catch (error) {
        console.error('Error generating signature:', error);
        throw error;
    }
}

// Validate license with your Python server
async function validateLicense(licenseKey) {
    try {
        const fingerprint = await generateFingerprint();
        const timestamp = new Date().toISOString();
        const version = "1.0.0";

        const requestData = {
            license_key: licenseKey,
            fingerprint: fingerprint,
            timestamp: timestamp,
            version: version
        };

        const signature = await generateSignature(requestData);

        const requestBody = {
            ...requestData,
            signature: signature
        };

        const response = await fetch(`${LICENSE_SERVER_URL}/validate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'License validation failed');
        }

        const result = await response.json();
        return result;

    } catch (error) {
        console.error('License validation error:', error);
        throw error;
    }
}


async function refreshNetwork(instanceId) {
    const isDevelopment = !require('electron').app.isPackaged;
    
    if (isDevelopment) {
        console.log(`🔧 Development mode: Simulating network refresh for instance ${instanceId}...`);
        
        // In development, we can either:
        // 1. Skip network refresh entirely (safest)
        // 2. Use direct system commands (requires sudo)
        // 3. Simulate the refresh with a delay
        
        // Option 1: Skip entirely (recommended for development)
        console.log(`📶 Development mode: Network refresh skipped for instance ${instanceId}`);
        return { 
            success: true, 
            network: 'dev-mode-skip',
            message: 'Network refresh skipped in development mode' 
        };
        
        /* 
        // Option 2: Direct system commands (uncomment if you want actual network refresh in dev)
        try {
            const os = require('os');
            const { exec } = require('child_process');
            
            if (os.platform() === 'darwin') {
                console.log('🔄 Development: Using direct networksetup commands...');
                
                // Get current network
                const getCurrentNetwork = () => new Promise((resolve, reject) => {
                    exec('networksetup -getairportnetwork Wi-Fi', (err, stdout) => {
                        if (err) return reject(err);
                        const match = stdout.match(/Current Wi-Fi Network: (.+)/);
                        if (match) {
                            resolve(match[1].trim());
                        } else {
                            reject(new Error('No WiFi network found'));
                        }
                    });
                });
                
                const currentNetwork = await getCurrentNetwork();
                console.log(`Current network: ${currentNetwork}`);
                
                // Disconnect and reconnect
                await new Promise((resolve, reject) => {
                    exec('networksetup -setairportpower Wi-Fi off', (err) => {
                        if (err) return reject(err);
                        console.log('WiFi disabled');
                        resolve();
                    });
                });
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                await new Promise((resolve, reject) => {
                    exec('networksetup -setairportpower Wi-Fi on', (err) => {
                        if (err) return reject(err);
                        console.log('WiFi enabled');
                        resolve();
                    });
                });
                
                return { success: true, network: currentNetwork };
            }
        } catch (error) {
            console.error(`❌ Development network refresh failed: ${error.message}`);
            return { success: false, error: error.message };
        }
        */
    }
    
    // Production mode - use the service
    try {
        console.log(`📶 Requesting network refresh from service for instance ${instanceId}...`);

        const response = await fetch('http://127.0.0.1:53700/refresh');
        const result = await response.json();

        if (result.success) {
            console.log(`✅ Network refresh successful for instance ${instanceId} (Network: ${result.network || 'unknown'})`);
            return result;
        } else {
            throw new Error(result.error || 'Unknown error from service');
        }
    } catch (error) {
        console.error(`❌ Network refresh failed for instance ${instanceId}:`, error.message);
        throw error;
    }
}


function waitForChatReconnectText(instanceId, timeout = 60000, interval = 2000) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const state = getInstanceState(instanceId);

        const check = async () => {
            try {
                if (!state.currentPage || state.currentPage.isClosed()) {
                    return reject(new Error('Browser page not available'));
                }

                const content = await state.currentPage.content();
                if (/establishing\s+a\s+chat\s+connection/i.test(content)) {
                    return resolve();
                }
                if (Date.now() - start > timeout) {
                    return reject(new Error('Timed out waiting for chat reconnect text'));
                }
                setTimeout(check, interval);
            } catch (e) {
                return reject(e);
            }
        };

        check();
    });
}


// Add stealth plugin with optimized settings
puppeteerExtra.use(StealthPlugin());


// Updated launchBrowser function with stealth capabilities
async function launchBrowser(instanceId) {
    try {
        console.log(`🐛 DEBUG: __dirname = ${__dirname}`);
        const state = initializeInstanceState(instanceId);
        console.log(`🚀 Launching browser for instance ${instanceId} with admin compatibility...`);

        // Find Chrome installation (your existing code is fine here)
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser'
        ];

        let chromePath = null;
        for (const chromeCandidate of chromePaths) {
            if (fs.existsSync(chromeCandidate)) {
                chromePath = chromeCandidate;
                break;
            }
        }

        if (!chromePath) {
            throw new Error('Chrome browser not found. Please install Google Chrome.');
        }

        // Use system temp directory to avoid permission issues
        // const userDataDir = path.join(os.tmpdir(), 'GhostShell-Profiles', instanceId);

        // Use persistent Chrome profiles in app data directory
        const userDataDir = path.join(app.getPath('userData'), 'ChromeProfiles', instanceId);

        // Ensure directory exists with proper permissions
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true, mode: 0o755 });
        }

        console.log(`🧪 Using userDataDir: ${userDataDir}`);

        // Launch with stable stealth configuration
        state.browserInstance = await puppeteerExtra.launch({
            executablePath: chromePath,
            headless: false,
            defaultViewport: null,
            // ✅ Let Puppeteer own the user-data-dir so it doesn't prepend a temp profile
            userDataDir: userDataDir,
            ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--allow-running-insecure-content',
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                '--exclude-switches=enable-automation',
                '--disable-plugins-discovery',
                '--disable-default-apps',
                '--disable-extensions',

                '--disable-features=VizDisplayCompositor',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-printing',
                '--disable-speech-api',
                // 🔻 REMOVED: '--disable-file-system' (can break persistence)
                '--disable-permissions-api',
                '--disable-presentation-api',
                '--disable-sensors',
                '--disable-wake-lock',
                '--disable-device-discovery-notifications',
                '--disable-infobars',
                '--disable-features=TranslateUI',
                '--disable-features=Translate',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-component-extensions-with-background-pages',
                '--no-pings'
                // (no --user-data-dir here)
            ]
        });


        // Set standard viewport
        // const standardViewport = { width: 1920, height: 1080 };


        // Rest of your existing code...
        state.browserInstance.on('disconnected', () => {
            console.log(`🔴 Browser disconnected/closed for instance ${instanceId}`);
            state.browserInstance = null;
            state.currentPage = null;
            state.isScriptsRunning = false;

            if (state.browserCloseCallback) {
                state.browserCloseCallback(instanceId);
            }
        });

        const pages = await state.browserInstance.pages();
        state.currentPage = pages[0];
        // await state.currentPage.setViewport(standardViewport);
        await setupMinimalAdditionalStealth(state.currentPage);
        await setupRequestInterception(state.currentPage);

        // Use try-catch for navigation to handle potential crashes
        try {
            await state.currentPage.goto('about:blank', {
                waitUntil: 'domcontentloaded',
                timeout: 5000
            });
        } catch (navError) {
            console.log('Navigation to about:blank failed, but browser is ready:', navError.message);
            // This is often fine - the page is still usable
        }

        console.log(`✅ Browser launched successfully for instance ${instanceId}`);
        return true;

    } catch (error) {
        console.error(`❌ Browser launch error for instance ${instanceId}:`, error);
        throw error;
    }
}

// 🔥 FIXED FUNCTION: Setup stealth mode for pages
async function setupMinimalAdditionalStealth(page) {
    try {
        console.log('🥷 Setting up enhanced stealth (plugin handles most)...');

        // More aggressive stealth setup
        // await page.evaluateOnNewDocument(() => {
        //     // Remove webdriver traces completely
        //     Object.defineProperty(navigator, 'webdriver', {
        //         get: () => undefined,
        //     });

        //     // Remove automation indicators
        //     delete navigator.__proto__.webdriver;

        //     // Override permissions
        //     const originalQuery = window.navigator.permissions.query;
        //     window.navigator.permissions.query = (parameters) => (
        //         parameters.name === 'notifications' ?
        //             Promise.resolve({ state: Notification.permission }) :
        //             originalQuery(parameters)
        //     );

        //     // Enhance chrome object
        //     if (!window.chrome) {
        //         window.chrome = {
        //             app: { isInstalled: false },
        //             webstore: {
        //                 onInstallStageChanged: {},
        //                 onDownloadProgress: {}
        //             },
        //             runtime: {
        //                 PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        //                 PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        //                 onConnect: null,
        //                 onMessage: null
        //             }
        //         };
        //     }

        //     // Override automation detection scripts
        //     Object.defineProperty(navigator, 'plugins', {
        //         get: () => [1, 2, 3, 4, 5] // Fake plugins
        //     });

        //     console.log('🥷 Enhanced stealth activated');
        // });

        await page.evaluateOnNewDocument(() => {
            // Complete webdriver removal
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            delete navigator.__proto__.webdriver;

            // Randomize navigator properties
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Override automation detection
            window.chrome = {
                app: { isInstalled: false },
                webstore: { onInstallStageChanged: {}, onDownloadProgress: {} },
                runtime: {
                    PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
                    PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
                    onConnect: null,
                    onMessage: null
                }
            };

            // Hide automation traces
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Spoof timezone
            Intl.DateTimeFormat.prototype.resolvedOptions = () => ({
                calendar: "gregory",
                day: "numeric",
                locale: "en-US",
                month: "numeric",
                numberingSystem: "latn",
                timeZone: "America/New_York",
                year: "numeric"
            });

            // Remove common detection points
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;
            delete window.cdc_adoQpoasnfa76pfcZLmcfl_Proxy;
        });



        console.log('✅ Enhanced stealth mode setup completed');

    } catch (error) {
        console.error('❌ Error setting up enhanced stealth mode:', error);
    }
}



async function setupRequestInterception(page) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        // Block known automation detection requests
        const blockedDomains = [
            'google-analytics.com',
            'googletagmanager.com',
            'doubleclick.net',
            'recaptcha.net'
        ];

        if (blockedDomains.some(domain => req.url().includes(domain))) {
            req.abort();
        } else {
            req.continue();
        }
    });
}



// Inject scripts into the browser for specific instance
async function injectScripts(instanceId, config) {
    // ADD EXTENSIVE DEBUG LOGGING
    debugLog('🚀 === INJECT SCRIPTS CALLED ===');
    debugLog(`🚀 Environment: ${require('electron').app.isPackaged ? 'PRODUCTION' : 'DEV'}`);
    debugLog(`🚀 Instance ID: ${instanceId}`);
    debugLog(`🚀 Config: ${JSON.stringify(config, null, 2)}`);

    const state = getInstanceState(instanceId);
    debugLog(`🚀 State exists: ${!!state}`);
    debugLog(`🚀 State currentPage exists: ${!!state.currentPage}`);

    if (!state.currentPage) {
        debugLog(`❌ Browser not available for instance ${instanceId}`);
        throw new Error(`Browser not available for instance ${instanceId}`);
    }

    try {
        debugLog(`🔍 Starting script injection process for instance ${instanceId}...`);

        // Step 1: Find and switch to game iframe with retry
        debugLog('📍 Step 1: Finding game iframe...');
        const gameFrame = await findGameIframe(instanceId);
        if (!gameFrame) {
            debugLog('❌ Game iframe not found');
            throw new Error('Game iframe not found. Please ensure you are on the Aviator game page.');
        }
        debugLog('✅ Game iframe found successfully');

        // Step 2: Verify game is ready
        debugLog('📍 Step 2: Verifying game is ready...');
        const gameReady = await verifyGameReady(instanceId, gameFrame);
        if (!gameReady) {
            debugLog('❌ Game not ready');
            throw new Error('Game not ready. Please wait for the game to fully load before starting scripts.');
        }
        debugLog('✅ Game is ready');


        // Step 2.5: Minimal iframe stealth (plugin handles most automatically)
        debugLog('📍 Step 2.5: Applying minimal iframe stealth (plugin handles the rest)...');
        await gameFrame.evaluate(() => {
            // Just ensure webdriver is completely gone (plugin should handle this, but extra safety)
            if (navigator.webdriver) {
                delete navigator.webdriver;
            }
            console.log('🥷 Game iframe stealth confirmed (plugin handles 20+ other protections)');
        });
        debugLog('✅ Game iframe stealth applied');

        // Step 3: Load scripts based on environment
        debugLog('📍 Step 3: Loading scripts based on environment...');
        let bettingScript, freeBetScript, rainScript, recoveryScript;

        const isDevelopment = !require('electron').app.isPackaged;
        debugLog(`🔧 Environment check - isDevelopment: ${isDevelopment}`);

        if (isDevelopment) {
            debugLog('🔧 DEV MODE: Loading raw scripts from files');
            const fs = require('fs').promises;

            try {
                debugLog('📁 Reading betting-strategy.js...');
                bettingScript = await fs.readFile(path.join(__dirname, 'scripts/betting-strategy.js'), 'utf8');
                debugLog(`✅ betting-strategy.js loaded (${bettingScript.length} chars)`);

                debugLog('📁 Reading free-bet-manager.js...');
                freeBetScript = await fs.readFile(path.join(__dirname, 'scripts/free-bet-manager.js'), 'utf8');
                debugLog(`✅ free-bet-manager.js loaded (${freeBetScript.length} chars)`);

                debugLog('📁 Reading rain-monitor.js...');
                rainScript = await fs.readFile(path.join(__dirname, 'scripts/rain-monitor.js'), 'utf8');
                debugLog(`✅ rain-monitor.js loaded (${rainScript.length} chars)`);

                debugLog('📁 Reading system-recovery.js...');
                recoveryScript = await fs.readFile(path.join(__dirname, 'scripts/system-recovery.js'), 'utf8');
                debugLog(`✅ system-recovery.js loaded (${recoveryScript.length} chars)`);
            } catch (fileError) {
                debugLog(`❌ Error reading script files: ${fileError.message}`);
                throw fileError;
            }
        } else {
            debugLog('🔐 PRODUCTION MODE: Loading protected scripts');
            try {
                debugLog('📦 Requiring protectedScripts module...');
                const scripts = require('./protectedScripts');
                debugLog('✅ protectedScripts module loaded');

                debugLog('🔓 Decrypting betting script...');
                bettingScript = scripts.bettingScript;
                debugLog(`✅ bettingScript decrypted (${bettingScript.length} chars)`);

                debugLog('🔓 Decrypting free bet script...');
                freeBetScript = scripts.freeBetScript;
                debugLog(`✅ freeBetScript decrypted (${freeBetScript.length} chars)`);

                debugLog('🔓 Decrypting rain script...');
                rainScript = scripts.rainScript;
                debugLog(`✅ rainScript decrypted (${rainScript.length} chars)`);

                debugLog('🔓 Decrypting recovery script...');
                recoveryScript = scripts.recoveryScript;
                debugLog(`✅ recoveryScript decrypted (${recoveryScript.length} chars)`);
            } catch (protectedError) {
                debugLog(`❌ Error loading protected scripts: ${protectedError.message}`);
                debugLog(`❌ Error stack: ${protectedError.stack}`);
                throw protectedError;
            }
        }

        // Step 4: Replace CONFIG values
        debugLog('📍 Step 4: Applying user configuration...');
        debugLog(`⚙️ Modifying betting script with config values...`);
        const modifiedBettingScript = bettingScript
            .replace(/"GHOST_BASE_STAKE_TOKEN"/g, config.baseStake)
            .replace(/"GHOST_BET_INTERVAL_TOKEN"/g, config.betInterval * 60000)
            .replace(/"GHOST_FREE_BET_INTERVAL_TOKEN"/g, config.freeBetInterval * 60000)
            .replace(/"GHOST_AUTO_STOP_TIME_TOKEN"/g, `"${config.autoStopTime}"`)
            .replace(/"GHOST_DUAL_ENABLED_TOKEN"/g, config.dualBettingEnabled.toString())
            .replace(/"GHOST_START_TIME_TOKEN"/g, `"${config.dualStartTime}"`)
            .replace(/"GHOST_END_TIME_TOKEN"/g, `"${config.dualEndTime}"`)
            .replace(/"GHOST_STAKE1_TOKEN"/g, config.dualStake1)
            .replace(/"GHOST_STAKE2_TOKEN"/g, config.dualStake2)
            .replace(/"GHOST_INTELLIGENCE_ENABLED_TOKEN"/g, config.intelligenceStakingEnabled.toString())
            .replace(/"GHOST_INTELLIGENCE_THRESHOLD_TOKEN"/g, config.intelligenceThreshold * 60000)
            .replace(/GHOST_SPORTPESA_CHAT_REFRESH_TOKEN/g, (config.sportpesaChatRefreshEnabled || false).toString())
            .replace(/"GHOST_CHAT_REFRESH_INTERVAL_TOKEN"/g, config.chatRefreshInterval || 30)
            .replace(/GHOST_AVATAR_CHANGE_ENABLED_TOKEN/g, (config.avatarChangeEnabled || false).toString())
            .replace(/"GHOST_AVATAR_CHANGE_INTERVAL_TOKEN"/g, config.avatarChangeInterval || 0)
            .replace(/"GHOST_FREE_BET_STRATEGY_TOKEN"/g, `"${config.freeBetStrategy || 'conservative'}"`);

        const modifiedFreeBetScript = freeBetScript
            .replace(/"GHOST_FREE_BET_INTERVAL_TOKEN"/g, config.freeBetInterval * 60000)
            + `\n\n// Set strategy from config\nwindow.freeBetStrategyConfig = "${config.freeBetStrategy || 'conservative'}";\nconsole.log('🎯 Free bet strategy set to:', window.freeBetStrategyConfig);`;
            
        const modifiedRecoveryScript = recoveryScript
            .replace(/"GHOST_DUAL_ENABLED_TOKEN"/g, config.dualBettingEnabled.toString())
            .replace(/"GHOST_START_TIME_TOKEN"/g, `"${config.dualStartTime}"`)
            .replace(/"GHOST_END_TIME_TOKEN"/g, `"${config.dualEndTime}"`);

        

        // Step 5a: Inject managerAPI into parent page first (skip for MSport)
        const pageUrl = state.currentPage.url();
        const isMSport = pageUrl.includes('aviator-next.spribegaming.com') &&
            pageUrl.includes('operator=msport_ng');

        if (!isMSport) {
            debugLog('📍 Step 5a: Injecting managerAPI into parent page...');
            await state.currentPage.evaluate((instanceId) => {
                // Inject the real managerAPI into parent page
                if (!window.managerAPI) {
                    window.managerAPI = {
                        autoStopScripts: async (instanceId) => {
                            // This would normally call Electron IPC, but we'll use a different approach
                            try {
                                // For now, just close the browser tab as a fallback
                                window.close();
                                return { success: true };
                            } catch (e) {
                                return { success: false, error: e.message };
                            }
                        },
                        notifyAutoStopCompleted: async (instanceId) => {
                            return { success: true };
                        }
                    };
                    console.log('✅ managerAPI injected into parent page');
                }
            }, instanceId);
            debugLog('✅ managerAPI injected into parent page');
        } else {
            debugLog('📍 Step 5a: Skipping parent page setup for MSport (direct injection)');
        }

        // Step 5b: Setup postMessage listener in parent page for iframe communication (skip for MSport)
        if (!isMSport) {
            debugLog('📍 Step 5b: Setting up postMessage listener in parent page...');

            await state.currentPage.evaluate(() => {
                // Add postMessage listener for iframe communication
                if (!window.iframeMessageListenerAdded) {
                    window.addEventListener('message', async (event) => {
                        if (event.origin !== 'https://aviator-next.spribegaming.com' &&
                            event.origin !== 'https://launch.spribegaming.com') return;

                        if (event.data.type === 'AUTO_STOP_REQUEST') {
                            try {
                                const result = await window.managerAPI.autoStopScripts(event.data.instanceId);
                                event.source.postMessage({
                                    type: 'AUTO_STOP_RESPONSE',
                                    messageId: event.data.messageId,
                                    result: result
                                }, event.origin);
                            } catch (e) {
                                event.source.postMessage({
                                    type: 'AUTO_STOP_RESPONSE',
                                    messageId: event.data.messageId,
                                    result: { success: false, error: e.message }
                                }, event.origin);
                            }
                        }

                        if (event.data.type === 'NOTIFY_AUTO_STOP_REQUEST') {
                            try {
                                const result = await window.managerAPI.notifyAutoStopCompleted(event.data.instanceId);
                                event.source.postMessage({
                                    type: 'NOTIFY_AUTO_STOP_RESPONSE',
                                    messageId: event.data.messageId,
                                    result: result
                                }, event.origin);
                            } catch (e) {
                                event.source.postMessage({
                                    type: 'NOTIFY_AUTO_STOP_RESPONSE',
                                    messageId: event.data.messageId,
                                    result: { success: false, error: e.message }
                                }, event.origin);
                            }
                        }
                    });
                    window.iframeMessageListenerAdded = true;
                    console.log('✅ postMessage listener added to parent page');
                }
            });
            debugLog('✅ postMessage listener setup completed');
        } else {
            debugLog('📍 Step 5b: Skipping postMessage setup for MSport (direct communication)');
        }

        // Step 6: Inject scripts in correct order into game iframe
        debugLog('📍 Step 6: Injecting scripts into game iframe...');
        debugLog(`💉 Injecting scripts into game iframe for instance ${instanceId}...`);

        // Step 5: Inject scripts in correct order into game iframe
        debugLog('📍 Step 7: Injecting scripts into game iframe...');
        debugLog(`💉 Injecting scripts into game iframe for instance ${instanceId}...`);

        debugLog('1️⃣ Injecting Rain Monitor...');
        await gameFrame.evaluate(rainScript);
        debugLog('✅ Rain Monitor injected successfully');
        await new Promise(resolve => setTimeout(resolve, 1000));

        debugLog('2️⃣ Injecting Free Bet Manager...');
        // await gameFrame.evaluate(freeBetScript);
        await gameFrame.evaluate(modifiedFreeBetScript);
        debugLog('✅ Free Bet Manager injected successfully');
        await new Promise(resolve => setTimeout(resolve, 50000));

        debugLog('3️⃣ Injecting Betting Strategy...');
        await gameFrame.evaluate(modifiedBettingScript);
        debugLog('✅ Betting Strategy injected successfully');
        await new Promise(resolve => setTimeout(resolve, 2000));

        debugLog('4️⃣ Injecting System Recovery...');
        await gameFrame.evaluate(modifiedRecoveryScript);
        debugLog('✅ System Recovery injected successfully');
        await new Promise(resolve => setTimeout(resolve, 1000));

        debugLog('5️⃣ Injecting instance ID for auto-stop...');
        await gameFrame.evaluate((instanceId) => {
            // Make instance ID available to the betting script for auto-stop
            window.currentInstanceId = instanceId;
            console.log(`🔧 Instance ID set for auto-stop: ${instanceId}`);
        }, instanceId);
        debugLog('✅ Instance ID injected successfully');

        // Step 6: Inject managerAPI for iframe communication
        debugLog('6️⃣ Injecting managerAPI for iframe communication...');
        await gameFrame.evaluate((instanceId) => {
            // Create managerAPI that sets attributes for Electron to monitor
            window.managerAPI = {
                autoStopScripts: async (instanceId) => {
                    console.log('🛑 Setting stop-scripts attribute for Electron to detect...');

                    const eventId = 'stop-' + Date.now() + '-' + Math.random();

                    // Set attributes on iframe document for Electron to monitor
                    document.body.setAttribute('data-electron-stop-scripts', instanceId);
                    document.body.setAttribute('data-electron-event-id', eventId);

                    console.log('✅ Stop attributes set - waiting for Electron response...');

                    // Wait for Electron to respond
                    return new Promise((resolve) => {
                        const listener = (event) => {
                            if (event.type === eventId) {
                                document.removeEventListener(eventId, listener);
                                resolve(event.detail);
                            }
                        };
                        document.addEventListener(eventId, listener);

                        // Timeout after 5 seconds
                        setTimeout(() => {
                            document.removeEventListener(eventId, listener);
                            resolve({ success: false, error: 'Electron response timeout' });
                        }, 5000);
                    });
                },

                notifyAutoStopCompleted: async (instanceId) => {
                    console.log('📡 Auto-stop completed notification');
                    return { success: true };
                }
            };

            console.log('✅ managerAPI with Electron attribute communication injected');
        }, instanceId);
        debugLog('✅ managerAPI injected successfully');




        // Step 7: Setup cleanup infrastructure
        debugLog('📍 Step 8: Setting up cleanup infrastructure...');
        await gameFrame.evaluate(() => {
            // Initialize cleanup arrays if they don't exist
            if (!window.KEYNEL_INTERVALS) window.KEYNEL_INTERVALS = [];
            if (!window.KEYNEL_TIMEOUTS) window.KEYNEL_TIMEOUTS = [];

            // Override setInterval to track intervals for cleanup
            const originalSetInterval = window.setInterval;
            window.setInterval = function (callback, delay) {
                const intervalId = originalSetInterval(callback, delay);
                window.KEYNEL_INTERVALS.push(intervalId);
                return intervalId;
            };

            // Override setTimeout to track timeouts for cleanup
            const originalSetTimeout = window.setTimeout;
            window.setTimeout = function (callback, delay) {
                const timeoutId = originalSetTimeout(callback, delay);
                window.KEYNEL_TIMEOUTS.push(timeoutId);
                return timeoutId;
            };

            console.log('✅ Cleanup infrastructure ready');
        });
        debugLog('✅ Cleanup infrastructure set up successfully');

        // Step 8: Setup Electron monitoring for iframe stop requests
        debugLog('📍 Step 8: Setting up Electron monitoring for iframe auto-stop...');

        // Store the monitor interval in state for cleanup
        state.stopScriptMonitor = setInterval(async () => {
            try {
                // Check for auto-stop request
                const stopRequest = await gameFrame.evaluate(() => {
                    const stopAttr = document.body.getAttribute('data-electron-stop-scripts');
                    if (stopAttr) {
                        const eventId = document.body.getAttribute('data-electron-event-id');
                        // Clear the attributes immediately
                        document.body.removeAttribute('data-electron-stop-scripts');
                        document.body.removeAttribute('data-electron-event-id');
                        return { instanceId: stopAttr, eventId: eventId };
                    }
                    return null;
                });

                if (stopRequest) {
                    debugLog(`🛑 Electron detected auto-stop request for ${stopRequest.instanceId}`);
                    clearInterval(state.stopScriptMonitor);

                    try {
                        // Call the actual stopScripts function
                        await stopScripts(stopRequest.instanceId);
                        debugLog('✅ Auto-stop completed successfully via Electron');

                        // IMPORTANT: Notify manager UI about auto-stop completion
                        try {
                            const { BrowserWindow } = require('electron');
                            const managerWindows = BrowserWindow.getAllWindows();
                            if (managerWindows.length > 0) {
                                managerWindows[0].webContents.send('auto-action-completed', {
                                    instanceId: stopRequest.instanceId,
                                    action: 'stop',
                                    newButtonState: 'launch-browser'
                                });
                                debugLog('📡 Sent auto-stop UI notification to manager');
                            }
                        } catch (notifyError) {
                            debugLog(`⚠️ Could not notify UI of auto-stop: ${notifyError.message}`);
                        }

                        // Notify iframe that stop completed (if iframe still exists)
                        try {
                            await gameFrame.evaluate((eventId) => {
                                const event = new CustomEvent(eventId, {
                                    detail: { success: true, method: 'electron-stopScripts' }
                                });
                                document.dispatchEvent(event);
                            }, stopRequest.eventId);
                        } catch (iframeError) {
                            // iframe might be closed already, which is fine
                            debugLog('iframe notification skipped - iframe likely closed');
                        }

                    } catch (error) {
                        debugLog(`❌ Auto-stop failed: ${error.message}`);

                        // Notify iframe of failure
                        await gameFrame.evaluate((eventId, errorMsg) => {
                            const event = new CustomEvent(eventId, {
                                detail: { success: false, error: errorMsg }
                            });
                            document.dispatchEvent(event);
                        }, stopRequest.eventId, error.message);
                    }
                }

                // Check for chat refresh request
                const refreshRequest = await gameFrame.evaluate(() => {
                    const refreshAttr = document.body.getAttribute('data-electron-chat-refresh');
                    if (refreshAttr === 'true') {
                        const refreshId = document.body.getAttribute('data-electron-refresh-id');
                        // Clear the attributes immediately
                        document.body.removeAttribute('data-electron-chat-refresh');
                        document.body.removeAttribute('data-electron-refresh-id');
                        return { requested: true, refreshId: refreshId };
                    }
                    return null;
                });

                if (refreshRequest) {
                    debugLog(`🔄 Chat refresh requested - performing WiFi disconnect/reconnect`);
                    try {

                        await refreshNetwork(instanceId); // ✅ Pass instanceId
                        debugLog(`✅ WiFi refresh completed successfully`);

                        // ✅ Set recovery flag inside game iframe so Recovery Manager can act
                        await gameFrame.evaluate(() => {
                            window.justRecoveredFromChatRefresh = true;
                            console.log("⚑ Flag set: justRecoveredFromChatRefresh = true");
                        });

                        // 🔥 Optional: trigger recovery immediately
                        await gameFrame.evaluate(async () => {
                            if (typeof window.forceSystemCheck === 'function') {
                                console.log("⚑ Triggering forceSystemCheck after chat refresh");
                                await window.forceSystemCheck();
                            }
                        });

                    } catch (err) {
                        debugLog(`❌ WiFi refresh failed: ${err.message}`);
                    }
                }




            } catch (error) {
                // iframe might be closed, stop monitoring
                debugLog('Stop monitoring ended - iframe likely closed');
                clearInterval(state.stopScriptMonitor);
            }
        }, 1000); // Check every second

        debugLog('✅ Electron iframe monitoring setup completed');





        state.isScriptsRunning = true;
        debugLog(`✅ All scripts injected successfully for instance ${instanceId}!`);
        debugLog('🚀 === INJECT SCRIPTS COMPLETED SUCCESSFULLY ===');
        return true;

    } catch (error) {
        debugLog(`❌ Script injection error for instance ${instanceId}: ${error.message}`);
        debugLog(`❌ Error stack: ${error.stack}`);
        debugLog('🚀 === INJECT SCRIPTS FAILED ===');
        throw error;
    }
}

// Find game iframe with retry logic for specific instance
// Find game iframe with retry logic for specific instance
async function findGameIframe(instanceId, maxRetries = 3) {
    const state = getInstanceState(instanceId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔍 Instance ${instanceId} - Attempt ${attempt}/${maxRetries}: Looking for game iframe...`);

            // Method 1: Find iframe by ID first (Site A - Original)
            console.log(`🔍 Method 1: Checking for #casinoGamePlay...`);
            const iframeHandle = await state.currentPage.$('#casinoGamePlay');
            if (iframeHandle) {
                const contentFrame = await iframeHandle.contentFrame();
                if (contentFrame) {
                    const frameUrl = contentFrame.url();
                    console.log(`✅ Found iframe by ID #casinoGamePlay: ${frameUrl}`);

                    // Verify it's the correct Spribe gaming URL
                    if (frameUrl.includes('spribegaming.com') && frameUrl.includes('aviator')) {
                        console.log('✅ Confirmed correct Spribe gaming iframe (Method 1)');
                        return contentFrame;
                    }
                }
            }

            // Method 2: Look for iframe inside #game-box (Site B - Primary)
            console.log(`🔍 Method 2: Checking for #game-box iframe...`);
            const gameBoxIframe = await state.currentPage.$('#game-box iframe');
            if (gameBoxIframe) {
                const contentFrame = await gameBoxIframe.contentFrame();
                if (contentFrame) {
                    const frameUrl = contentFrame.url();
                    console.log(`✅ Found iframe in #game-box: ${frameUrl}`);

                    if (frameUrl.includes('spribegaming.com') && frameUrl.includes('aviator')) {
                        console.log('✅ Confirmed correct Spribe gaming iframe (Method 2)');
                        return contentFrame;
                    }
                }
            }

            // Method 3: Look for iframe inside #game-wrapper (Site B - Backup)
            console.log(`🔍 Method 3: Checking for #game-wrapper iframe...`);
            const gameWrapperIframe = await state.currentPage.$('#game-wrapper iframe');
            if (gameWrapperIframe) {
                const contentFrame = await gameWrapperIframe.contentFrame();
                if (contentFrame) {
                    const frameUrl = contentFrame.url();
                    console.log(`✅ Found iframe in #game-wrapper: ${frameUrl}`);

                    if (frameUrl.includes('spribegaming.com') && frameUrl.includes('aviator')) {
                        console.log('✅ Confirmed correct Spribe gaming iframe (Method 3)');
                        return contentFrame;
                    }
                }
            }

            // Method 4: Look for iframe by class (Site B - Backup)
            console.log(`🔍 Method 4: Checking for .game-iframe__player iframe...`);
            const playerIframe = await state.currentPage.$('.game-iframe__player iframe');
            if (playerIframe) {
                const contentFrame = await playerIframe.contentFrame();
                if (contentFrame) {
                    const frameUrl = contentFrame.url();
                    console.log(`✅ Found iframe in .game-iframe__player: ${frameUrl}`);

                    if (frameUrl.includes('spribegaming.com') && frameUrl.includes('aviator')) {
                        console.log('✅ Confirmed correct Spribe gaming iframe (Method 4)');
                        return contentFrame;
                    }
                }
            }

            // Method 5: Search all frames for Spribe gaming URL (Universal Fallback)
            console.log(`🔍 Method 5: Searching all frames by URL...`);
            const frames = await state.currentPage.frames();
            console.log(`Found ${frames.length} total frames on page`);

            for (const frame of frames) {
                const frameUrl = frame.url();
                if ((frameUrl.includes('launch.spribegaming.com') || frameUrl.includes('aviator-next.spribegaming.com')) &&
                    frameUrl.includes('aviator')) {
                    console.log(`✅ Found correct game iframe by URL: ${frameUrl}`);
                    return frame;
                }
            }

            // 6. MSport: Check if we're directly on the game page (no iframe)
            const pageUrl = state.currentPage.url();
            if (pageUrl.includes('aviator-next.spribegaming.com') &&
                pageUrl.includes('operator=msport_ng')) {
                console.log('🎯 MSport detected - Direct page access (no iframe needed)');

                // Verify this is actually the game page by checking for app-game element
                const hasGameElement = await state.currentPage.evaluate(() => {
                    return !!document.querySelector('app-game');
                });

                if (hasGameElement) {
                    console.log('✅ MSport game page confirmed - using main frame');
                    return state.currentPage.mainFrame();
                } else {
                    console.log('❌ MSport page found but app-game element not detected');
                }
            }

            // If we get here, no iframe was found this attempt
            console.log(`❌ No suitable iframe found in attempt ${attempt}`);

            if (attempt < maxRetries) {
                console.log('⏳ Waiting 5 seconds before retry...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

        } catch (error) {
            console.error(`Error in attempt ${attempt}:`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    console.log(`❌ Failed to find game iframe after ${maxRetries} attempts`);
    return null;
}

// Verify game is ready for script injection for specific instance
async function verifyGameReady(instanceId, gameFrame, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🎮 Instance ${instanceId} - Attempt ${attempt}/${maxRetries}: Verifying game is ready...`);

            const gameElements = await gameFrame.evaluate(() => {
                const checks = {
                    betButton: !!document.querySelector('button[class*="bet"]') || !!document.querySelector('.bet-button') || Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('BET')),
                    multiplierDisplay: !!document.querySelector('[class*="multiplier"]') || !!document.querySelector('[class*="coeff"]'),
                    gameArea: !!document.querySelector('[class*="game"]') || !!document.querySelector('#game') || !!document.querySelector('.game-area'),
                    anyButton: document.querySelectorAll('button').length > 0,
                    bodyReady: document.body && document.body.children.length > 0
                };

                return {
                    checks,
                    totalElements: document.querySelectorAll('*').length,
                    hasButtons: document.querySelectorAll('button').length,
                    bodyClass: document.body ? document.body.className : 'no-body',
                    title: document.title
                };
            });

            if (gameElements.totalElements > 50 && gameElements.hasButtons > 0) {
                console.log(`✅ Game appears ready for script injection for instance ${instanceId}`);
                return true;
            }

            if (attempt < maxRetries) {
                console.log('⏳ Waiting 3 seconds for game to load...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

        } catch (error) {
            console.error(`Error verifying game readiness (attempt ${attempt}):`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    return true; // Proceed anyway as a fallback
}

// Stop all running scripts gracefully for specific instance
async function stopScripts(instanceId) {
    const state = getInstanceState(instanceId);

    try {
        console.log(`🛑 Initiating script shutdown for instance ${instanceId}...`);

        // FIRST: Stop the monitoring interval if it exists
        if (state.stopScriptMonitor) {
            clearInterval(state.stopScriptMonitor);
            state.stopScriptMonitor = null;
            console.log('✅ Stopped auto-stop monitoring interval');
        }

        // Step 1: Stop all injected scripts gracefully
        if (state.currentPage && !state.currentPage.isClosed()) {
            console.log('📜 Stopping injected scripts...');

            const gameFrame = await findGameIframe(instanceId);
            if (gameFrame) {
                await gameFrame.evaluate(() => {
                    // Stop all running intervals/timeouts created by our scripts
                    if (window.KEYNEL_INTERVALS) {
                        window.KEYNEL_INTERVALS.forEach(interval => clearInterval(interval));
                        window.KEYNEL_INTERVALS = [];
                    }

                    if (window.KEYNEL_TIMEOUTS) {
                        window.KEYNEL_TIMEOUTS.forEach(timeout => clearTimeout(timeout));
                        window.KEYNEL_TIMEOUTS = [];
                    }

                    // Stop any active betting processes
                    if (window.KEYNEL_STOP_BETTING) {
                        window.KEYNEL_STOP_BETTING();
                    }

                    // Clean up event listeners
                    if (window.KEYNEL_CLEANUP) {
                        window.KEYNEL_CLEANUP();
                    }

                    // Clear all global variables that might conflict
                    delete window.gameState;
                    delete window.bettingStrategy;
                    delete window.freeBetManager;
                    delete window.rainMonitor;
                    delete window.systemRecovery;

                    const scriptVars = Object.keys(window).filter(key =>
                        key.startsWith('KEYNEL_') ||
                        key.includes('aviator') ||
                        key.includes('betting') ||
                        key.includes('gameState')
                    );

                    scriptVars.forEach(varName => {
                        try {
                            delete window[varName];
                        } catch (e) {
                            // Some variables might not be deletable
                        }
                    });

                    console.log('✅ GhostShell scripts stopped and cleaned up');
                });

                console.log('✅ Scripts stopped successfully');
            }
        }

        // Step 2: Close browser gracefully
        if (state.browserInstance && !state.browserInstance.process()?.killed) {
            console.log(`🌐 Closing browser for instance ${instanceId}...`);


            await new Promise(resolve => setTimeout(resolve, 2000));

            const pages = await state.browserInstance.pages();
            for (const page of pages) {
                if (!page.isClosed()) {
                    await page.close();
                }
            }

            await state.browserInstance.close();
            console.log(`✅ Browser closed successfully for instance ${instanceId}`);
        }

        // Step 3: Reset instance state
        state.browserInstance = null;
        state.currentPage = null;
        state.isScriptsRunning = false;
        state.scriptCleanupFunctions = [];

        console.log(`✅ All systems stopped and cleaned up for instance ${instanceId}`);
        return true;

    } catch (error) {
        console.error(`❌ Error during script shutdown for instance ${instanceId}:`, error);

        // Force cleanup even if there were errors
        try {
            if (state.browserInstance) {
                await state.browserInstance.close();
            }
        } catch (forceCloseError) {
            console.error('Force close error:', forceCloseError);
        }

        // Reset state regardless
        state.browserInstance = null;
        state.currentPage = null;
        state.isScriptsRunning = false;
        state.scriptCleanupFunctions = [];

        throw error;
    }
}

// Execute auto-start sequence for specific instance
async function executeAutoStart(instanceId) {
    try {
        debugLog(`🌅 Starting auto-start sequence for instance ${instanceId}`);

        // Get instance data
        const { app } = require('electron');
        const fs = require('fs').promises;
        const crypto = require('crypto');
        const path = require('path');

        const ENCRYPTION_KEY = 'PcXsWOVLlg3DkjwqcwB6IutsA1ZXfnm3';
        const instancesFilePath = path.join(app.getPath('userData'), 'instances.json');

        // Load and decrypt instances
        const raw = await fs.readFile(instancesFilePath, 'utf8');
        const { iv, data } = JSON.parse(raw);
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), Buffer.from(iv, 'hex'));
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        const instances = JSON.parse(decrypted);

        const instance = instances.find(i => i.id === instanceId);
        if (!instance || !instance.config.autoStartEnabled) {
            throw new Error('Instance not found or auto-start not enabled');
        }

        debugLog(`🔧 Auto-start config: Site=${instance.config.autoStartSite}, Username=${instance.config.autoStartUsername}`);

        // Step 1: Launch browser
        debugLog('📍 Step 1: Launching browser...');
        await launchBrowser(instanceId);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 2: Navigate and login based on site
        debugLog('📍 Step 2: Navigating to site and logging in...');
        await navigateAndLogin(instanceId, instance.config);

        // Step 3: Navigate to Aviator game
        debugLog('📍 Step 3: Navigating to Aviator game...');
        await navigateToAviator(instanceId, instance.config.autoStartSite);

        // Step 4: Start bot scripts
        debugLog('📍 Step 4: Starting bot scripts...');
        const botConfig = {
            baseStake: instance.config.baseStake,
            betInterval: instance.config.betInterval,
            freeBetInterval: instance.config.freeBetInterval,
            autoStopTime: instance.config.autoStopTime,
            dualBettingEnabled: instance.config.dualBettingEnabled,
            dualStartTime: instance.config.dualStartTime,
            dualEndTime: instance.config.dualEndTime,
            dualStake1: instance.config.dualStake1,
            dualStake2: instance.config.dualStake2,
            avatarChangeEnabled: instance.config.avatarChangeEnabled,
            avatarChangeInterval: instance.config.avatarChangeInterval
        };

        await injectScripts(instanceId, botConfig);

        // Set scripts running state
        setScriptRunningState(instanceId, true);

        debugLog('✅ Auto-start sequence completed successfully');

        // Notify manager about auto-start completion (for UI sync)
        try {
            const { ipcMain } = require('electron');
            // Don't use ipcMain.invoke here, just emit the event directly to the manager window
            const { app, BrowserWindow } = require('electron');
            const managerWindows = BrowserWindow.getAllWindows();
            if (managerWindows.length > 0) {
                managerWindows[0].webContents.send('auto-action-completed', {
                    instanceId: instanceId,
                    action: 'start',
                    newButtonState: 'stop-scripts'
                });
                debugLog('📡 Sent auto-start completion notification to UI');
            }
        } catch (notifyError) {
            debugLog(`⚠️ Could not notify UI of auto-start completion: ${notifyError.message}`);
        }

        return true;

    } catch (error) {
        debugLog(`❌ Auto-start sequence failed for instance ${instanceId}: ${error.message}`);
        throw error;
    }
}






// Navigate to site and perform login
async function navigateAndLogin(instanceId, config) {
    const state = getInstanceState(instanceId);
    if (!state.currentPage) {
        throw new Error('Browser page not available');
    }

    const { autoStartSite, autoStartUsername, autoStartPassword } = config;

    try {
        debugLog(`🌐 Navigating to ${autoStartSite}...`);

        if (autoStartSite === 'betnare') {
            await state.currentPage.goto('https://betnare.com', { waitUntil: 'networkidle2' });
        } else if (autoStartSite === 'sportpesa') {
            await state.currentPage.goto('https://ke.sportpesa.com', { waitUntil: 'networkidle2' });
        } else {
            throw new Error(`Unsupported site: ${autoStartSite}`);
        }

        await new Promise(resolve => setTimeout(resolve, 3000));

        // Check if already logged in by looking for balance
        debugLog('🔍 Checking if already logged in...');
        const isLoggedIn = await checkIfLoggedIn(state.currentPage, autoStartSite);

        if (isLoggedIn) {
            debugLog(`✅ Already logged into ${autoStartSite} - skipping login`);
        } else {
            debugLog(`🔑 Not logged in - proceeding with login to ${autoStartSite}...`);

            if (autoStartSite === 'betnare') {
                await loginToBetnare(state.currentPage, autoStartUsername, autoStartPassword);
            } else if (autoStartSite === 'sportpesa') {
                await loginToSportpesa(state.currentPage, autoStartUsername, autoStartPassword);
            }

            debugLog(`✅ Login completed for ${autoStartSite}`);
        }

    } catch (error) {
        debugLog(`❌ Navigation/login failed for ${autoStartSite}: ${error.message}`);

        // Retry once
        debugLog('🔄 Retrying navigation/login...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        if (autoStartSite === 'betnare') {
            await loginToBetnare(state.currentPage, autoStartUsername, autoStartPassword);
        } else if (autoStartSite === 'sportpesa') {
            await loginToSportpesa(state.currentPage, autoStartUsername, autoStartPassword);
        }

        debugLog(`✅ Successfully completed ${autoStartSite} on retry`);
    }
}


// Check if user is already logged in by looking for balance
async function checkIfLoggedIn(page, site) {
    try {
        let balanceXPath;

        if (site === 'betnare') {
            balanceXPath = '//*[@id="navbar-collapse-main "]/div/div/div[1]/div/button/span[2]';
        } else if (site === 'sportpesa') {
            balanceXPath = '//*[@id="balance"]';
        } else {
            return false;
        }

        debugLog(`🔍 Looking for balance element: ${balanceXPath}`);

        // Wait up to 5 seconds for balance element
        try {
            await page.waitForXPath(balanceXPath, { timeout: 5000 });
            debugLog('✅ Balance element found - user is logged in');
            return true;
        } catch (timeoutError) {
            debugLog('❌ Balance element not found - user is not logged in');
            return false;
        }

    } catch (error) {
        debugLog(`❌ Error checking login status: ${error.message}`);
        return false; // Assume not logged in if we can't check
    }
}

// Login to Betnare
async function loginToBetnare(page, username, password) {
    // DON'T navigate - we're already on betnare.com from navigateAndLogin()
    debugLog('🔘 Clicking login button on current landing page...');

    try {
        // Click login button on landing page to open login modal/page
        await page.waitForXPath('//*[@id="navbar-collapse-main "]/div/div/div[2]/div/a[1]', { timeout: 10000 });
        const landingLoginBtn = await page.$x('//*[@id="navbar-collapse-main "]/div/div/div[2]/div/a[1]');
        // Instead of the complex XPath, try this simpler one:
        // const landingLoginBtn = await page.$x('//a[@href="/login" and contains(@class, "login-color")]');
        if (landingLoginBtn[0]) {
            // Use JavaScript click to bypass clickability issues
            await page.evaluate(element => element.click(), landingLoginBtn[0]);
            debugLog('✅ Clicked login button via JavaScript, waiting for login page...');
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
            throw new Error('Login button not found on landing page');
        }

        // Wait for login page/modal to load and find username field
        debugLog('📝 Waiting for login form and filling username...');
        await page.waitForXPath('//*[@id="app"]/div/div[1]/div/div/div/div[2]/div/div[1]/div/div/div/div/div[2]/form/div/div[1]/div/input', { timeout: 10000 });
        const usernameInput = await page.$x('//*[@id="app"]/div/div[1]/div/div/div/div[2]/div/div[1]/div/div/div/div/div[2]/form/div/div[1]/div/input');
        if (usernameInput[0]) {
            await usernameInput[0].click();
            await usernameInput[0].type(username);
            debugLog('✅ Username filled');
        } else {
            throw new Error('Username field not found on login page');
        }

        // Fill password
        debugLog('🔒 Filling password...');
        const passwordInput = await page.$x('//*[@id="app"]/div/div[1]/div/div/div/div[2]/div/div[1]/div/div/div/div/div[2]/form/div/div[2]/div[1]/input');
        if (passwordInput[0]) {
            await passwordInput[0].click();
            await passwordInput[0].type(password);
            debugLog('✅ Password filled');
        } else {
            throw new Error('Password field not found on login page');
        }

        // Click login button
        debugLog('🔘 Clicking login button...');
        const loginBtn = await page.$x('//*[@id="app"]/div/div[1]/div/div/div/div[2]/div/div[1]/div/div/div/div/div[2]/form/div/div[3]/button');
        if (loginBtn[0]) {
            await loginBtn[0].click();
            debugLog('✅ Login button clicked, waiting for login to complete...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Verify login was successful by checking for balance
        debugLog('🔍 Verifying login success by checking balance...');
        const loginSuccess = await checkIfLoggedIn(page, 'betnare');
        if (!loginSuccess) {
            throw new Error('Login verification failed - balance element not found');
        }
        debugLog('✅ Login verified - balance element found');

        // Wait additional 10 seconds for everything to load, including Aviator button
        debugLog('⏳ Waiting 10 more seconds for complete page load...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        debugLog('✅ Sportpesa login completed');

    } catch (error) {
        debugLog(`❌ Betnare login error: ${error.message}`);
        throw error;
    }
}

// Login to Sportpesa
async function loginToSportpesa(page, username, password) {
    // DON'T navigate - we're already on ke.sportpesa.com from navigateAndLogin()
    debugLog('📝 Filling username directly on current page...');

    try {
        // Fill username
        debugLog('📝 Waiting for username field and filling...');
        await page.waitForXPath('//*[@id="username"]', { timeout: 10000 });
        const usernameInput = await page.$x('//*[@id="username"]');
        if (usernameInput[0]) {
            await usernameInput[0].click();
            await usernameInput[0].evaluate(el => el.value = '');
            await usernameInput[0].type(username);
            debugLog('✅ Username filled');
        } else {
            throw new Error('Username field not found on login page');
        }

        // Fill password
        debugLog('🔒 Filling password...');
        const passwordInput = await page.$x('//*[@id="password"]');
        if (passwordInput[0]) {
            await passwordInput[0].click();
            await passwordInput[0].evaluate(el => el.value = '');
            await passwordInput[0].type(password);
            debugLog('✅ Password filled');
        } else {
            throw new Error('Password field not found on login page');
        }

        // Click login button
        debugLog('🔘 Clicking login button...');
        const loginBtn = await page.$x('//*[@id="secondary_login"]/input[4]');
        if (loginBtn[0]) {
            await loginBtn[0].click();
            debugLog('✅ Login button clicked, waiting for login to complete...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
            throw new Error('Login button not found on login page');
        }

        // Verify login was successful by checking for balance
        debugLog('🔍 Verifying login success by checking balance...');
        const loginSuccess = await checkIfLoggedIn(page, 'sportpesa');
        if (!loginSuccess) {
            throw new Error('Login verification failed - balance element not found');
        }
        debugLog('✅ Login verified - balance element found');

        // Wait additional 10 seconds for everything to load, including Aviator button
        debugLog('⏳ Waiting 10 more seconds for complete page load...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        debugLog('✅ Sportpesa login completed');

    } catch (error) {
        debugLog(`❌ Sportpesa login error: ${error.message}`);
        throw error;
    }
}

// Navigate to Aviator game
async function navigateToAviator(instanceId, site) {
    const state = getInstanceState(instanceId);
    if (!state.currentPage) {
        throw new Error('Browser page not available');
    }

    try {
        // In your navigateToAviator function, replace the current Betnare section:
        if (site === 'betnare') {
            debugLog('🎮 Finding and clicking Aviator game on Betnare...');

            // Step 1: Find Aviator card by image URL (more reliable than alt text)
            debugLog('🔍 Looking for Aviator game image...');
            await state.currentPage.waitForSelector('img[src*="AVIATORTILEWEB"]', { timeout: 15000 });

            // Step 2: Get the clickable container
            const aviatorImage = await state.currentPage.$('img[src*="AVIATORTILEWEB"]');
            const clickableDiv = await state.currentPage.evaluateHandle(img =>
                img.closest('div[style*="cursor: pointer"]'), aviatorImage);

            if (!clickableDiv) {
                throw new Error('Could not find clickable Aviator card container');
            }

            // Step 3: Click card to show overlay with Play/Demo buttons
            debugLog('🔘 Clicking Aviator card to show overlay...');
            await clickableDiv.click();
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 4: Wait for overlay and click Play button
            debugLog('⏳ Waiting for overlay with Play button...');
            await state.currentPage.waitForSelector('.overlay-set-up .play-button', { timeout: 10000 });

            debugLog('🔘 Clicking Play button...');
            await state.currentPage.click('.overlay-set-up .play-button');

            // Step 5: Verify navigation to game URL
            debugLog('🔍 Verifying navigation to Aviator game...');
            await state.currentPage.waitForFunction(
                () => window.location.href.includes('play-game') && window.location.href.includes('aviator'),
                { timeout: 15000 }
            );

            debugLog('✅ Successfully navigated to Aviator game page');
            debugLog(`📍 Game URL: ${await state.currentPage.url()}`);

            // Step 6: Wait for game iframe to load
            debugLog('⏳ Waiting for game iframe to load...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        else if (site === 'sportpesa') {
            debugLog('🎮 Clicking Aviator game button on Sportpesa...');
            await state.currentPage.waitForXPath('/html/body/header/navigation-bar/div[1]/div/div/div/div[1]/ul/item-menu[3]/li/a/span[1]', { timeout: 15000 });
            const aviatorBtn = await state.currentPage.$x('/html/body/header/navigation-bar/div[1]/div/div/div/div[1]/ul/item-menu[3]/li/a/span[1]');
            if (aviatorBtn[0]) {
                await aviatorBtn[0].click();
                debugLog('✅ Aviator button clicked, waiting 40 seconds for game to load...');
                await new Promise(resolve => setTimeout(resolve, 40000)); // Wait 40 seconds for game to load
            }
        }

        debugLog('✅ Aviator game navigation completed');

        // Wait for game to fully load
        await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
        debugLog(`❌ Failed to navigate to Aviator on ${site}: ${error.message}`);
        throw error;
    }
}


// Install macOS network service on first run
async function ensureNetworkServiceInstalled() {
    if (process.platform !== 'darwin') return true;

    // Skip service installation in development mode
    const isDevelopment = !require('electron').app.isPackaged;
    if (isDevelopment) {
        console.log('🔧 Development mode detected - skipping network service installation');
        console.log('📋 Network refresh will use fallback methods in development');
        return true;
    }

    try {
        // Check if service is already running
        const { exec, execSync } = require('child_process');
        const checkService = () => new Promise((resolve) => {
            exec('launchctl list com.ghostshell.network', (err) => {
                resolve(!err); // Service exists if no error
            });
        });

        const serviceExists = await checkService();
        if (serviceExists) {
            console.log('✅ Network service already installed');
            return true;
        }

        // Service doesn't exist, install it
        console.log('📦 Installing network helper service...');

        const appPath = process.resourcesPath;
        const plistSrc = path.join(appPath, 'com.ghostshell.network.plist');
        const plistDest = '/Library/LaunchDaemons/com.ghostshell.network.plist';

        // Copy plist to system location (requires admin password)
        // execSync(`sudo cp "${plistSrc}" "${plistDest}"`);
        // execSync(`sudo chown root:wheel "${plistDest}"`);
        // execSync(`sudo chmod 644 "${plistDest}"`);

        // // Load the service
        // execSync(`sudo launchctl load -w "${plistDest}"`);

        const { promisify } = require('util');
        const sudo = require('sudo-prompt');
        const sudoExec = promisify(sudo.exec);

        const commands = [
            `cp "${plistSrc}" "${plistDest}"`,
            `chown root:wheel "${plistDest}"`,
            `chmod 644 "${plistDest}"`,
            `launchctl load -w "${plistDest}"`
        ].join(' && ');

        await sudoExec(commands, { name: 'GhostShell' });

        console.log('✅ Network service installed successfully');
        return true;

    } catch (error) {
        console.error('❌ Failed to install network service:', error.message);
        return false;
    }
}


// Export functions for use by manager.js
module.exports = {
    validateLicense,
    launchBrowser,
    injectScripts,
    stopScripts,
    setBrowserCloseCallback,
    areScriptsRunning,
    isBrowserRunning,
    setScriptRunningState,
    generateFingerprint,
    findGameIframe,
    verifyGameReady,
    initializeInstanceState,
    executeAutoStart
};




// Clean shutdown: close all browser instances when app quits
app.on('before-quit', async () => {
    console.log('🛑 GhostShell shutting down - closing all browser instances...');
    try {
        const { getInstanceState } = require('./instanceStore');
        const { stopScripts } = module.exports; // already exported above

        // Assuming you have multiple instances tracked in instanceStore
        const instances = Object.keys(require.cache[require.resolve('./instanceStore')].exports.instances || {});
        for (const instanceId of instances) {
            const state = getInstanceState(instanceId);
            if (state.browserInstance && !state.browserInstance.process()?.killed) {
                try {
                    console.log(`🧹 Stopping scripts and closing browser for instance ${instanceId}...`);
                    await stopScripts(instanceId);
                } catch (err) {
                    console.error(`❌ Failed to stop instance ${instanceId}:`, err.message);
                }
            }
        }
        console.log('✅ All browsers closed cleanly');
    } catch (err) {
        console.error('❌ Error during global shutdown:', err);
    }
});
