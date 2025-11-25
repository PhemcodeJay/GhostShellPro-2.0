// DOM elements
const licenseKeyInput = document.getElementById('licenseKey');
const validateBtn = document.getElementById('validateBtn');
const licenseStatus = document.getElementById('licenseStatus');
const licenseError = document.getElementById('licenseError');
const licenseSection = document.getElementById('licenseSection');
const configSection = document.getElementById('configSection');
const controlSection = document.getElementById('controlSection');
const controlStatus = document.getElementById('controlStatus');

// Configuration elements
const baseStakeInput = document.getElementById('baseStake');
const dualBettingCheckbox = document.getElementById('dualBetting');
const dualConfig = document.getElementById('dualConfig');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const startTimeError = document.getElementById('startTimeError');
const endTimeError = document.getElementById('endTimeError');
const panel1StakeInput = document.getElementById('panel1Stake');
const panel2StakeInput = document.getElementById('panel2Stake');

// Control elements
const launchBrowserBtn = document.getElementById('launchBrowserBtn');
const startScriptsBtn = document.getElementById('startScriptsBtn');
const stopScriptsBtn = document.getElementById('stopScriptsBtn');

// State
let isLicenseValid = false;
let isBrowserLaunched = false;
let areScriptsRunning = false;


// Settings persistence
const SETTINGS_KEY = 'GhostShell_bot_settings';

function saveSettings() {
    const settings = {
        baseStake: baseStakeInput.value,
        dualBettingEnabled: dualBettingCheckbox.checked,
        dualStartTime: startTimeInput.value,
        dualEndTime: endTimeInput.value,
        dualStake1: panel1StakeInput.value,
        dualStake2: panel2StakeInput.value
    };
    
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log('Settings saved:', settings);
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const settings = JSON.parse(saved);
            
            // Restore form values
            baseStakeInput.value = settings.baseStake || '100';
            dualBettingCheckbox.checked = settings.dualBettingEnabled || false;
            startTimeInput.value = settings.dualStartTime || '16:00';
            endTimeInput.value = settings.dualEndTime || '02:00';
            panel1StakeInput.value = settings.dualStake1 || '150';
            panel2StakeInput.value = settings.dualStake2 || '150';
            
            // Show/hide dual config based on checkbox
            if (dualBettingCheckbox.checked) {
                dualConfig.classList.add('active');
            } else {
                dualConfig.classList.remove('active');
            }
            
            console.log('Settings loaded:', settings);
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Time validation regex (HH:MM format, 24-hour)
const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

// Utility functions
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `status ${type}`;
    element.classList.remove('hidden');
}

function hideStatus(element) {
    element.classList.add('hidden');
}

function showError(element, message) {
    element.textContent = message;
    element.classList.remove('hidden');
}

function hideError(element) {
    element.classList.add('hidden');
}

function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = '<span class="loading"></span>' + button.textContent;
    } else {
        button.disabled = false;
        button.innerHTML = button.textContent.replace(/^.*?(?=\w)/, '');
    }
}

function validateTimeFormat(timeString) {
    if (!timeRegex.test(timeString)) {
        return false;
    }
    
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function validateConfiguration() {
    let isValid = true;
    
    // Clear previous errors
    hideError(startTimeError);
    hideError(endTimeError);
    
    // Validate base stake
    const baseStake = parseInt(baseStakeInput.value);
    if (!baseStake || baseStake < 1) {
        baseStakeInput.focus();
        return false;
    }
    
    // If dual betting is enabled, validate dual settings
    if (dualBettingCheckbox.checked) {
        // Validate start time
        const startTime = startTimeInput.value.trim();
        if (!validateTimeFormat(startTime)) {
            showError(startTimeError, 'Invalid time format. Use HH:MM (24-hour format)');
            startTimeInput.focus();
            isValid = false;
        }
        
        // Validate end time
        const endTime = endTimeInput.value.trim();
        if (!validateTimeFormat(endTime)) {
            showError(endTimeError, 'Invalid time format. Use HH:MM (24-hour format)');
            if (isValid) endTimeInput.focus(); // Only focus if start time is valid
            isValid = false;
        }
        
        // Validate panel stakes
        const panel1Stake = parseInt(panel1StakeInput.value);
        const panel2Stake = parseInt(panel2StakeInput.value);
        
        if (!panel1Stake || panel1Stake < 1) {
            if (isValid) panel1StakeInput.focus();
            isValid = false;
        }
        
        if (!panel2Stake || panel2Stake < 1) {
            if (isValid) panel2StakeInput.focus();
            isValid = false;
        }
    }
    
    return isValid;
}

function getConfiguration() {
    return {
        baseStake: parseInt(baseStakeInput.value),
        dualBettingEnabled: dualBettingCheckbox.checked,
        dualStartTime: startTimeInput.value.trim(),
        dualEndTime: endTimeInput.value.trim(),
        dualStake1: parseInt(panel1StakeInput.value),
        dualStake2: parseInt(panel2StakeInput.value)
    };
}

// Event listeners
dualBettingCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        dualConfig.classList.add('active');
    } else {
        dualConfig.classList.remove('active');
        hideError(startTimeError);
        hideError(endTimeError);
    }
    saveSettings(); // Auto-save when dual betting is toggled
});

// Real-time time validation
startTimeInput.addEventListener('blur', () => {
    if (dualBettingCheckbox.checked && startTimeInput.value.trim()) {
        if (!validateTimeFormat(startTimeInput.value.trim())) {
            showError(startTimeError, 'Invalid time format. Use HH:MM (24-hour format)');
        } else {
            hideError(startTimeError);
        }
    }
});

endTimeInput.addEventListener('blur', () => {
    if (dualBettingCheckbox.checked && endTimeInput.value.trim()) {
        if (!validateTimeFormat(endTimeInput.value.trim())) {
            showError(endTimeError, 'Invalid time format. Use HH:MM (24-hour format)');
        } else {
            hideError(endTimeError);
        }
    }
});


// Auto-save settings when values change
baseStakeInput.addEventListener('input', saveSettings);
dualBettingCheckbox.addEventListener('change', saveSettings);
startTimeInput.addEventListener('input', saveSettings);
endTimeInput.addEventListener('input', saveSettings);
panel1StakeInput.addEventListener('input', saveSettings);
panel2StakeInput.addEventListener('input', saveSettings);

// License validation
validateBtn.addEventListener('click', async () => {
    const licenseKey = licenseKeyInput.value.trim();
    
    if (!licenseKey) {
        showError(licenseError, 'Please enter a license key');
        licenseKeyInput.focus();
        return;
    }
    
    hideError(licenseError);
    hideStatus(licenseStatus);
    setLoading(validateBtn, true);
    
    try {
        const result = await window.electronAPI.validateLicense(licenseKey);
        
        if (result.success) {
            isLicenseValid = true;
            showStatus(licenseStatus, `✅ License validated successfully! Expires: ${result.data.expires_at}`, 'success');
            
            // Show configuration section
            configSection.classList.remove('hidden');
            controlSection.classList.remove('hidden');
            
            // Disable license input
            licenseKeyInput.disabled = true;
            validateBtn.disabled = true;
            validateBtn.textContent = '✅ Validated';
            
        } else {
            isLicenseValid = false;
            showStatus(licenseStatus, `❌ ${result.error}`, 'error');
        }
        
    } catch (error) {
        isLicenseValid = false;
        showStatus(licenseStatus, `❌ Connection error: ${error.message}`, 'error');
    } finally {
        setLoading(validateBtn, false);
    }
});

// Browser launch
launchBrowserBtn.addEventListener('click', async () => {
    if (!isLicenseValid) {
        showStatus(controlStatus, '❌ Please validate your license first', 'error');
        return;
    }
    
    hideStatus(controlStatus);
    setLoading(launchBrowserBtn, true);
    
    try {
        const result = await window.electronAPI.launchBrowser();
        
        if (result.success) {
            isBrowserLaunched = true;
            showStatus(controlStatus, '✅ Browser opened! Please navigate to your Aviator game site and login, then click Start Scripts.', 'success');
            
            launchBrowserBtn.classList.add('hidden');
            startScriptsBtn.classList.remove('hidden');
            
        } else {
            showStatus(controlStatus, `❌ ${result.error}`, 'error');
        }
        
    } catch (error) {
        showStatus(controlStatus, `❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(launchBrowserBtn, false);
    }
});

// Start scripts
startScriptsBtn.addEventListener('click', async () => {
    if (!isLicenseValid || !isBrowserLaunched) {
        showStatus(controlStatus, '❌ Please launch browser first', 'error');
        return;
    }
    
    // Validate configuration
    if (!validateConfiguration()) {
        showStatus(controlStatus, '❌ Please fix configuration errors before starting', 'error');
        return;
    }
    
    hideStatus(controlStatus);
    setLoading(startScriptsBtn, true);
    
    try {
        const config = getConfiguration();
        const result = await window.electronAPI.startScripts(config);
        
        if (result.success) {
            areScriptsRunning = true;
            showStatus(controlStatus, '✅ Bot scripts started successfully! Monitor the browser for activity.', 'success');
            
            startScriptsBtn.classList.add('hidden');
            stopScriptsBtn.classList.remove('hidden');
            
            // Disable configuration while scripts are running
            baseStakeInput.disabled = true;
            dualBettingCheckbox.disabled = true;
            startTimeInput.disabled = true;
            endTimeInput.disabled = true;
            panel1StakeInput.disabled = true;
            panel2StakeInput.disabled = true;
            
        } else {
            showStatus(controlStatus, `❌ ${result.error}`, 'error');
        }
        
    } catch (error) {
        showStatus(controlStatus, `❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(startScriptsBtn, false);
    }
});

// Stop scripts
stopScriptsBtn.addEventListener('click', async () => {
    hideStatus(controlStatus);
    setLoading(stopScriptsBtn, true);
    
    try {
        const result = await window.electronAPI.stopScripts();
        
        if (result.success) {
            areScriptsRunning = false;
            showStatus(controlStatus, '✅ Bot scripts stopped successfully.', 'info');
            
            stopScriptsBtn.classList.add('hidden');
            startScriptsBtn.classList.remove('hidden');
            
            // Re-enable configuration
            baseStakeInput.disabled = false;
            dualBettingCheckbox.disabled = false;
            startTimeInput.disabled = false;
            endTimeInput.disabled = false;
            panel1StakeInput.disabled = false;
            panel2StakeInput.disabled = false;
            
        } else {
            showStatus(controlStatus, `❌ ${result.error}`, 'error');
        }
        
    } catch (error) {
        showStatus(controlStatus, `❌ Error: ${error.message}`, 'error');
    } finally {
        setLoading(stopScriptsBtn, false);
    }
});


// Load saved settings when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

// Also load immediately if DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSettings);
} else {
    loadSettings();
}