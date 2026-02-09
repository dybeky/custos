const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const releaseDir = path.join(__dirname, '../release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const exe = path.join(unpackedDir, 'Custos.exe');
const manifest = path.join(__dirname, '../resources/app.manifest');
const icon = path.join(__dirname, '../resources/icon.ico');

// Check if exe exists
if (!fs.existsSync(exe)) {
  console.error(`Error: ${exe} not found. Run 'npm run package:win' first.`);
  process.exit(1);
}

// Check if manifest exists
if (!fs.existsSync(manifest)) {
  console.error(`Error: ${manifest} not found.`);
  process.exit(1);
}

// Check if icon exists
if (!fs.existsSync(icon)) {
  console.error(`Error: ${icon} not found.`);
  process.exit(1);
}

// Find rcedit
let rcedit;
const globalRcedit = path.join(process.env.APPDATA || '', 'npm/node_modules/rcedit/bin/rcedit-x64.exe');
const localRcedit = path.join(__dirname, '../node_modules/rcedit/bin/rcedit-x64.exe');

if (fs.existsSync(localRcedit)) {
  rcedit = localRcedit;
} else if (fs.existsSync(globalRcedit)) {
  rcedit = globalRcedit;
} else {
  console.log('Installing rcedit...');
  execSync('npm install rcedit', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  rcedit = localRcedit;
}

// Apply manifest and icon
console.log('Applying UAC manifest and icon to Custos.exe...');
execSync(`"${rcedit}" "${exe}" --application-manifest "${manifest}" --set-icon "${icon}"`, { stdio: 'inherit' });

console.log('');
console.log('Done! release/win-unpacked/Custos.exe now has:');
console.log('  - Custom icon');
console.log('  - UAC administrator manifest');
console.log('');
console.log('To distribute: zip the release/win-unpacked folder');
