// Put koffi's Windows ARM64 binary next to the x64 one before packaging.
//
// npm only installs the koffi platform package that matches the machine it
// runs on, so an arm64 build made on an x64 PC (or CI runner) would ship the
// x64 koffi.node — which an arm64 process can't load, taking Live Scan down
// with it. This fetches @koromix/koffi-win32-arm64 at the exact koffi version
// and unpacks it into node_modules. Idempotent; safe to run before every build.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.join(__dirname, '..')
const koffiVersion = require(path.join(root, 'node_modules', 'koffi', 'package.json')).version
const target = path.join(root, 'node_modules', '@koromix', 'koffi-win32-arm64')
const marker = path.join(target, 'package.json')

if (fs.existsSync(marker) && require(marker).version === koffiVersion) {
  console.log(`koffi-win32-arm64@${koffiVersion} already present`)
  process.exit(0)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'koffi-arm64-'))
try {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const out = execFileSync(npm, ['pack', `@koromix/koffi-win32-arm64@${koffiVersion}`, '--pack-destination', tmp, '--silent'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  })
  const tgz = path.join(tmp, out.trim().split(/\r?\n/).pop())
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(target, { recursive: true })
  // bsdtar ships with Windows 10+ and every CI image.
  execFileSync('tar', ['-xzf', tgz, '-C', target, '--strip-components=1'])
  if (!fs.existsSync(path.join(target, 'win32_arm64', 'koffi.node'))) {
    throw new Error('win32_arm64/koffi.node missing from the package')
  }
  console.log(`koffi-win32-arm64@${koffiVersion} unpacked into node_modules`)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}
