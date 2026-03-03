#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/acceptance-evidence.js --decision_id=... --request_id=... --selected=ARCHIVIST,NARRATIVE,CATALYST [--timestamp=...]
 * Prints a markdown block for RUNNING_LOG.md
 */
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [k, v] = arg.replace(/^--/, '').split('=');
  return [k, v];
}));

const { decision_id, request_id, selected, timestamp } = args;
if (!decision_id || !request_id || !selected) {
  console.error('Usage: node scripts/acceptance-evidence.js --decision_id=... --request_id=... --selected=ARCHIVIST,NARRATIVE,CATALYST [--timestamp=...]');
  process.exit(1);
}

const ts = timestamp || new Date().toISOString();

console.log(`\n### Acceptance Evidence\n\n- Timestamp: ${ts}\n- request_id: ${request_id}\n- decision_id: ${decision_id}\n- selected_specialists: [${selected.split(',').map(s => '"'+s+'"').join(', ')}]\n\nPaste this block into RUNNING_LOG.md after a successful acceptance smoke run.\n`);
