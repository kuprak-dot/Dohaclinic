import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Tesseract from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const FOLDER_NAME = 'Doha_Schedules';
const OUTPUT_FILE = path.join(__dirname, 'public/schedule.json');
const TEMP_IMG_PATH = path.join(__dirname, 'temp_schedule_img'); // No extension yet

// Authenticate with Google Drive
async function getDriveClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error("Error: google-credentials.json not found!");
        return null;
    }
    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return google.drive({ version: 'v3', auth });
}

// Find the latest Image in the target folder
async function getLatestImage(drive) {
    try {
        // 1. Find the folder
        const folderRes = await drive.files.list({
            q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
        });

        if (folderRes.data.files.length === 0) {
            console.error(`Folder '${FOLDER_NAME}' not found.`);
            return null;
        }

        const folderId = folderRes.data.files[0].id;
        console.log(`Found folder '${FOLDER_NAME}' (ID: ${folderId})`);

        // 2. Find the latest Image in that folder
        // Searching for jpeg, jpg, png
        const fileRes = await drive.files.list({
            q: `'${folderId}' in parents and (mimeType = 'image/jpeg' or mimeType = 'image/png') and trashed = false`,
            orderBy: 'createdTime desc',
            pageSize: 1,
            fields: 'files(id, name, mimeType, webContentLink, webViewLink, createdTime)',
        });

        if (fileRes.data.files.length === 0) {
            console.log("No Image files found in the folder.");
            return null;
        }

        const file = fileRes.data.files[0];
        console.log(`Found latest Image: ${file.name} (${file.createdTime})`);
        return file;

    } catch (error) {
        console.error("Error finding Image:", error.message);
        return null;
    }
}

// Download file
async function downloadFile(drive, fileId, destPath) {
    const dest = fs.createWriteStream(destPath);
    const res = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
        res.data
            .on('end', () => {
                console.log('Download complete.');
                resolve();
            })
            .on('error', err => {
                console.error('Error downloading file:', err);
                reject(err);
            })
            .pipe(dest);
    });
}

// Extract text from Image using Tesseract
async function extractTextFromImage(imgPath) {
    console.log("Starting OCR...");
    const { data: { text } } = await Tesseract.recognize(
        imgPath,
        'tur', // Turkish language support
        { logger: m => console.log(m) }
    );
    return text;
}

// Parse Schedule
function parseSchedule(text) {
    console.log("--- Extracted Text Preview ---");
    console.log(text.substring(0, 500) + "...");
    console.log("------------------------------");

    const rawLines = text.split('\n').filter(l => l.trim().length > 0);

    // Helper to clean text
    const clean = (str) => str ? str.trim().toLowerCase() : '';

    // Helper to check if text contains Dr. Tevfik
    const isTevfik = (str) => {
        const s = clean(str);
        return s.includes('tevfik') || s.includes('revfik') || s.includes('tevfık') || s.includes('tevflk');
    };

    // Step 1: Analyze lines
    const parsedLines = rawLines.map(line => {
        const dateMatch = line.match(/^\(?\s*([0-9il]+)\s*[|]/);
        let explicitDate = null;
        if (dateMatch) {
            let dateStr = dateMatch[1].replace(/i/g, '1').replace(/l/g, '1');
            const day = parseInt(dateStr);
            if (!isNaN(day) && day >= 1 && day <= 31) {
                explicitDate = day;
            }
        }

        // Heuristic for a schedule row: contains '|' OR contains 'Dr' or 'Or' (common OCR error for Dr)
        const isRow = line.includes('|') ||
            line.toLowerCase().includes('dr') ||
            line.toLowerCase().includes('or.');

        return {
            text: line,
            explicitDate,
            isRow,
            finalDate: explicitDate
        };
    });

    // Step 2: Forward Pass (Propagate dates forward)
    let lastDate = 0;
    for (let i = 0; i < parsedLines.length; i++) {
        if (parsedLines[i].explicitDate) {
            lastDate = parsedLines[i].explicitDate;
        } else if (lastDate > 0 && parsedLines[i].isRow) {
            // Only increment if the previous line was also a row (to avoid jumping over garbage)
            // Actually, if we hit garbage, we should probably stop propagating?
            // But garbage might be just noise.
            // Let's assume if it's a row, it's the next day.
            // Check if we are not exceeding the next explicit date?
            // That requires global knowledge.
            // Let's just set it tentatively, backward pass will correct/verify.
            parsedLines[i].finalDate = lastDate + 1;
            lastDate++;
        }
    }

    // Step 3: Backward Pass (Propagate dates backward from explicit dates)
    // This helps recover dates before the first explicit date or in gaps
    let nextDate = 32;
    for (let i = parsedLines.length - 1; i >= 0; i--) {
        if (parsedLines[i].explicitDate) {
            nextDate = parsedLines[i].explicitDate;
        } else if (nextDate <= 31 && parsedLines[i].isRow) {
            // If we already have a finalDate from forward pass, check consistency
            // If forward says X and backward says Y, which one to trust?
            // Usually explicit dates are anchors.
            // If we are filling a gap between A and B.
            // Forward fills A+1, A+2...
            // Backward fills B-1, B-2...
            // If they meet, great.
            // If this line has no date yet, use backward.
            if (!parsedLines[i].finalDate) {
                parsedLines[i].finalDate = nextDate - 1;
                nextDate--;
            }
        }
    }

    // Step 4: Extract Shifts
    const schedule = [];

    parsedLines.forEach(item => {
        if (!item.finalDate || !item.isRow || item.finalDate > 31 || item.finalDate < 1) return;

        // Determine columns
        let parts = item.text.split('|').map(p => p.trim());
        let shift = 0;

        // If explicit date, usually: Date | Day | Col1...
        if (item.explicitDate) {
            shift = 2;
        } else {
            // If inferred, usually: Col1 | Col2...
            // BUT, sometimes it's "DayName | Col1..." or just "Col1..."
            // Let's look for Day Name in parts[0]?
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];
            if (parts[0] && days.some(d => parts[0].toLowerCase().includes(d))) {
                shift = 1;
            }
        }

        const getPart = (index) => parts[index + shift];
        const assignments = [];

        if (isTevfik(getPart(0))) assignments.push({ location: "Room 201", time: "08:00 - 15:00" });
        if (isTevfik(getPart(1))) assignments.push({ location: "Room 214", time: "08:00 - 12:00" });
        if (isTevfik(getPart(2))) assignments.push({ location: "Room 214", time: "12:00 - 19:00" });
        if (isTevfik(getPart(3))) assignments.push({ location: "On Call", time: "24h" });
        if (isTevfik(getPart(4))) assignments.push({ location: "Abu Sidra", time: "13:00 - 21:00" });

        if (assignments.length > 0) {
            const existingIndex = schedule.findIndex(s => s.day === item.finalDate);
            if (existingIndex !== -1) {
                schedule[existingIndex].assignments.push(...assignments);
            } else {
                schedule.push({
                    day: item.finalDate,
                    dayName: "",
                    assignments: assignments
                });
            }
        }
    });

    return schedule;
}

// Main function
async function main() {
    const drive = await getDriveClient();
    if (!drive) return;

    const file = await getLatestImage(drive);
    if (!file) {
        console.log("No file to process.");
        return;
    }

    // Determine extension
    const ext = file.mimeType === 'image/png' ? '.png' : '.jpg';
    const localPath = TEMP_IMG_PATH + ext;

    console.log(`Downloading ${file.name}...`);
    await downloadFile(drive, file.id, localPath);

    console.log("Extracting text with OCR...");
    try {
        const text = await extractTextFromImage(localPath);
        fs.writeFileSync('debug_ocr.txt', text); // Save raw text for debugging
        const schedule = parseSchedule(text);

        const result = {
            lastUpdated: new Date().toISOString(),
            sourceFile: file.name,
            fileLink: file.webViewLink,
            fileId: file.id,
            schedule: schedule
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
        console.log(`Schedule info saved to ${OUTPUT_FILE}`);
    } catch (error) {
        console.error("Error extracting text:", error);
    }

    // Cleanup
    if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
    }
}

main();
