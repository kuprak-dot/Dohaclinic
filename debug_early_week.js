import fs from 'fs';

const text = fs.readFileSync('debug_ocr.txt', 'utf-8');
const lines = text.split('\n').filter(l => l.trim().length > 0);

console.log('=== Lines BEFORE first explicit date (8) ===\n');

for (let i = 0; i < 8; i++) {
    const line = lines[i];
    const hasPipes = line.includes('|');
    const hasTevfik = line.toLowerCase().includes('tevfik') ||
        line.toLowerCase().includes('revfik');

    console.log(`Line ${i + 1}: ${hasPipes ? 'HAS PIPES' : '         '} | ${hasTevfik ? 'HAS TEVFIK' : '          '}`);
    console.log(`  "${line}"`);
    if (hasPipes) {
        const parts = line.split('|').map(p => p.trim());
        console.log(`  Parts (${parts.length}): ${JSON.stringify(parts)}`);
    }
    console.log();
}

console.log('\n=== Analysis ===');
console.log('Line 4 and 5 both have pipes and Dr. Tevfik');
console.log('These are likely data rows for days 1-7');
console.log('The first explicit date we see is day 8');
console.log('So we need to work BACKWARD from day 8 to assign dates to lines 4-7');
