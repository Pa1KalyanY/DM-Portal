import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', '..', 'linkedin_screening.db');

const db = new DatabaseSync(dbPath);

console.log('Running company batch assignment migration...');
db.exec(`
  UPDATE imports 
  SET company = 'ClinisolTech' 
  WHERE LOWER(batch_name) LIKE '%clinisol%';

  UPDATE applicants 
  SET company = 'ClinisolTech' 
  WHERE import_id IN (SELECT id FROM imports WHERE company = 'ClinisolTech');
`);

const counts = db.prepare('SELECT company, count(*) as count FROM applicants GROUP BY company').all();
console.log('Applicants by company after migration:', counts);
const impCounts = db.prepare('SELECT company, count(*) as count FROM imports GROUP BY company').all();
console.log('Imports by company after migration:', impCounts);
