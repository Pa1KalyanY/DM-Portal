import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXPORT_DIR = path.resolve(__dirname, '..', 'data');
const EXPORT_FILE = path.resolve(EXPORT_DIR, 'extracted_recruiter_feedback_raw.json');

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>IndexedDB Read-Only Recruiter Feedback Extractor</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; background: #0f172a; color: #f8fafc; }
    #log { background: #1e293b; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 13px; white-space: pre-wrap; margin-top: 16px; max-height: 400px; overflow-y: auto; border: 1px solid #334155; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: bold; background: #0284c7; color: white; }
  </style>
</head>
<body>
  <h2>IndexedDB Read-Only Recruiter Feedback Extractor</h2>
  <p><span class="badge">SAFETY CHECK</span> Transaction Mode: <strong>Strictly 'readonly'</strong> (Zero writes/deletes/mutations)</p>
  <p>Target Database: <code>aaratech_clinisoltech_master_db</code> on origin <code>http://localhost:5174</code></p>
  <div id="status">Connecting to browser IndexedDB...</div>
  <div id="log"></div>

  <script>
    const logEl = document.getElementById('log');
    const statusEl = document.getElementById('status');

    function log(msg) {
      logEl.textContent += msg + '\\n';
      logEl.scrollTop = logEl.scrollHeight;
    }

    async function runExtraction() {
      try {
        log('[1] Checking indexedDB support...');
        if (!window.indexedDB) {
          statusEl.textContent = 'ERROR: IndexedDB not supported in this browser.';
          return;
        }

        log('[2] Opening database: aaratech_clinisoltech_master_db (version 2)...');
        const req = window.indexedDB.open('aaratech_clinisoltech_master_db', 2);

        req.onerror = (e) => {
          statusEl.textContent = 'Failed to open IndexedDB: ' + (e.target.error?.message || 'Unknown error');
          log('ERROR: ' + e.target.error?.message);
        };

        req.onblocked = () => {
          statusEl.textContent = 'Database open blocked by another tab.';
          log('BLOCKED: Please close other tabs of port 5174 if any.');
        };

        req.onsuccess = async (e) => {
          const db = e.target.result;
          const storeNames = Array.from(db.objectStoreNames);
          log('[3] Connected successfully! Available object stores: ' + JSON.stringify(storeNames));

          const extractedPeople = [];
          const extractedIncomplete = [];
          const extractedContacts = [];

          // Strictly READONLY transaction
          log('[4] Starting READONLY transaction on available stores...');
          
          if (storeNames.includes('people')) {
            const txPeople = db.transaction('people', 'readonly');
            const store = txPeople.objectStore('people');
            const people = await new Promise((res, rej) => {
              const r = store.getAll();
              r.onsuccess = () => res(r.result || []);
              r.onerror = () => rej(r.error);
            });
            log('[5] Retrieved ' + people.length + ' candidate records from "people" store.');

            for (const p of people) {
              if (p.recruiter_contacts && Array.isArray(p.recruiter_contacts) && p.recruiter_contacts.length > 0) {
                for (const c of p.recruiter_contacts) {
                  extractedContacts.push({
                    source_store: 'people',
                    candidate_id: p.id,
                    candidate_person_id: p.person_id || null,
                    candidate_name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
                    candidate_email: p.primary_email || null,
                    candidate_phone: p.primary_phone || null,
                    candidate_company: p.company || null,
                    contact_id: c.id || null,
                    recruiter_name: c.recruiter_name || null,
                    contact_date: c.contact_date || null,
                    contact_type: c.contact_type || 'Phone',
                    original_feedback: c.original_feedback || '',
                    feedback_label: c.feedback_label || null,
                    column_index: c.column_index ?? null,
                    source_file: c.source_file || p.source_file || null,
                    source_row: c.source_row ?? null,
                    created_at: c.created_at || null,
                    raw_contact_object: c
                  });
                }
              }
            }
          }

          if (storeNames.includes('incompleteRecords')) {
            const txInc = db.transaction('incompleteRecords', 'readonly');
            const incStore = txInc.objectStore('incompleteRecords');
            const incomplete = await new Promise((res, rej) => {
              const r = incStore.getAll();
              r.onsuccess = () => res(r.result || []);
              r.onerror = () => rej(r.error);
            });
            log('[6] Retrieved ' + incomplete.length + ' records from "incompleteRecords" store.');

            for (const inc of incomplete) {
              if (inc.recruiter_feedback) {
                extractedContacts.push({
                  source_store: 'incompleteRecords',
                  candidate_id: inc.id,
                  candidate_person_id: inc.person_id || null,
                  candidate_name: inc.full_name || [inc.first_name, inc.last_name].filter(Boolean).join(' ') || null,
                  candidate_email: inc.primary_email || inc.email || null,
                  candidate_phone: inc.primary_phone || inc.phone || null,
                  candidate_company: inc.company || null,
                  contact_id: null,
                  recruiter_name: inc.assigned_recruiter || inc.uploaded_by || null,
                  contact_date: inc.created_at ? inc.created_at.substring(0, 10) : null,
                  contact_type: 'Note',
                  original_feedback: inc.recruiter_feedback,
                  feedback_label: 'Recruiter Feedback',
                  column_index: null,
                  source_file: inc.source_file || null,
                  source_row: inc.source_row ?? null,
                  created_at: inc.created_at || null,
                  raw_contact_object: null
                });
              }
            }
          }

          log('[7] Extraction finished! Found ' + extractedContacts.length + ' recruiter feedback occurrences.');
          statusEl.textContent = 'Extraction complete! Found ' + extractedContacts.length + ' occurrences. Sending to local receiver...';

          // Send to local endpoint
          const res = await fetch('/save-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              exported_at: new Date().toISOString(),
              total_contacts_extracted: extractedContacts.length,
              contacts: extractedContacts
            })
          });

          const resData = await res.json();
          log('[8] Local server response: ' + JSON.stringify(resData));
          statusEl.textContent = 'DONE! Export successfully saved to disk. Total records: ' + extractedContacts.length;
        };
      } catch (err) {
        log('EXCEPTION: ' + err.message);
        statusEl.textContent = 'Error: ' + err.message;
      }
    }

    runExtraction();
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && req.url === '/save-export') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(EXPORT_FILE, JSON.stringify(parsed, null, 2), 'utf8');
        console.log(`[Export Receiver] Successfully wrote ${parsed.total_contacts_extracted} feedback records to ${EXPORT_FILE}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, saved_to: EXPORT_FILE, count: parsed.total_contacts_extracted }));
      } catch (err: any) {
        console.error('[Export Receiver] Error writing file:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const PORT = 5174;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[IndexedDB Extractor Server] Running on http://127.0.0.1:${PORT}`);
  console.log(`[IndexedDB Extractor Server] Open this URL in the browser under origin http://localhost:${PORT} to execute read-only export.`);
});
