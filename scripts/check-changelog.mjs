// Validates dist/changelog.json. Given a base ref (pull requests), also requires a new release entry
// for each platform whose code changed: node scripts/check-changelog.mjs origin/main
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const FILE = 'dist/changelog.json';
const PLATFORMS = ['web', 'android'];
const semver = /^(\d+)\.(\d+)\.(\d+)$/;
const isNewer = (a, b) => {
  const [x, y] = [a, b].map(v => v.match(semver).slice(1).map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const errors = [];
const log = JSON.parse(readFileSync(FILE, 'utf8'));

for (const platform of PLATFORMS) {
  const releases = log[platform];
  if (!Array.isArray(releases) || !releases.length) {
    errors.push(`${platform}: add at least one release`);
    continue;
  }
  releases.forEach((release, i) => {
    const at = `${platform} ${release.version ?? '#' + (i + 1)}`;
    if (!semver.test(release.version ?? '')) errors.push(`${at}: version must look like 1.2.3`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date ?? '')) errors.push(`${at}: date must look like 2026-11-26`);
    const changes = release.changes;
    if (!Array.isArray(changes) || !changes.length || changes.some(c => typeof c !== 'string' || !c.trim())) {
      errors.push(`${at}: list at least one change`);
    }
    const above = releases[i - 1];
    if (above && semver.test(above.version ?? '') && semver.test(release.version ?? '') && !isNewer(above.version, release.version)) {
      errors.push(`${platform}: newest release goes first, and ${above.version} must be newer than ${release.version}`);
    }
  });
}

const base = process.argv[2];
if (base && !errors.length) {
  const git = (...args) => execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
  const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
  let before = {};
  try { before = JSON.parse(git('show', `${base}:${FILE}`)); } catch {}
  const touched = {
    web: changed.some(f => f.startsWith('dist/') && f !== FILE),
    android: changed.some(f => f.startsWith('android/')),
  };
  for (const platform of PLATFORMS) {
    const was = before[platform]?.[0]?.version;
    if (touched[platform] && was && !isNewer(log[platform][0].version, was)) {
      errors.push(`${platform} code changed: add a release newer than ${was} at the top of the ${platform} list`);
    }
  }
}

if (errors.length) {
  const prefix = process.env.GITHUB_ACTIONS ? `::error file=${FILE}::` : '✗ ';
  console.error(errors.map(e => prefix + e).join('\n'));
  process.exit(1);
}
console.log(`Changelog OK: web ${log.web[0].version}, android ${log.android[0].version}`);
