import fs from 'node:fs';
import { parseDocument } from 'yaml';

export function readDocument(file, fallback) {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  const doc = parseDocument(raw ?? fallback, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  });
  if (doc.errors.length) throw new Error('invalid-yaml');
  return { file, raw, doc };
}
