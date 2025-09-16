#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const version = packageJson.version;

// Read HTML template
const htmlPath = path.join(__dirname, 'lib/renderer/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace the version placeholder with actual version
html = html.replace(
  /\{\$version\}/,
  `${version}`
);

// Write modified HTML
const outputPath = path.join(__dirname, 'lib/renderer/index.html');
fs.writeFileSync(outputPath, html);

console.log(`✅ Injected version ${version} into header title`);