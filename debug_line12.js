import fs from 'fs';

const text = fs.readFileSync('debug_ocr.txt', 'utf-8');
const lines = text.split('\n').filter(l => l.trim().length > 0);

console.log('Checking lines 12-13:');
console.log(`Line 12: "${lines[11]}"`);
console.log(`Line 13: "${lines[12]}"`);

// Check if line 12 has "i2" which should be 12
console.log('\nExpected: Line 12 should be date 12 (Friday)');
console.log('Line 13 should be associated with date 12');

// Check parsing
const dateMatch12 = lines[11].match(/^\(?\s*([0-9il]+)\s*[|]/);
const dateMatch13 = lines[12].match(/^\(?\s*([0-9il]+)\s*[|]/);

console.log(`Line 12 date match: ${dateMatch12}`);
console.log(`Line 13 date match: ${dateMatch13}`);

// The "i2" in "i2 Friday" is not followed by a pipe, so it won't match
console.log('\n"i2 Friday" does not have a pipe after the date, so regex won\'t catch it');
console.log('Need to update the date regex to handle this case');
