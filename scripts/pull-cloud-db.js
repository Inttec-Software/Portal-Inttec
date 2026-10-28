const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const isWindows = os.platform() === 'win32';
const script = isWindows ? 'pull-cloud-db.ps1' : 'pull-cloud-db.sh';
const scriptPath = path.join(__dirname, script);

let cmd;
let args;

if (isWindows) {
  cmd = 'powershell';
  args = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...process.argv.slice(2)];
} else {
  cmd = 'bash';
  args = [scriptPath, ...process.argv.slice(2)];
}

const child = spawn(cmd, args, { stdio: 'inherit' });

child.on('exit', (code) => {
  process.exit(code || 0);
});
