import fs from 'fs';

// Read the debug OCR output
const text = fs.readFileSync('debug_ocr.txt', 'utf-8');
const lines = text.split('\n').filter(l => l.trim().length > 0);

console.log('=== ANALYZING OCR OUTPUT ===\n');

lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Check for date pattern
    const dateMatch = line.match(/^\(?\s*([0-9il]+)\s*[|]/);
    let date = null;
    if (dateMatch) {
        let dateStr = dateMatch[1].replace(/i/g, '1').replace(/l/g, '1');
        date = parseInt(dateStr);
    }

    // Check for Dr. Tevfik
    const hasTevfik = line.toLowerCase().includes('tevfik') ||
        line.toLowerCase().includes('revfik') ||
        line.toLowerCase().includes('tevfık');

    // Check structure
    const parts = line.split('|');
    const hasMultiplePipes = parts.length > 2;

    console.log(`Line ${lineNum}: ${date ? `DATE ${date}` : 'NO DATE'} | ${hasTevfik ? 'HAS TEVFIK' : '         '} | Pipes: ${parts.length - 1}`);
    console.log(`  "${line}"`);

    if (hasTevfik) {
        console.log(`  Parts: ${JSON.stringify(parts)}`);
    }
    console.log();
});

console.log('\n=== SUMMARY ===');
console.log('Lines with Dr. Tevfik but no explicit date:');
lines.forEach((line, index) => {
    const lineNum = index + 1;
    const dateMatch = line.match(/^\(?\s*([0-9il]+)\s*[|]/);
    const hasTevfik = line.toLowerCase().includes('tevfik') ||
        line.toLowerCase().includes('revfik') ||
        line.toLowerCase().includes('tevfık');

    if (hasTevfik && !dateMatch) {
        console.log(`  Line ${lineNum}: "${line}"`);
    }
});
