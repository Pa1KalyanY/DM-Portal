import { extractCleanPhone } from './src/lib/importEngine.ts';
import { normalizeEmail, normalizePhone } from './src/lib/normalization.ts';

const row = ['20-Mar-2025', 'Aditi Sangle', '12012841470', 'aditisangle2@gmailcom', 'United States', 'DA', 'Alex', 'Female/Not Interested'];

console.log('Testing Aditi row:');
console.log('Phone:', row[2], 'clean:', extractCleanPhone(row[2]), 'norm:', normalizePhone(row[2]));
console.log('Email:', row[3], 'norm:', normalizeEmail(row[3]));
