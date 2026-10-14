#!/usr/bin/env node
// PreToolUse hook for Bash.
// 1. Blocks any shell command that touches the credentials folder.
// 2. Blocks `git commit` while the current branch is main or master, so
//    every slice lands on its own branch.
// Exit code 2 blocks the command and sends the message back to the agent.

const { execSync } = require('node:child_process');

const PROTECTED_DIRS = ['credentials'];

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

  const command = String((input.tool_input && input.tool_input.command) || '');

  // --- 1. Protected folders -------------------------------------------------
  for (const dir of PROTECTED_DIRS) {
    const pattern = new RegExp(`(^|[\\s"'=:/\\\\])${dir}([\\s"'/\\\\]|$)`, 'i');
    if (pattern.test(command)) {
      console.error(
        `Blocked: commands that reference "${dir}" are not allowed. ` +
          'That folder is off limits to every agent. Do not try another way ' +
          'to read it; continue without it.'
      );
      process.exit(2);
    }
  }

  // --- 2. No commits on main -------------------------------------------------
  const isCommit = /(^|[\s;&|(])git\s+(-\S+\s+)*commit(\s|$)/.test(command);
  if (!isCommit) process.exit(0);

  let branch = '';
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: input.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    process.exit(0); // not a git repo, or no commits yet
  }

  if (branch === 'main' || branch === 'master') {
    console.error(
      `Blocked: commits on "${branch}" are not allowed. ` +
        'Switch to the slice branch first with `git switch -c slice/<name>` ' +
        '(as its own command), then commit.'
    );
    process.exit(2);
  }
  process.exit(0);
});
