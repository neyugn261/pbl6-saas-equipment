// Review artifact only: no index writes, commits, branches or merges.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const scope = ['apps/identity-service', 'docs/api/identity.yaml', 'docs/erd/hu04-password-recovery.md', 'docs/planning/hu04-identity-review.md'];
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
let patch = git(['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...scope]);
const additions = git(['ls-files', '--others', '--exclude-standard', '--', ...scope]).trim().split(/\r?\n/).filter(Boolean);
for (const file of additions) {
  try { patch += git(['diff', '--no-index', '--binary', '--', '/dev/null', file]); }
  catch (error) { if (error.status !== 1) throw error; patch += error.stdout; }
}
const destination = path.join(root, 'docs/changesets/hu04-identity.patch');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, patch);
git(['apply', '--reverse', '--check', destination]);
console.log('Exported and reverse-check verified docs/changesets/hu04-identity.patch (PENDING_OWNER_APPROVAL).');
