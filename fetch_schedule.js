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

    // Step 1: Parse ALL lines and identify data rows
    const parsedLines = [];

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];

        // Check for explicit date - handles "(8 | Monday" and "i2 Friday"
        let explicitDate = null;

        // Pattern 1: Date with pipe "(8 | Monday"
        let dateMatch = line.match(/^\(?\s*([0-9il]+)\s*[|]/);
        if (!dateMatch) {
            // Pattern 2: Date followed by day name "i2 Friday", "12 Saturday", etc
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];
            for (const day of days) {
                const pattern = new RegExp(`^\\(?\\s*([0-9il]+)\\s+${day}`, 'i');
                dateMatch = line.match(pattern);
                if (dateMatch) break;
            }
        }

        if (dateMatch) {
            let dateStr = dateMatch[1].replace(/i/g, '1').replace(/l/g, '1');
            const day = parseInt(dateStr);
            if (!isNaN(day) && day >= 1 && day <= 31) {
                explicitDate = day;
            }
        }

        // Check if this is a data row (has pipes and might have doctor names)
        const hasPipes = line.includes('|');
        const hasDrNames = /dr[.\s]/i.test(line) || /or[.\s]/i.test(line);
        const isDataRow = hasPipes && (hasDrNames || explicitDate);

        if (isDataRow) {
            parsedLines.push({
                text: line,
                explicitDate,
                assignedDate: null,  // Will assign in next step
                lineIndex: i
            });
        }
    }

    // Step 2: Assign dates to all data rows
    // Forward pass: assign dates after explicit dates
    let currentDate = 0;
    for (let i = 0; i < parsedLines.length; i++) {
        if (parsedLines[i].explicitDate) {
            currentDate = parsedLines[i].explicitDate;
            parsedLines[i].assignedDate = currentDate;
        } else if (currentDate > 0) {
            currentDate++;
            parsedLines[i].assignedDate = currentDate;
        }
    }

    // Backward pass: assign dates before first explicit date
    // Work backward from the first explicit date
    const firstExplicitIndex = parsedLines.findIndex(p => p.explicitDate);
    if (firstExplicitIndex > 0) {
        let backwardDate = parsedLines[firstExplicitIndex].explicitDate - 1;
        for (let i = firstExplicitIndex - 1; i >= 0; i--) {
            if (backwardDate >= 1) {
                parsedLines[i].assignedDate = backwardDate;
                backwardDate--;
            }
        }
    }

    // Extract shifts from parsed lines
    const schedule = [];

    parsedLines.forEach(item => {
        if (!item.assignedDate || item.assignedDate < 1 || item.assignedDate > 31) return;

        const parts = item.text.split('|').map(p => p.trim());
        let columnOffset = 0;

        // Determine column offset based on line structure
        if (item.explicitDate) {
            // Line starts with date, usually: (Date | Day | Col0 | Col1 | Col2 | Col3 | Col4)
            columnOffset = 2;
        } else {
            // No date marker - could be continuation or just data
            // Check if first part is a day name
            const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
                'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];
            if (parts[0] && days.some(d => parts[0].toLowerCase().includes(d))) {
                columnOffset = 1;
            } else {
                columnOffset = 0;
            }
        }

        const assignments = [];

        // Check each column for Dr. Tevfik
        // Column mapping: 0=Room 201, 1=Room 214 (8am-12pm), 2=Room 214 (12pm-7pm), 3=On Call, 4=Abu Sidra
        for (let col = 0; col < 5; col++) {
            const partIndex = columnOffset + col;
            if (partIndex < parts.length && isTevfik(parts[partIndex])) {
                switch (col) {
                    case 0:
                        assignments.push({ location: "Room 201", time: "08:00 - 15:00" });
                        break;
                    case 1:
                        assignments.push({ location: "Room 214", time: "08:00 - 12:00" });
                        break;
                    case 2:
                        assignments.push({ location: "Room 214", time: "12:00 - 19:00" });
                        break;
                    case 3:
                        assignments.push({ location: "On Call", time: "24h" });
                        break;
                    case 4:
                        assignments.push({ location: "Abu Sidra", time: "13:00 - 21:00" });
                        break;
                }
            }
        }

        if (assignments.length > 0) {
            const existingIndex = schedule.findIndex(s => s.day === item.assignedDate);
            if (existingIndex !== -1) {
                // Merge assignments for the same day
                schedule[existingIndex].assignments.push(...assignments);
            } else {
                schedule.push({
                    day: item.assignedDate,
                    dayName: "",
                    assignments: assignments
                });
            }
        }
    });

    return schedule.sort((a, b) => a.day - b.day);
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
