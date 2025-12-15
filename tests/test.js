/**
 * Basic test file for CathReadingsJS
 * Run with: node tests/test.js
 */

const CathReadings = require('../cathReadings.js');

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

// Test 1: Static date formatting
console.log('\n📝 Testing static date formatting methods...\n');

const testDate = new Date(2025, 11, 15); // December 15, 2025
const formatted = CathReadings.formatDateForUrl(testDate);
assert(formatted === '121525', 'formatDateForUrl returns correct MMDDYY format');

// Test 2: Static date parsing
const parsed = CathReadings.parseDateString('121525');
assert(parsed.getFullYear() === 2025, 'parseDateString parses year correctly');
assert(parsed.getMonth() === 11, 'parseDateString parses month correctly');
assert(parsed.getDate() === 15, 'parseDateString parses day correctly');

// Test 3: Date format validation
let validationPassed = false;
try {
  CathReadings.parseDateString('999999');
} catch (e) {
  validationPassed = e.message === 'Invalid date values';
}
assert(validationPassed, 'parseDateString validates invalid dates');

// Test 4: Date format string validation
validationPassed = false;
try {
  CathReadings.parseDateString('12152');
} catch (e) {
  validationPassed = e.message === 'Date must be in MMDDYY format';
}
assert(validationPassed, 'parseDateString validates MMDDYY format');

// Test 5: Constructor
const readings = new CathReadings();
assert(readings.baseUrl === 'https://bible.usccb.org/bible/readings', 'Constructor sets correct base URL');

// Test 6: Method existence
assert(typeof readings.getReadings === 'function', 'getReadings method exists');
assert(typeof readings.getToday === 'function', 'getToday method exists');
assert(typeof readings.getTomorrow === 'function', 'getTomorrow method exists');
assert(typeof readings.getReadingsByDaysOffset === 'function', 'getReadingsByDaysOffset method exists');

// Test 7: Async method returns promise
const todayPromise = readings.getToday();
assert(todayPromise instanceof Promise, 'getToday returns a Promise');

console.log('\n✨ All tests passed!\n');
