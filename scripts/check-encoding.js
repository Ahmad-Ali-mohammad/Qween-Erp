const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, 'frontend');
const FILE_EXT = new Set(['.html', '.js', '.css']);

const issues = [];

function shouldScan(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!FILE_EXT.has(ext)) return false;
  if (filePath.includes('node_modules')) return false;
  return true;
}

function hasMojibake(line) {
  if (line.includes('/[ØÙ]/')) return false;
  return /(?:[ÃØÙï¿½�]{2,})/.test(line) && !/\[[ÃØÙ]+\]/.test(line);
}

function hasDoubleQuestionInArabicString(line) {
  const stringPattern = /(['"`])(?:\\.|(?!\1).)*\1/g;
  const literals = line.match(stringPattern) || [];
  return literals.some((literal) => /[\u0600-\u06FF]\s*\?{2,}|\?{2,}\s*[\u0600-\u06FF]/.test(literal));
}

function hasPlaceholderToken(line) {
  const stringPattern = /(['"`])(?:\\.|(?!\1).)*\1/g;
  const literals = line.match(stringPattern) || [];
  return literals.some((literal) => /\bنص\b/.test(literal));
}

function scanFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, idx) => {
    if (hasMojibake(line)) {
      issues.push(`${filePath}:${idx + 1} mojibake-sequence`);
    }
    if (/\?{3,}/.test(line)) {
      issues.push(`${filePath}:${idx + 1} question-mark-run`);
    }
    if (hasDoubleQuestionInArabicString(line)) {
      issues.push(`${filePath}:${idx + 1} question-mark-string`);
    }
    if (hasPlaceholderToken(line)) {
      issues.push(`${filePath}:${idx + 1} placeholder-token`);
    }
  });
}

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (shouldScan(fullPath)) {
      scanFile(fullPath);
    }
  }
}

if (fs.existsSync(TARGET_DIR)) {
  walk(TARGET_DIR);
}

if (issues.length) {
  console.error('Encoding check failed. Corrupted Arabic patterns found:');
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log('Encoding check passed.');
