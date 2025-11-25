console.log("🔥 LOADING MINIMAL MANAGER-RENDERER");

// DOM elements
const instancesList = document.getElementById('instancesList');
const newLicenseKeyInput = document.getElementById('newLicenseKey');
const createInstanceBtn = document.getElementById('createInstanceBtn');
const newInstanceNameInput = document.getElementById('newInstanceName');
// State
let instances = [];
let currentInstanceId = null;

let instanceConfigStates = {}; // { instanceId: { disabled: true/false } }
let instanceErrorStates = {}; // { instanceId: { launchError: "message", timeout: timeoutId } }


// SIMPLE navigation - no fancy refresh logic
function showHomePage() {
    console.log('🏠 Going to home page');
    document.getElementById('homePage').classList.add('active');
    document.getElementById('instancePage').classList.remove('active');
    currentInstanceId = null;

    loadInstances(); // Refresh instances when returning to home
}

async function showInstancePage(instanceId) {
    console.log(`🔄 Going to instance page: ${instanceId}`);

    const instance = instances.find(i => i.id === instanceId);
    if (!instance) {
        console.error(`Instance ${instanceId} not found`);
        return;
    }

    currentInstanceId = instanceId;

    // Update instance page content
    document.getElementById('instanceTitle').textContent = instance.name;
    document.getElementById('instanceSubtitle').textContent = `License: ${maskLicenseKey(instance.licenseKey)}`;
    document.getElementById('licenseKey').value = instance.licenseKey;
    document.getElementById('freeBetInterval').value = instance.config.freeBetInterval || 10;

    // Set config
    // Set config
    if (instance.config) {
        document.getElementById('baseStake').value = instance.config.baseStake || 100;
        document.getElementById('dualBetting').checked = instance.config.dualBettingEnabled || false;
        document.getElementById('startTime').value = instance.config.dualStartTime || '16:00';
        document.getElementById('endTime').value = instance.config.dualEndTime || '02:00';
        document.getElementById('panel1Stake').value = instance.config.dualStake1 || 150;
        document.getElementById('panel2Stake').value = instance.config.dualStake2 || 150;
        document.getElementById('betInterval').value = instance.config.betInterval || 4.8;
        document.getElementById('autoStopTime').value = instance.config.autoStopTime || '';
        document.getElementById('intelligenceStaking').checked = instance.config.intelligenceStakingEnabled || false;
        document.getElementById('intelligenceThreshold').value = instance.config.intelligenceThreshold || 60;
        document.getElementById('freeBetStrategySelect').value = instance.config.freeBetStrategy || 'conservative';
    }

    // Set auto-start config
    if (instance.config.autoStartEnabled) {
        document.getElementById('autoStart').checked = true;
        document.getElementById('autoStartConfigPanel').classList.add('active');
        document.getElementById('autoStartTime').value = instance.config.autoStartTime || '';
        document.getElementById('autoStartUsername').value = instance.config.autoStartUsername || '';
        document.getElementById('autoStartPassword').value = instance.config.autoStartPassword || '';
        document.getElementById('sportpesaChatRefresh').checked = instance.config.sportpesaChatRefreshEnabled || false;
        document.getElementById('chatRefreshInterval').value = instance.config.chatRefreshInterval || 15;
        
        // Set new avatar change config
        document.getElementById('avatarChangeEnabled').checked = instance.config.avatarChangeEnabled || false;
        document.getElementById('avatarChangeInterval').value = instance.config.avatarChangeInterval || '';

        
        if (instance.config.autoStartSite) {
            const siteRadio = document.querySelector(`input[name="autoStartSite"][value="${instance.config.autoStartSite}"]`);
            if (siteRadio) siteRadio.checked = true;
        }
    }

    updateConfigInputsState();

    // Show license as validated
    const licenseStatus = document.getElementById('licenseStatus');
    // Format the expiry date to show only the date part
    const expiryDate = new Date(instance.expiresAt);
    const formattedDate = expiryDate.toLocaleDateString('en-GB');
    const formattedTime = expiryDate.toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false  // Use 24-hour format
    });
    licenseStatus.textContent = `✅ License validated! Expires: ${formattedDate} at ${formattedTime}`;
    licenseStatus.className = 'status success';
    licenseStatus.classList.remove('hidden');

    // Check browser state and update buttons
    try {
        console.log(`🔍 Checking browser state for instance ${instanceId}`);
        const browserState = await window.managerAPI.getBrowserState(instanceId);

        console.log('🔍 Browser state:', browserState);

        if (browserState.success) {
            const launchBrowserBtn = document.getElementById('launchBrowserBtn');
            const startScriptsBtn = document.getElementById('startScriptsBtn');
            const stopScriptsBtn = document.getElementById('stopScriptsBtn');

            if (browserState.scriptsRunning) {
                console.log('✅ Scripts running - showing stop button');
                if (launchBrowserBtn) launchBrowserBtn.classList.add('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.add('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.remove('hidden');
            } else if (browserState.browserRunning) {
                console.log('✅ Browser running - showing start scripts button');
                if (launchBrowserBtn) launchBrowserBtn.classList.add('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.remove('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.add('hidden');
            } else {
                console.log('❌ Browser not running - showing launch browser button');
                if (launchBrowserBtn) launchBrowserBtn.classList.remove('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.add('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error('Browser state check error:', error);
    }


    // Restore any existing error for this instance
    if (instanceErrorStates[instanceId]?.launchError) {
        const errorDiv = document.getElementById('launchError');
        if (errorDiv) {
            errorDiv.textContent = `❌ ${instanceErrorStates[instanceId].launchError}`;
            errorDiv.classList.remove('hidden');
        }
    } else {
        // Hide error if no error for this instance
        const errorDiv = document.getElementById('launchError');
        if (errorDiv) {
            errorDiv.textContent = '';
            errorDiv.classList.add('hidden');
        }
    }

    // Switch pages
    console.log('🔄 Switching pages now...');

    document.getElementById('homePage').classList.remove('active');
    document.getElementById('instancePage').classList.add('active');

    console.log('✅ Instance page should be visible');
}

// Utility functions
function formatDate(dateString) {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
}

function maskLicenseKey(key) {
    if (!key || key.length < 8) return key;
    return key.substring(0, 4) + '...' + key.substring(key.length - 4);
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        const originalText = button.textContent;
        button.innerHTML = '<span class="loading"></span>' + originalText;
        button.dataset.originalText = originalText;
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalText || button.textContent.replace(/^.*(?=\w)/, '');
    }
}

// Toggle config section visibility
function toggleConfigSection(sectionId) {
    const content = document.getElementById(`${sectionId}-content`);
    const icon = document.getElementById(`${sectionId}-icon`);
    
    if (content.classList.contains('active')) {
        content.classList.remove('active');
        icon.textContent = '+';
        icon.classList.remove('expanded');
    } else {
        content.classList.add('active');
        icon.textContent = '−';
        icon.classList.add('expanded');
    }
}

// Make it globally available
window.toggleConfigSection = toggleConfigSection;

// Render instances - NO auto-refresh interference
function renderInstances() {
    console.log('📝 Rendering instances list');

    if (instances.length === 0) {
        instancesList.innerHTML = `<div class="empty-state">No instances created yet.</div>`;
        return;
    }

    instancesList.innerHTML = instances.map(instance => `
        <div class="instance-item" data-id="${instance.id}">
            <div class="instance-info">
                <div class="instance-name">${instance.name}</div>
                <div class="instance-details">
                    License: ${maskLicenseKey(instance.licenseKey)} | 
                    Created: ${formatDate(instance.created)}
                </div>
            </div>
            <div style="display: flex; align-items: center;">
                <span class="instance-status status-${instance.status}">${instance.status.toUpperCase()}</span>
                <div class="instance-actions">
                    <button class="btn btn-primary" onclick="launchInstanceDirect('${instance.id}')">
                        Launch
                    </button>
                    <button class="btn btn-danger" onclick="deleteInstance('${instance.id}')">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Load instances - SIMPLE version
async function loadInstances() {
    try {
        console.log('📥 Loading instances...');
        const newInstances = await window.managerAPI.getInstances();
        instances = newInstances;
        renderInstances();
    } catch (error) {
        console.error('Error loading instances:', error);
    }
}

// Update local instance status without full reload
function updateLocalInstanceStatus(instanceId, status) {
    const instance = instances.find(i => i.id === instanceId);
    if (instance) {
        instance.status = status;
        console.log(`📝 Updated local status for ${instanceId}: ${status}`);
    }
}

// Launch instance - RENAMED to avoid conflicts
async function launchInstanceDirect(instanceId) {
    console.log(`🚀 DIRECT LAUNCH: ${instanceId}`);

    // Update status AFTER showing the page (safer)
    showInstancePage(instanceId);

    // Now update status in background
    setTimeout(async () => {
        const instance = instances.find(i => i.id === instanceId);
        if (instance) {
            instance.status = 'active';
            instance.lastLaunched = new Date().toISOString();

            try {
                await window.managerAPI.updateInstanceStatus(instanceId, 'active');
                console.log(`✅ Status updated for ${instanceId}`);
            } catch (error) {
                console.error('Status update failed:', error);
            }
        }
    }, 100); // Small delay to avoid interfering with navigation

    console.log(`🚀 DIRECT LAUNCH COMPLETED`);
}

// Create new instance
async function createInstance() {
    const instanceName = newInstanceNameInput.value.trim();
    const licenseKey = newLicenseKeyInput.value.trim();

    if (!instanceName) {
        alert('Please enter an instance name');
        return;
    }

    if (!licenseKey) {
        alert('Please enter a license key');
        return;
    }

    setLoading(createInstanceBtn, true);

    try {
        const result = await window.managerAPI.createInstance(licenseKey, instanceName);

        if (result.success) {
            instances.push(result.instance);
            renderInstances();
            newInstanceNameInput.value = '';
            newLicenseKeyInput.value = '';
            alert(`✅ Instance created: ${result.instance.name}`);
        } else {
            alert(`❌ Error: ${result.error}`);
        }

    } catch (error) {
        alert(`❌ Error: ${error.message}`);
    } finally {
        setLoading(createInstanceBtn, false);
    }
}


// Delete instance
async function deleteInstance(instanceId) {
    if (!confirm('Are you sure?')) return;

    try {
        const result = await window.managerAPI.deleteInstance(instanceId);
        if (result.success) {
            instances = instances.filter(i => i.id !== instanceId);
            renderInstances();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}



// Update config inputs based on current instance state
function updateConfigInputsState() {
    if (!currentInstanceId) return;

    const isDisabled = instanceConfigStates[currentInstanceId]?.disabled || false;

    document.getElementById('baseStake').disabled = isDisabled;
    document.getElementById('freeBetInterval').disabled = isDisabled;
    document.getElementById('dualBetting').disabled = isDisabled;
    document.getElementById('startTime').disabled = isDisabled;
    document.getElementById('endTime').disabled = isDisabled;
    document.getElementById('panel1Stake').disabled = isDisabled;
    document.getElementById('panel2Stake').disabled = isDisabled;
    document.getElementById('betInterval').disabled = isDisabled;
    document.getElementById('autoStopTime').disabled = isDisabled;

    // Intelligence Staking fields
    document.getElementById('intelligenceStaking').disabled = isDisabled;
    document.getElementById('intelligenceThreshold').disabled = isDisabled;

    // Auto-start fields
    document.getElementById('autoStart').disabled = isDisabled;
    document.getElementById('autoStartTime').disabled = isDisabled;
    document.getElementById('autoStartUsername').disabled = isDisabled;
    document.getElementById('autoStartPassword').disabled = isDisabled;
    
    // Auto-start site radio buttons
    document.getElementById('siteBetnare').disabled = isDisabled;
    document.getElementById('sportpesa').disabled = isDisabled;

    // SportPesa features
    document.getElementById('sportpesaChatRefresh').disabled = isDisabled;
    document.getElementById('chatRefreshInterval').disabled = isDisabled;
    document.getElementById('avatarChangeEnabled').disabled = isDisabled;
    document.getElementById('avatarChangeInterval').disabled = isDisabled;

    // Free bet strategy
    document.getElementById('freeBetStrategySelect').disabled = isDisabled;
}

// Instance page event listeners
function setupInstancePageListeners() {
    console.log('🔧 Setting up instance page listeners');

    // Dual betting toggle
    const dualBetting = document.getElementById('dualBetting');
    if (dualBetting) {
        dualBetting.addEventListener('change', (e) => {
            const dualConfig = document.getElementById('dualConfig');
            if (e.target.checked) {
                dualConfig.classList.add('active');
            } else {
                dualConfig.classList.remove('active');
            }
        });
    }

    // Auto-start toggle
    const autoStart = document.getElementById('autoStart');
    if (autoStart) {
        autoStart.addEventListener('change', (e) => {
            const autoStartConfig = document.getElementById('autoStartConfigPanel');
            if (e.target.checked) {
                autoStartConfig.classList.add('active');
            } else {
                autoStartConfig.classList.remove('active');
            }
        });
    }


    // Toggle password visibility
    function togglePasswordVisibility() {
        const passwordInput = document.getElementById('autoStartPassword');
        const eyeIcon = document.querySelector('.password-eye-icon');

        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            eyeIcon.textContent = '🙈'; // Hide icon
        } else {
            passwordInput.type = 'password';
            eyeIcon.textContent = '👁️'; // Show icon
        }
    }

    // Make it globally available
    window.togglePasswordVisibility = togglePasswordVisibility;

    // Save ALL config (auto-start + betting config) function  
    function setupAutoStartAutoSave() {
        // ALL config fields that should auto-save
        // ALL config fields that should auto-save
        const allConfigFields = [
            // Auto-start fields
            'autoStartTime',
            'autoStartUsername',
            'chatRefreshInterval',
            'autoStartPassword',
            'avatarChangeInterval', 

            // Main betting config fields
            'baseStake',
            'betInterval',
            'freeBetInterval',
            'autoStopTime',
            'startTime',      // dual start time
            'endTime',        // dual end time
            'panel1Stake',    // dualStake1
            'panel2Stake',    // dualStake2
            'intelligenceThreshold',  // Intelligence Staking threshold
            'freeBetStrategySelect'
        ];

        allConfigFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', saveAllConfig);
                field.addEventListener('blur', saveAllConfig);
                console.log(`🔧 Added auto-save listener to ${fieldId}`);
            }
        });

        // Checkbox fields (different event handling)
        const checkboxFields = [
            'autoStart',      // auto-start enabled
            'dualBetting',    // dual betting enabled
            'intelligenceStaking',  // Intelligence Staking enabled
            'sportpesaChatRefresh',
            'avatarChangeEnabled'
        ];

        checkboxFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('change', saveAllConfig);
                console.log(`🔧 Added auto-save listener to checkbox ${fieldId}`);
            }
        });

        // Site radio buttons
        const siteRadios = document.querySelectorAll('input[name="autoStartSite"]');
        siteRadios.forEach(radio => {
            radio.addEventListener('change', saveAllConfig);
        });

        console.log('✅ Auto-save listeners added to all config fields');
    }

    // Setup Free Bet Strategy preview
    function setupFreeBetStrategyPreview() {
        const previewBtn = document.getElementById('previewStrategyBtn');
        const strategySelect = document.getElementById('freeBetStrategySelect');
        const previewDiv = document.getElementById('strategyPreview');
        const previewContent = document.getElementById('previewContent');
        
        if (previewBtn && strategySelect) {
            // Auto-update on strategy change
            strategySelect.addEventListener('change', () => {
                const selectedStrategy = strategySelect.value;
                showStrategyPreview(selectedStrategy, previewDiv, previewContent);
                saveAllConfig(); // Keep the auto-save
            });
            
            // Manual preview button (optional - you can remove this if you want)
            previewBtn.addEventListener('click', () => {
                const selectedStrategy = strategySelect.value;
                showStrategyPreview(selectedStrategy, previewDiv, previewContent);
            });
            
            // Show initial preview with current strategy
            if (strategySelect.value) {
                showStrategyPreview(strategySelect.value, previewDiv, previewContent);
            }
        }
    }

    function showStrategyPreview(strategy, previewDiv, previewContent) {
        const strategies = {
            conservative: {
                5: [6.0, 8.0, 10.0],
                10: [4.0, 6.0, 8.0],
                20: [4.0, 5.0, 6.0],
                30: [3.5, 4.0, 5.0],
                50: [3.0, 4.5, 6.0],
                100: [2.0, 3.0, 3.5],
                200: [2.0, 2.5, 3.0],
                500: [1.8, 2.0, 2.5]
            },
            aggressive: {
                5: [15.0, 20.0, 25.0],
                10: [12.0, 15.0, 20.0],
                20: [10.0, 12.0, 15.0],
                30: [8.0, 10.0, 12.0],
                50: [6.0, 8.0, 10.0],
                100: [5.0, 6.0, 8.0],
                200: [4.0, 5.0, 6.0],
                500: [3.0, 4.0, 5.0]
            },
            balanced: {
                5: [10.0, 10.0, 50.0],
                10: [10.0, 10.0, 20.0],
                20: [5.0, 10.0, 20.0],
                30: [5.0, 10.0, 15.0],
                50: [3.0, 5.0, 10.0],
                100: [3.0, 5.0, 10.0],
                200: [2.0, 3.5, 5.0],
                500: [3.0, 5.0, 10.0]
            },
            dynamic: {
                5: [8.0, 12.0, 15.0],
                10: [7.0, 10.0, 12.0],
                20: [5.0, 7.0, 10.0],
                30: [4.0, 6.0, 8.0],
                50: [3.0, 4.0, 5.0],
                100: [2.5, 3.0, 4.0],
                200: [2.0, 2.5, 3.0],
                500: [1.5, 2.0, 2.5]
            },
            reserved: {
                5: [3.0, 4.0, 5.0],
                10: [2.5, 3.0, 4.0],
                20: [2.0, 3.5, 4.0],
                30: [2.0, 3.0, 4.5],
                50: [2.0, 3.0, 5.0],
                100: [2.0, 2.5, 3.0],
                200: [1.2, 1.3, 1.5],
                500: [1.9, 2.2, 3.3]
            }
        };
        
        const selectedStrategy = strategies[strategy];
        
        let tableHtml = `
            <table class="strategy-preview-table">
                <thead>
                    <tr>
                        <th>Free Bet Amount</th>
                        <th>1st Use</th>
                        <th>2nd Use</th>
                        <th>3rd Use</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        Object.keys(selectedStrategy).forEach(amount => {
            const multipliers = selectedStrategy[amount];
            tableHtml += `
                <tr>
                    <td>${amount} KES</td>
                    <td>${multipliers[0]}x</td>
                    <td>${multipliers[1]}x</td>
                    <td>${multipliers[2]}x</td>
                </tr>
            `;
        });
        
        tableHtml += `
                </tbody>
            </table>
        `;
        
        previewContent.innerHTML = tableHtml;
        previewDiv.classList.remove('hidden');
    }

    // Save ALL config function (auto-start + betting config)
    async function saveAllConfig() {
        if (!currentInstanceId) return;

        try {
            // Collect ALL configuration values
            // Collect ALL configuration values
            const allConfig = {
                // Main betting config
                baseStake: parseInt(document.getElementById('baseStake')?.value || 100),
                betInterval: parseFloat(document.getElementById('betInterval')?.value || 4.8),
                freeBetInterval: parseInt(document.getElementById('freeBetInterval')?.value || 10),
                autoStopTime: document.getElementById('autoStopTime')?.value?.trim() || '',
                dualBettingEnabled: document.getElementById('dualBetting')?.checked || false,
                dualStartTime: document.getElementById('startTime')?.value?.trim() || '16:00',
                dualEndTime: document.getElementById('endTime')?.value?.trim() || '02:00',
                dualStake1: parseInt(document.getElementById('panel1Stake')?.value || 150),
                dualStake2: parseInt(document.getElementById('panel2Stake')?.value || 150),

                // Free Bet Strategy config
                freeBetStrategy: document.getElementById('freeBetStrategySelect')?.value || 'conservative',
                

                // Intelligence Staking config
                intelligenceStakingEnabled: document.getElementById('intelligenceStaking')?.checked || false,
                intelligenceThreshold: parseInt(document.getElementById('intelligenceThreshold')?.value || 60),

                // Auto-start config
                autoStartEnabled: document.getElementById('autoStart')?.checked || false,
                autoStartTime: document.getElementById('autoStartTime')?.value?.trim() || '',
                autoStartSite: document.querySelector('input[name="autoStartSite"]:checked')?.value || '',
                autoStartUsername: document.getElementById('autoStartUsername')?.value?.trim() || '',
                autoStartPassword: document.getElementById('autoStartPassword')?.value?.trim() || '',
                sportpesaChatRefreshEnabled: document.getElementById('sportpesaChatRefresh')?.checked || false,
                chatRefreshInterval: parseInt(document.getElementById('chatRefreshInterval')?.value || 15),
                avatarChangeEnabled: document.getElementById('avatarChangeEnabled')?.checked || false, 
                avatarChangeInterval: parseInt(document.getElementById('avatarChangeInterval')?.value || 0),  
            };

            console.log('💾 Auto-saving ALL config:', allConfig);

            // Save via IPC
            const result = await window.managerAPI.saveAllConfig(currentInstanceId, allConfig);
            if (result.success) {
                console.log('✅ All config auto-saved successfully');
            } else {
                console.error('❌ Failed to auto-save config:', result.error);
            }
        } catch (error) {
            console.error('❌ Error auto-saving config:', error);
        }
    }

    // Browser control buttons
    const launchBrowserBtn = document.getElementById('launchBrowserBtn');
    if (launchBrowserBtn) {
        launchBrowserBtn.addEventListener('click', async () => {
            if (!currentInstanceId) {
                return;
            }

            console.log(`🌐 Launching browser for ${currentInstanceId}`);
            launchBrowserBtn.disabled = true;
            launchBrowserBtn.innerHTML = '<span class="loading"></span>Opening Browser...';

            try {
                const result = await window.managerAPI.launchBrowser(currentInstanceId);
                if (result.success) {
                    // Success - update buttons
                    launchBrowserBtn.classList.add('hidden');
                    document.getElementById('startScriptsBtn').classList.remove('hidden');
                    document.getElementById('stopScriptsBtn').classList.add('hidden');
                    await window.managerAPI.updateInstanceStatus(currentInstanceId, 'running');
                    updateLocalInstanceStatus(currentInstanceId, 'running');
                    hideLaunchError(); // clear old errors
                } else {
                    showLaunchError(result.error || 'Failed to launch browser');
                }
            } catch (error) {
                showLaunchError(error.message || 'Unexpected error occurred');
            }
            finally {
                launchBrowserBtn.disabled = false;
                launchBrowserBtn.innerHTML = 'Open Browser';
            }
        });
    }

    // Start Scripts button
    const startScriptsBtn = document.getElementById('startScriptsBtn');
    if (startScriptsBtn) {
        startScriptsBtn.addEventListener('click', async () => {
            if (!currentInstanceId) {
                return;
            }

            console.log(`🚀 Starting scripts for ${currentInstanceId}`);
            startScriptsBtn.disabled = true;
            startScriptsBtn.innerHTML = '<span class="loading"></span>Starting System...';

            const config = {
                baseStake: parseInt(document.getElementById('baseStake').value),
                betInterval: parseFloat(document.getElementById('betInterval').value),
                freeBetInterval: parseInt(document.getElementById('freeBetInterval').value),
                autoStopTime: document.getElementById('autoStopTime').value.trim(),
                dualBettingEnabled: document.getElementById('dualBetting').checked,
                dualStartTime: document.getElementById('startTime').value.trim(),
                dualEndTime: document.getElementById('endTime').value.trim(),
                dualStake1: parseInt(document.getElementById('panel1Stake').value),
                dualStake2: parseInt(document.getElementById('panel2Stake').value),

                // Free Bet Strategy config
                freeBetStrategy: document.getElementById('freeBetStrategySelect').value || 'conservative',

                // Intelligence Staking config
                intelligenceStakingEnabled: document.getElementById('intelligenceStaking').checked,
                intelligenceThreshold: parseInt(document.getElementById('intelligenceThreshold').value),

                // Add auto-start config
                autoStartEnabled: document.getElementById('autoStart').checked,
                autoStartTime: document.getElementById('autoStartTime').value.trim(),
                autoStartSite: document.querySelector('input[name="autoStartSite"]:checked')?.value || '',
                autoStartUsername: document.getElementById('autoStartUsername').value.trim(),
                autoStartPassword: document.getElementById('autoStartPassword').value.trim(),

                // SportPesa specific features
                sportpesaChatRefreshEnabled: document.getElementById('sportpesaChatRefresh').checked,
                chatRefreshInterval: parseInt(document.getElementById('chatRefreshInterval').value) || 15,
                avatarChangeEnabled: document.getElementById('avatarChangeEnabled').checked,
                avatarChangeInterval: parseInt(document.getElementById('avatarChangeInterval').value) || 0
            };

            try {
                const result = await window.managerAPI.startScripts(config, currentInstanceId);
                if (result.success) {
                    // Update buttons immediately - no alerts
                    startScriptsBtn.classList.add('hidden');
                    document.getElementById('stopScriptsBtn').classList.remove('hidden');
                    document.getElementById('launchBrowserBtn').classList.add('hidden');

                    updateLocalInstanceStatus(currentInstanceId, 'running');

                    // Mark this instance's config as disabled
                    instanceConfigStates[currentInstanceId] = { disabled: true };
                    updateConfigInputsState();
                }
            } catch (error) {
                console.error('Start scripts error:', error);
            } finally {
                startScriptsBtn.disabled = false;
                startScriptsBtn.innerHTML = 'Start System';
            }
        });
    }

    // Stop Scripts button - SIMPLE version
    const stopScriptsBtn = document.getElementById('stopScriptsBtn');
    if (stopScriptsBtn) {
        stopScriptsBtn.addEventListener('click', async () => {
            if (!currentInstanceId) {
                return;
            }

            console.log(`🛑 Stopping scripts for ${currentInstanceId}`);
            stopScriptsBtn.disabled = true;
            stopScriptsBtn.innerHTML = '<span class="loading"></span>Stopping System...';

            try {
                const result = await window.managerAPI.stopScripts(currentInstanceId);
                if (result.success) {
                    // Update buttons immediately - no alerts
                    stopScriptsBtn.classList.add('hidden');
                    document.getElementById('launchBrowserBtn').classList.remove('hidden');
                    document.getElementById('startScriptsBtn').classList.add('hidden');

                    // Update status to stopped
                    await window.managerAPI.updateInstanceStatus(currentInstanceId, 'stopped');
                    updateLocalInstanceStatus(currentInstanceId, 'stopped');

                    // Mark this instance's config as enabled
                    instanceConfigStates[currentInstanceId] = { disabled: false };
                    updateConfigInputsState();
                }
            } catch (error) {
                console.error('Stop scripts error:', error);
            } finally {
                stopScriptsBtn.disabled = false;
                stopScriptsBtn.innerHTML = 'Stop System';
            }
        });
    }

    setupAutoStartAutoSave();
    setupFreeBetStrategyPreview();
}

// Event listeners
createInstanceBtn.addEventListener('click', createInstance);

// Make functions global
window.launchInstanceDirect = launchInstanceDirect;
window.deleteInstance = deleteInstance;
window.showHomePage = showHomePage;
window.showInstancePage = showInstancePage;
window.refreshStatus = refreshStatus;

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 DOM ready - initializing...');
    setupInstancePageListeners();
    loadInstances();
});

// Listen for status changes from backend and handle them safely
window.managerAPI.onStatusChanged(() => {
    console.log('📡 Backend sent status change event - ignoring for now');
    // Don't refresh or navigate - just acknowledge the event
});

// Listen for auto-action completions from backend
window.managerAPI.onAutoActionCompleted((event, data) => {
    console.log('📡 Auto-action completed event received:', data);

    const { instanceId, action, newButtonState } = data;

    // ALWAYS update config state (not just for current instance)
    if (action === 'stop' || action === 'revoked-shutdown') {
        instanceConfigStates[instanceId] = { disabled: false };
        updateLocalInstanceStatus(instanceId, action === 'revoked-shutdown' ? 'revoked' : 'stopped');
        console.log(`🔓 Unlocked config inputs for instance ${instanceId} (${action})`);
    } else if (action === 'start') {
        instanceConfigStates[instanceId] = { disabled: true };
        updateLocalInstanceStatus(instanceId, 'running');
        console.log(`🔒 Locked config inputs for instance ${instanceId}`);
    }

    // Only update UI if we're currently viewing this instance
    if (currentInstanceId === instanceId) {
        console.log(`🔄 Updating UI for current instance ${instanceId} after auto-${action}`);
        updateButtonsAfterAutoAction(newButtonState);
        updateConfigInputsState();
    }

    // Update instances list if we're on home page
    const isOnHomePage = document.getElementById('homePage').classList.contains('active');
    if (isOnHomePage) {
        console.log('🔄 Refreshing instances list after auto-action');
        loadInstances();
    }
});

// Safe auto-refresh - only for home page, very conservative  
let safeRefreshInterval = null;

function startSafeRefresh() {
    if (safeRefreshInterval) return; // Already running

    safeRefreshInterval = setInterval(async () => {
        // Always refresh if on home page, regardless of focus
        const isOnHomePage = document.getElementById('homePage').classList.contains('active');

        if (!isOnHomePage) {
            return; // Skip refresh
        }

        try {
            console.log('🔄 Safe refresh - updating instances');
            const oldInstances = [...instances];
            const newInstances = await window.managerAPI.getInstances();

            // Only update if something actually changed
            const hasChanges = JSON.stringify(newInstances) !== JSON.stringify(oldInstances);
            if (hasChanges) {
                instances = newInstances;
                renderInstances();
                console.log('✅ Safe refresh completed - found changes');
            }
        } catch (error) {
            console.error('Safe refresh error:', error);
        }
    }, 10000); // Every 10 seconds
}

function stopSafeRefresh() {
    if (safeRefreshInterval) {
        clearInterval(safeRefreshInterval);
        safeRefreshInterval = null;
    }
}

// Start safe refresh
startSafeRefresh();

// Stop refresh when window loses focus, restart when it gains focus
window.addEventListener('blur', stopSafeRefresh);
window.addEventListener('focus', startSafeRefresh);


// Update buttons after auto-action (auto-start or auto-stop)
function updateButtonsAfterAutoAction(newButtonState) {
    const launchBrowserBtn = document.getElementById('launchBrowserBtn');
    const startScriptsBtn = document.getElementById('startScriptsBtn');
    const stopScriptsBtn = document.getElementById('stopScriptsBtn');

    // Hide all buttons first
    if (launchBrowserBtn) launchBrowserBtn.classList.add('hidden');
    if (startScriptsBtn) startScriptsBtn.classList.add('hidden');
    if (stopScriptsBtn) stopScriptsBtn.classList.add('hidden');

    // Show the appropriate button
    switch (newButtonState) {
        case 'launch-browser':
            if (launchBrowserBtn) launchBrowserBtn.classList.remove('hidden');
            console.log('✅ UI updated: showing Launch Browser button');
            break;
        case 'start-scripts':
            if (startScriptsBtn) startScriptsBtn.classList.remove('hidden');
            console.log('✅ UI updated: showing Start Scripts button');
            break;
        case 'stop-scripts':
            if (stopScriptsBtn) stopScriptsBtn.classList.remove('hidden');
            console.log('✅ UI updated: showing Stop Scripts button');
            break;
        default:
            console.warn('Unknown button state:', newButtonState);
    }
}

// Function to refresh current instance page state
async function refreshInstancePageState() {
    if (!currentInstanceId) return;

    try {
        console.log(`🔄 Refreshing instance page state for ${currentInstanceId}`);
        const browserState = await window.managerAPI.getBrowserState(currentInstanceId);

        if (browserState.success) {
            const launchBrowserBtn = document.getElementById('launchBrowserBtn');
            const startScriptsBtn = document.getElementById('startScriptsBtn');
            const stopScriptsBtn = document.getElementById('stopScriptsBtn');

            if (browserState.scriptsRunning) {
                if (launchBrowserBtn) launchBrowserBtn.classList.add('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.add('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.remove('hidden');
            } else if (browserState.browserRunning) {
                if (launchBrowserBtn) launchBrowserBtn.classList.add('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.remove('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.add('hidden');
            } else {
                if (launchBrowserBtn) launchBrowserBtn.classList.remove('hidden');
                if (startScriptsBtn) startScriptsBtn.classList.add('hidden');
                if (stopScriptsBtn) stopScriptsBtn.classList.add('hidden');
            }

            console.log('✅ Instance page state refreshed');
        }
    } catch (error) {
        console.error('Instance page state refresh error:', error);
    }
}

// Make it global so we can call it manually
window.refreshInstancePageState = refreshInstancePageState;

function showLaunchError(message) {
    if (!currentInstanceId) return;

    // Clear any existing timeout for this instance
    if (instanceErrorStates[currentInstanceId]?.timeout) {
        clearTimeout(instanceErrorStates[currentInstanceId].timeout);
    }

    // Store the error for this instance
    instanceErrorStates[currentInstanceId] = {
        launchError: message,
        timeout: setTimeout(() => {
            hideLaunchError();
        }, 4000) // Auto-hide after 4 seconds
    };

    // Show the error immediately
    const errorDiv = document.getElementById('launchError');
    if (errorDiv) {
        errorDiv.textContent = `❌ ${message}`;
        errorDiv.classList.remove('hidden');
    }
}

function hideLaunchError() {
    if (!currentInstanceId) return;

    // Clear the timeout if it exists
    if (instanceErrorStates[currentInstanceId]?.timeout) {
        clearTimeout(instanceErrorStates[currentInstanceId].timeout);
    }

    // Clear the error state for this instance
    delete instanceErrorStates[currentInstanceId];

    // Hide the error in UI
    const errorDiv = document.getElementById('launchError');
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.add('hidden');
    }
}


// Refresh status function
function refreshStatus() {
    const refreshBtn = document.querySelector('button[onclick="refreshStatus()"]');

    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<span class="loading"></span>Refresh Status';
    }

    loadInstances()
        .then(() => {
            if (refreshBtn) {
                refreshBtn.innerHTML = '✅ Refreshed';
                setTimeout(() => {
                    refreshBtn.innerHTML = 'Refresh Status';
                    refreshBtn.disabled = false;
                }, 1000);
            }
        })
        .catch((error) => {
            console.error('Refresh failed:', error);
            if (refreshBtn) {
                refreshBtn.innerHTML = '❌ Failed';
                setTimeout(() => {
                    refreshBtn.innerHTML = 'Refresh Status';
                    refreshBtn.disabled = false;
                }, 2000);
            }
        });
}

console.log("✅ MINIMAL MANAGER-RENDERER LOADED");