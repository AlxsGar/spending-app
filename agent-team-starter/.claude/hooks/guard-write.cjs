#!/usr/bin/env node
// PreToolUse hook for Edit and Write.
// The coordinator (main session) may only write inside docs/ and
// .claude/agents/. Role agents are not affected. Exit code 2 blocks the
// edit and sends the message below back to the coordinator.

const path = require('node:path');

const COORDINATOR = 'coordinator';
const ALLOWED_PREFIXES = ['docs/', '.claude/agents/'];

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

  // agent_id is only present when the call comes from inside a subagent.
  const fromMainSession = !input.agent_id;
  if (!(fromMainSession && input.agent_type === COORDINATOR)) process.exit(0);

  const filePath = input.tool_input && input.tool_input.file_path;
  if (!filePath) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const relative = path
    .relative(root, path.resolve(root, filePath))
    .split(path.sep)
    .join('/');

  const allowed = ALLOWED_PREFIXES.some((prefix) => relative.startsWith(prefix));
  if (allowed) process.exit(0);

  console.error(
    `Blocked: the coordinator does not edit "${relative}". ` +
      'Delegate this change to mobile-dev. The coordinator may only write ' +
      'inside docs/ and .claude/agents/.'
  );
  process.exit(2);
});
