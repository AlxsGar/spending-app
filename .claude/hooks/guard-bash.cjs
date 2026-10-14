#!/usr/bin/env node
// PreToolUse hook for Bash.
// 1. Blocks any shell command that touches the credentials folder.
// 2. Blocks writing or editing files through the shell (redirects, heredocs,
//    sed -i, tee, npm pkg set). Files are changed with Write and Edit so the
//    edit hooks run and the change shows as a file diff.
// 3. Blocks `git commit` while the current branch is main or master.
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

  // --- 2. No file writes through the shell -----------------------------------
  // Quoted strings are removed before the redirect check so that a ">" inside
  // a search pattern (grep '=>') is not mistaken for a redirect.
  const unquoted = command.replace(/'[^']*'|"[^"]*"/g, '""');
  const shellWrite =
    /<<-?\s*['"]?\w+/.test(command) || // heredoc
    /(^|[\s;&|(])sed\s+(-[a-zA-Z]*i|--in-place)/.test(unquoted) || // sed -i
    /(^|[\s;&|(])tee(\s|$)/.test(unquoted) || // tee
    /(^|[\s;&|(])npm\s+pkg\s+(set|delete)(\s|$)/.test(unquoted) || // npm pkg set
    // > or >> to a real file (not >&, not /dev/null)
    /(^|[^>&0-9])>{1,2}\s*(?!&|\/dev\/null)[^\s|&;>]+/.test(unquoted);

  if (shellWrite) {
    console.error(
      'Blocked: writing or editing files through the shell is not allowed. ' +
        'Use the Write tool to create a file and the Edit tool to change one. ' +
        'Bash is for running commands only.'
    );
    process.exit(2);
  }

  // --- 3. No commits on main -------------------------------------------------
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
