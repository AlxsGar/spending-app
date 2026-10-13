#!/usr/bin/env node
// PostToolUse hook for Edit and Write.
// Lints the file that was just changed and, if ESLint reports errors, sends
// them straight back to the agent that made the edit. Does nothing until
// ESLint is installed in the project.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input.tool_input && input.tool_input.file_path;
  if (!filePath || !/\.(ts|tsx|js|jsx)$/.test(filePath)) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const absolute = path.resolve(root, filePath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || relative.split(path.sep).includes('node_modules')) {
    process.exit(0);
  }
  if (!fs.existsSync(absolute)) process.exit(0);

  const eslint = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
  if (!fs.existsSync(eslint)) process.exit(0);

  const result = spawnSync(process.execPath, [eslint, '--quiet', absolute], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });

  // ESLint exits 1 for lint errors. Anything else (0 = clean, 2 = config
  // problem, null = timeout) is not the editing agent's concern.
  if (result.status === 1) {
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    console.error(`ESLint errors in ${relative}:\n${output.slice(0, 4000)}`);
    process.exit(2);
  }
  process.exit(0);
});
