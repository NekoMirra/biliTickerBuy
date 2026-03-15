import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

function getVersion() {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return pkg.version;
}

function bumpVersion(type = 'patch') {
    const current = getVersion();
    const parts = current.split('.').map(Number);
    
    if (type === 'major') {
        parts[0]++;
        parts[1] = 0;
        parts[2] = 0;
    } else if (type === 'minor') {
        parts[1]++;
        parts[2] = 0;
    } else {
        parts[2]++;
    }
    
    return parts.join('.');
}

const newVersion = bumpVersion(process.argv[2] || 'patch');
console.log(`Bumping version to ${newVersion}`);

// Update package.json
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

// Update tauri.conf.json
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
// Support V1 structure
if (tauriConf.package && tauriConf.package.version) {
    tauriConf.package.version = newVersion;
}
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4));

// Update Cargo.toml
let cargo = fs.readFileSync(cargoTomlPath, 'utf8');
// Find version = "..." under [package]
// This regex is simple but effective for standard Cargo.toml
cargo = cargo.replace(/^version = "[\d\.]+"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoTomlPath, cargo);

// Output for CI
console.log(`::set-output name=new_version::${newVersion}`);
