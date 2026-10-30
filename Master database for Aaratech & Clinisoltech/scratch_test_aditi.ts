import * as XLSX from 'xlsx';
import { convertPastedTextToFile } from './src/lib/importEngine.ts';

const testText = `20-Mar-2025	Aditi Sangle	12012841470	aditisangle2@gmailcom	United States	DA	Alex	Female/Not Interested
1-May-2025	charith kumar	5129373698	chku3401@gmailcom	Missouri	AWS	Alex	8/H1B/Relocate/Missoruri/96/masters 2020/Visa ISsue
1-May-2025	Sanjo George Eluvathingal	4753391769	sanjogeorge@yahoocouk	 Greater Seattle 	AWS	Alex	Data engineer/4/F1 OPT/MS 2024/conecticut/Relocate/1981/Not interested on 70/20`;

async function test() {
  const file = convertPastedTextToFile(testText);
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log('Resulting rows:', JSON.stringify(rows, null, 2));
}

test().catch(console.error);
