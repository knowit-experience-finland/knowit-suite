#!/usr/bin/env node
// Copy the shared knowit-suite/ folder from this package into a project:
// `knowit-suite sync [target]`, target defaults to ./knowit-suite. Projects
// run it from their own postinstall script.
import { cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [command, target = 'knowit-suite'] = process.argv.slice(2);

if (command !== 'sync') {
  console.error('Usage: knowit-suite sync [target]');
  process.exit(1);
}

const source = fileURLToPath(new URL('../knowit-suite', import.meta.url));
const destination = path.resolve(target);
const relative = path.relative(process.cwd(), destination);

// The target is replaced, so only allow a folder inside the current one
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
  console.error(
    `knowit-suite: target must be a folder inside ${process.cwd()}`
  );
  process.exit(1);
}

if (destination === source) {
  console.log('knowit-suite: running in the suite repo, nothing to sync');
  process.exit(0);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, {
  recursive: true,
  filter: (file) => path.basename(file) !== '.DS_Store',
});
console.log(`knowit-suite: synced to ${relative}`);
