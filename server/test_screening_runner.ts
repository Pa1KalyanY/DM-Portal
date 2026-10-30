import { evaluateScreening } from '../src/shared/screeningEngine.js';

const testCases = [
  {
    testNumber: 1,
    title: 'Green Card = YES, Sponsorship = NO',
    input: 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    expected: 'PASS',
  },
  {
    testNumber: 2,
    title: 'Green Card = NO, Sponsorship = NO',
    input: 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    expected: 'FAIL',
  },
  {
    testNumber: 3,
    title: 'Green Card = YES, Sponsorship = YES',
    input: 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
    expected: 'FAIL',
  },
  {
    testNumber: 4,
    title: 'Green Card = NO, Sponsorship = YES',
    input: 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
    expected: 'FAIL',
  },
  {
    testNumber: 5,
    title: 'Green Card = YES, Sponsorship = MISSING',
    input: 'Do You Have a Green Card or US Citizen ? : Yes',
    expected: 'MANUAL_REVIEW',
  },
  {
    testNumber: 6,
    title: 'Green Card = MISSING, Sponsorship = NO',
    input: 'Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    expected: 'MANUAL_REVIEW',
  },
  {
    testNumber: 7,
    title: 'Both Questions Blank / Missing',
    input: '',
    expected: 'MANUAL_REVIEW',
  },
  {
    testNumber: 8,
    title: 'Case Insensitive Matching',
    input: 'DO YOU HAVE A GREEN CARD OR US CITIZEN? : YES, WILL YOU NOW REQUIRE SPONSORSHIP? : NO',
    expected: 'PASS',
  },
  {
    testNumber: 9,
    title: 'Whitespace Insensitive Matching',
    input: '  Do  You  Have  a  Green  Card  or  US  Citizen  ?  :  Yes  ,  Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?  :  No  ',
    expected: 'PASS',
  },
  {
    testNumber: 10,
    title: 'Punctuation Variance',
    input: 'Do You Have a Green Card or US Citizen? Yes. Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status): No.',
    expected: 'PASS',
  },
  {
    testNumber: 11,
    title: 'Multiline Format',
    input: 'Do You Have a Green Card or US Citizen ?\nYes\nWill you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?\nNo',
    expected: 'PASS',
  },
  {
    testNumber: 12,
    title: 'Unrecognized Answer Value',
    input: 'Do You Have a Green Card or US Citizen ? : Maybe, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Unsure',
    expected: 'MANUAL_REVIEW',
  },
];

console.log('Testing 12 Legal Screening Test Cases...');
let passedCount = 0;

for (const tc of testCases) {
  const result = evaluateScreening(tc.input);
  const passed = result.status === tc.expected;
  if (passed) passedCount++;
  console.log(`Test ${tc.testNumber} [${tc.title}]: Expected=${tc.expected}, Got=${result.status} -> ${passed ? 'PASSED' : 'FAILED'}`);
}

console.log(`\nResult: ${passedCount}/${testCases.length} tests passed.`);
if (passedCount === testCases.length) {
  console.log('100% SUCCESS: All 12 screening test cases passed with zero regressions.');
} else {
  process.exit(1);
}
