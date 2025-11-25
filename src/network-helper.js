const os = require('os');
const { exec } = require('child_process');

async function refreshNetwork() {
    const platform = os.platform();
    let getCurrentNetworkCmd, disconnectCmd, reconnectCmd;
    let currentNetwork = null;

    try {
        if (platform === 'win32') {
            getCurrentNetworkCmd = 'netsh wlan show interfaces';

            const getCurrentNetwork = () => new Promise((resolve, reject) => {
                exec(getCurrentNetworkCmd, (err, stdout) => {
                    if (err) return reject(err);
                    let match = stdout.match(/Profile\s*:\s*(.+)/);
                    if (match) {
                        resolve(match[1].trim());
                    } else {
                        match = stdout.match(/SSID\s*:\s*(.+)/);
                        if (match) {
                            resolve(match[1].trim());
                        } else {
                            reject(new Error('No WiFi network found'));
                        }
                    }
                });
            });

            try {
                currentNetwork = await getCurrentNetwork();
                disconnectCmd = 'netsh wlan disconnect';
                reconnectCmd = `netsh wlan connect name="${currentNetwork}"`;
            } catch (err) {
                const adapterName = "Ethernet";
                disconnectCmd = `netsh interface set interface "${adapterName}" admin=DISABLED`;
                reconnectCmd = `netsh interface set interface "${adapterName}" admin=ENABLED`;
            }

        } else if (platform === 'darwin') {
            // First, find the correct WiFi interface
            const findWifiInterface = () => new Promise((resolve, reject) => {
                exec('networksetup -listallhardwareports', (err, stdout) => {
                    if (err) return reject(err);

                    // Look for Wi-Fi hardware port and get its device name
                    const lines = stdout.split('\n');
                    let deviceName = null;

                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('Hardware Port: Wi-Fi')) {
                            // Next line should contain the device
                            if (lines[i + 1] && lines[i + 1].includes('Device: ')) {
                                deviceName = lines[i + 1].split('Device: ')[1].trim();
                                break;
                            }
                        }
                    }

                    if (deviceName) {
                        resolve(deviceName); // Usually 'en0' on most Macs
                    } else {
                        reject(new Error('No Wi-Fi interface found'));
                    }
                });
            });

            try {
                const wifiDevice = await findWifiInterface();
                getCurrentNetworkCmd = `networksetup -getairportnetwork ${wifiDevice}`;

                const getCurrentNetwork = () => new Promise((resolve, reject) => {
                    exec(getCurrentNetworkCmd, (err, stdout) => {
                        if (err) return reject(err);
                        const match = stdout.match(/Current Wi-Fi Network: (.+)/);
                        if (match) {
                            resolve(match[1].trim());
                        } else {
                            reject(new Error('No WiFi network found'));
                        }
                    });
                });

                currentNetwork = await getCurrentNetwork();
                disconnectCmd = `networksetup -setairportpower ${wifiDevice} off`;
                reconnectCmd = `networksetup -setairportpower ${wifiDevice} on`;

                if (!currentNetwork) {
                    disconnectCmd = 'networksetup -setnetworkserviceenabled "Ethernet" off';
                    reconnectCmd = 'networksetup -setnetworkserviceenabled "Ethernet" on';
                }
            } catch (err) {
                // Fallback to ethernet if WiFi detection fails
                disconnectCmd = 'networksetup -setnetworkserviceenabled "Ethernet" off';
                reconnectCmd = 'networksetup -setnetworkserviceenabled "Ethernet" on';
            }
        } else {
            throw new Error('Unsupported platform');
        }

        console.log(`Network Helper: Current network: ${currentNetwork}`);

        // Execute disconnect
        await new Promise((resolve, reject) => {
            console.log('🔌 Disconnecting network...');
            exec(disconnectCmd, (err) => {
                if (err) return reject(err);
                console.log('✅ Network disconnected');
                resolve();
            });
        });

        // Wait 5 seconds before reconnect
        console.log('⏳ Waiting 5 seconds before reconnect...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Execute reconnect
        await new Promise((resolve, reject) => {
            console.log('🔗 Reconnecting network...');
            exec(reconnectCmd, (err) => {
                if (err) return reject(err);
                console.log('✅ Network reconnected');
                resolve();
            });
        });

        return { success: true, network: currentNetwork };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Service mode - start HTTP server
if (require.main === module) {
    const http = require('http');

    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/refresh') {
            try {
                const result = await refreshNetwork();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Unknown endpoint' }));
        }
    });

    const PORT = 53700;
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`Network Helper Service listening on http://127.0.0.1:${PORT}`);
    });
}

module.exports = { refreshNetwork };