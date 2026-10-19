// Check source inventory, local documentation links, and packaged runtime inputs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))].filter(file => fs.existsSync(file));
const index = fs.readFileSync('docs/文件用途索引.md', 'utf8');
const indexed = [...index.matchAll(/\]\(([^)]+)\)/g)].map(match => path.resolve(root, 'docs', decodeURIComponent(match[1].split('#')[0])));
const absent = files.filter(file => !indexed.includes(path.resolve(root, file)));
if (absent.length) throw Error('Files absent from index: ' + absent.join(', '));
if (!index.includes(`**${files.length} 个维护文件**`)) throw Error('File count mismatch: ' + files.length);
let links = 0;
const brokenLinks = [];
for (const file of files.filter(file => file.endsWith('.md'))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\]\(([^)\s]+)\)/g)) {
    const link = match[1]; if (/^(https?:|mailto:|#)/.test(link)) continue;
    const target = decodeURIComponent(link.split('#')[0]);
    if (!fs.existsSync(path.resolve(root, path.dirname(file), target))) brokenLinks.push({ file, link });
    links++;
  }
}
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const file of packageJson.build.files) {
  if (!fs.existsSync(file)) throw Error('Missing packaging input: ' + file);
  if (!/\.(?:m?js|cjs)$/.test(file)) continue;
  const code = fs.readFileSync(file, 'utf8');
  for (const match of code.matchAll(/(?:from\s*|require\(|import\()['"](\.[^'"]+)['"]/g)) {
    const target = path.relative(root, path.resolve(path.dirname(file), match[1])).replaceAll('\\', '/');
    if (!packageJson.build.files.includes(target)) throw Error('Runtime dependency absent from whitelist: ' + target);
  }
}
const bad = files.filter(file => /(^|\/)(node_modules|\.cache|backups|release|dist|desktop\/data)(\/|$)|\.(?:exe|asar|db|key|pfx|pem)$/.test(file));
if (bad.length) throw Error('Generated/private source candidates: ' + bad.join(', '));
if (brokenLinks.length) throw Error('Broken local documentation links: ' + JSON.stringify(brokenLinks));
console.log(JSON.stringify({ files: files.length, localLinks: links, brokenLinks, packagingInputs: packageJson.build.files.length, indexCoverage: 'complete', privatePaths: 'excluded' }));
