import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_DIR = join(__dirname, '..', '..', 'training');

async function loadJson(filename, fallback) {
  try {
    const raw = await readFile(join(TRAINING_DIR, filename), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[training] failed to load ${filename}:`, err.message);
    return fallback;
  }
}

export async function loadExamples() {
  return loadJson('examples.json', []);
}

export async function loadTemplates() {
  return loadJson('templates.json', {});
}

export async function loadFaq() {
  return loadJson('faq.json', {});
}
