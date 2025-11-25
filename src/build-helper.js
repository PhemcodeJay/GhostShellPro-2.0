const { execSync } = require('child_process');
const path = require('path');

try {
  console.log('Building network helper executables...');

  // Windows build
  execSync('pkg src/network-helper.js --target node18-win-x64 --output network-helper.exe', {
    stdio: 'inherit'
  });

  // macOS build - change output name to match plist expectations
  execSync('pkg src/network-helper.js --target node18-macos-x64 --output network-helper-mac', {
    stdio: 'inherit'
  });

  console.log('✅ Network helpers built successfully (Windows + macOS)');
} catch (error) {
  console.error('❌ Failed to build network helpers:', error.message);
  process.exit(1);
}