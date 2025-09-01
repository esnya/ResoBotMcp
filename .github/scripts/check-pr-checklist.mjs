#!/usr/bin/env node
// Validate PR checklist compliance from the event payload.
// Fails if any unchecked checkbox remains in the "Checklist (AGENTS.md)" section.
import fs from 'node:fs';

const eventPath = process.env.GITHUB_EVENT_PATH;
const eventName = process.env.GITHUB_EVENT_NAME;

if (!eventPath) {
  console.log('No GITHUB_EVENT_PATH; nothing to validate.');
  process.exit(0);
}

try {
  const json = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  if (eventName !== 'pull_request') {
    process.exit(0);
  }
  const body = (json.pull_request && json.pull_request.body) || '';
  if (!body || body.trim().length === 0) {
    console.error('PR body is empty. Please use the template and complete the checklist.');
    process.exit(1);
  }

  // Extract the section between the Checklist header and the next header
  const match = body.match(/##\s*Checklist[\s\S]*?(?=\n##\s|$)/i);
  if (!match) {
    console.error(
      'Checklist section not found. Please include the checklist from the PR template.',
    );
    process.exit(1);
  }
  const section = match[0];

  const unchecked = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^- \[ \]/.test(l));

  if (unchecked.length > 0) {
    console.error('Unchecked checklist items found:\n' + unchecked.join('\n'));
    console.error('Please complete all items or explain exceptions in the PR description.');
    process.exit(1);
  }

  // Encourage presence of at least one checked item to ensure the checklist is used
  const hasChecked = section.split('\n').some((l) => /^- \[[xX]\]/.test(l.trim()));
  if (!hasChecked) {
    console.error('No checked items found in checklist. Please confirm each item.');
    process.exit(1);
  }

  console.log('PR checklist looks complete.');
  process.exit(0);
} catch (e) {
  console.error('Failed to validate PR checklist:', e);
  process.exit(1);
}
