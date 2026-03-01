import fs from 'fs';
import path from 'path';

const FRONTEND_DIR = path.join(process.cwd(), 'frontend');
const EXTENSIONS = new Set(['.html', '.js', '.css']);

function walk(dir: string, collector: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, collector);
      continue;
    }
    if (EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
      collector.push(fullPath);
    }
  }
}

describe('Frontend encoding smoke', () => {
  it('does not contain Arabic placeholder token or mojibake', () => {
    const files: string[] = [];
    walk(FRONTEND_DIR, files);

    const placeholderHits: string[] = [];
    const mojibakeHits: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (/(['"`])(?:\\.|(?!\1).)*\bنص\b(?:\\.|(?!\1).)*\1/.test(text)) {
        placeholderHits.push(file);
      }
      if (/(?:[ÃØÙï¿½�]{2,})/.test(text) && !text.includes('/[ØÙ]/')) {
        mojibakeHits.push(file);
      }
    }

    expect(placeholderHits).toEqual([]);
    expect(mojibakeHits).toEqual([]);
  });
});
