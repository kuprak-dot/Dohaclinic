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

    const lines = text.split('\n');
    const schedule = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-12 (Next month usually)

    // Helper to clean text
    const clean = (str) => str ? str.trim().toLowerCase() : '';

    // Helper to check if text contains Dr. Tevfik
    const isTevfik = (str) => {
        const s = clean(str);
        return s.includes('tevfik') || s.includes('revfik') || s.includes('tevfık');
    };

    lines.forEach(line => {
        // Look for lines starting with a number (date)
        // Regex: starts with optional (, digit(s), optional |, word
        const match = line.match(/^\(?\s*(\d+)\s*\|?/);
        if (!match) return;

        const day = parseInt(match[1]);
        if (isNaN(day) || day < 1 || day > 31) return;

        // Split by pipe | or multiple spaces
        // OCR might miss pipes, so we might need to be flexible. 
        // For now, let's rely on pipes if present, or try to split by large gaps.
        // The preview showed pipes: "(14| Sunday | Drirevfik..."

        let parts = line.split('|');
        if (parts.length < 3) {
            // Fallback: split by multiple spaces?
            // parts = line.split(/\s{2,}/);
        }

        // Normalize parts
        parts = parts.map(p => p.trim());

        // Expected Columns (approximate):
        // 0: Date (e.g. "14")
        // 1: Day (e.g. "Sunday")
        // 2: Room 201 (08:00 - 15:00)
        // 3: Room 214 (08:00 - 12:00)
        // 4: Room 214 (12:00 - 19:00)
        // 5: On Call
        // 6: Abu Sidra

        // We need to find where Tevfik is.
        // Note: parts[0] is date, parts[1] is day. So assignments start at parts[2].

        const assignments = [];

        if (parts[2] && isTevfik(parts[2])) {
            assignments.push({ location: "Room 201", time: "08:00 - 15:00" });
        }
        if (parts[3] && isTevfik(parts[3])) {
            assignments.push({ location: "Room 214", time: "08:00 - 12:00" });
        }
        if (parts[4] && isTevfik(parts[4])) {
            assignments.push({ location: "Room 214", time: "12:00 - 19:00" });
        }
        if (parts[5] && isTevfik(parts[5])) {
            assignments.push({ location: "On Call", time: "24h" });
        }
        if (parts[6] && isTevfik(parts[6])) {
            assignments.push({ location: "Abu Sidra", time: "13:00 - 21:00" });
        }

        if (assignments.length > 0) {
            schedule.push({
                day: day,
                dayName: parts[1] || '',
                assignments: assignments
            });
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
