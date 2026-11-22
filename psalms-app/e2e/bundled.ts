/* The ids of the entries the app ships with (publishedEntries.json).
 *
 * These specs seed a device with their own material and count what the
 * screens show, so the bundle must be out of the way. A seeded store lists
 * the bundled ids as deleted by the reader — exactly the state a reader who
 * removed them would be in — rather than the specs depending on the bundle
 * being empty. */
import fs from 'node:fs';

const file = new URL('../src/missingParts/data/publishedEntries.json', import.meta.url);
export const BUNDLED_IDS: string[] =
  (JSON.parse(fs.readFileSync(file, 'utf8')) as { id: string }[]).map((e) => e.id);
