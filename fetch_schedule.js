import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Tesseract from 'tesseract.js';
import { createCanvas, loadImage } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const FOLDER_NAME = 'Doha_Schedules';
const OUTPUT_FILE = path.join(__dirname, 'public/schedule.json');
const TEMP_IMG_PATH = path.join(__dirname, 'temp_schedule_img'); // No extension yet

// Preprocess image for better OCR
async function preprocessImage(inputPath, outputPath) {
    console.log(`Preprocessing image for better OCR...`);
    try {
        const image = await loadImage(inputPath);

        // Scale up by 2.5x for better OCR
        const scale = 2.5;
        const width = image.width * scale;
        const height = image.height * scale;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Draw scaled image
        ctx.drawImage(image, 0, 0, width, height);

        // Get image data for pixel manipulation
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Convert to grayscale and binarize
        const threshold = 160;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Grayscale (luminance)
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Binarization
            const val = gray > threshold ? 255 : 0;

            data[i] = val;
            data[i + 1] = val;
            data[i + 2] = val;
        }

        ctx.putImageData(imageData, 0, 0);

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);
        console.log(`Processed image saved to ${outputPath}`);
        return true;
    } catch (error) {
        console.error("Error preprocessing image:", error);
        return false;
    }
}

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

// Find the latest file (PDF only) in the target folder
async function getLatestFile(drive) {
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

        // 2. Search for PDF and Image files
        const filesRes = await drive.files.list({
            q: `'${folderId}' in parents and (mimeType = 'application/pdf' or mimeType = 'image/jpeg' or mimeType = 'image/png') and trashed = false`,
            orderBy: 'createdTime desc',
            pageSize: 1,
            fields: 'files(id, name, mimeType, webContentLink, webViewLink, createdTime)',
        });

        if (filesRes.data.files.length > 0) {
            const file = filesRes.data.files[0];
            console.log(`Found latest file: ${file.name} (${file.mimeType}, ${file.createdTime})`);
            return file;
        }

        console.log("No schedule files (PDF/JPG/PNG) found in the folder.");
        return null;

    } catch (error) {
        console.error("Error finding file:", error.message);
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

// Extract text from PDF (handles scanned PDFs with OCR)
async function extractTextFromPDF(pdfPath) {
    console.log("Extracting text from PDF...");
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument(data);
    const pdfDocument = await loadingTask.promise;

    // Try text extraction first
    let fullText = '';
    for (let i = 1; i <= pdfDocument.numPages; i++) {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    console.log(`Extracted ${fullText.length} characters using text extraction`);

    // If very little text (likely scanned PDF), convert to image and use OCR
    if (fullText.trim().length < 50) {
        console.log("PDF appears to be scanned. Converting to image for OCR...");

        // Use imagemagick/ghostscript to convert PDF to PNG
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const outputImagePath = pdfPath.replace('.pdf', '.png');

        try {
            // Try using magick (ImageMagick) or convert
            await execAsync(`magick convert -density 300 "${pdfPath}" "${outputImagePath}"`).catch(async () => {
                // Fallback to convert command
                await execAsync(`convert -density 300 "${pdfPath}" "${outputImagePath}"`);
            });

            console.log("PDF converted to image. Running OCR...");
            const { data: { text } } = await Tesseract.recognize(
                outputImagePath,
                'eng+tur',
                { logger: m => console.log(m.status) }
            );

            fullText = text;

            // Clean up converted image
            if (fs.existsSync(outputImagePath)) {
                fs.unlinkSync(outputImagePath);
            }

            console.log(`OCR extracted ${fullText.length} characters`);
        } catch (error) {
            console.error("Failed to convert PDF to image:", error.message);
            console.log("Falling back to direct OCR on PDF (this may not work well)");

            // Last resort: try OCR directly on PDF
            const { data: { text } } = await Tesseract.recognize(
                pdfPath,
                'eng+tur',
                { logger: m => console.log(m.status) }
            );
            fullText = text;
        }
    }

    return fullText;
}

// Parse Schedule
function parseSchedule(text) {
    console.log("--- Extracted Text Preview ---");
    console.log(text.substring(0, 500) + "...");
    console.log("------------------------------");

    const rawLines = text.split('\n').filter(l => l.trim().length > 0);

    // Helper to clean text
    const clean = (str) => str ? str.trim().toLowerCase() : '';

    const isTevfik = (str) => {
        const s = clean(str);
        return s.includes('tevfik') || s.includes('revfik') || s.includes('tevfık') || s.includes('tevflk') ||
            s.includes('at vik') || s.includes('atvik') || s.includes('vik') || s.includes('deevfik');
    };

    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi', 'pazar'];

    const dayMap = {
        'monday': 0, 'pazartesi': 0,
        'tuesday': 1, 'sali': 1,
        'wednesday': 2, 'carsamba': 2,
        'thursday': 3, 'persembe': 3,
        'friday': 4, 'cuma': 4,
        'saturday': 5, 'cumartesi': 5,
        'sunday': 6, 'pazar': 6
    };

    // Step 1: Parse ALL lines and identify data rows
    const parsedLines = [];

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        let explicitDate = null;
        let dayNameIndex = null;

        // Extract Day Name
        const lowerLine = line.toLowerCase();
        for (const day of days) {
            if (lowerLine.includes(day)) {
                dayNameIndex = dayMap[day];
                break;
            }
        }

        // Check for explicit date
        // Pattern 1: Date with pipe "(8 |" or "8 |" or "8) |"
        // Improved regex to handle closing parenthesis
        let dateMatch = line.match(/^\(?\s*([0-9il]+)\)?\s*[|]/);

        if (!dateMatch) {
            // Pattern 2: Date followed by day name "i2 Friday", "12 Saturday", etc
            for (const day of days) {
                const pattern = new RegExp(`^\\(?\\s*([0-9il]+)\\)?\\s+${day}`, 'i');
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
        // We consider it a data row if it has a date OR (pipes AND (dr names OR day name))
        const isDataRow = explicitDate || (hasPipes && (hasDrNames || dayNameIndex !== null));

        if (isDataRow) {
            parsedLines.push({
                text: line,
                explicitDate,
                dayNameIndex,
                assignedDate: null,  // Will assign in next step
                lineIndex: i
            });
        }
    }

    // Step 2: Assign dates to all data rows
    // Forward pass: assign dates after explicit dates
    let lastDate = 0;
    let lastDayIndex = -1;

    for (let i = 0; i < parsedLines.length; i++) {
        const row = parsedLines[i];
        let newDate = null;

        if (row.explicitDate) {
            // We have an explicit date. Let's see if it's consistent.
            if (lastDate > 0 && row.dayNameIndex !== null && lastDayIndex !== -1) {
                // Calculate expected date based on day difference
                let diff = row.dayNameIndex - lastDayIndex;
                if (diff <= 0) diff += 7;

                const expectedDate = lastDate + diff;

                // Check consistency with day name (modulo 7)
                const dateDiff = row.explicitDate - expectedDate;

                if (dateDiff >= 0 && dateDiff % 7 === 0) {
                    // Consistent with day name (could be same week or future week)
                    newDate = row.explicitDate;
                } else {
                    // Inconsistent. Assume typo and use expected.
                    console.log(`Correction: Line "${row.text}" explicit ${row.explicitDate} -> inferred ${expectedDate} (based on ${lastDate} + ${diff}, explicit was inconsistent)`);
                    newDate = expectedDate;
                }
            } else {
                newDate = row.explicitDate;
            }
        } else {
            // No explicit date. Infer from lastDate.
            if (lastDate > 0) {
                if (row.dayNameIndex !== null && lastDayIndex !== -1) {
                    // Use day name difference
                    let diff = row.dayNameIndex - lastDayIndex;
                    if (diff <= 0) diff += 7;
                    newDate = lastDate + diff;
                } else {
                    // Just increment
                    newDate = lastDate + 1;
                }
            }
        }

        if (newDate) {
            row.assignedDate = newDate;
            lastDate = newDate;
            if (row.dayNameIndex !== null) {
                lastDayIndex = row.dayNameIndex;
            } else {
                // Try to infer day index from date? 
                lastDayIndex = (lastDayIndex + 1) % 7;
            }
        }
    }

    // Backward pass: assign dates before first explicit date
    const firstAssignedIndex = parsedLines.findIndex(p => p.assignedDate);
    if (firstAssignedIndex > 0) {
        let nextDate = parsedLines[firstAssignedIndex].assignedDate;
        let nextDayIndex = parsedLines[firstAssignedIndex].dayNameIndex;

        // If nextDayIndex is null, try to infer it from nextDate if we knew the month... but we don't.
        // So we just rely on simple decrement if day name is missing.

        for (let i = firstAssignedIndex - 1; i >= 0; i--) {
            const row = parsedLines[i];
            let newDate;

            if (row.dayNameIndex !== null && nextDayIndex !== null) {
                let diff = nextDayIndex - row.dayNameIndex;
                if (diff <= 0) diff += 7;
                newDate = nextDate - diff;
            } else {
                newDate = nextDate - 1;
            }

            if (newDate >= 1) {
                row.assignedDate = newDate;
                nextDate = newDate;
                if (row.dayNameIndex !== null) nextDayIndex = row.dayNameIndex;
                else nextDayIndex = (nextDayIndex - 1 + 7) % 7;
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
            if (parts[0] && days.some(d => parts[0].toLowerCase().includes(d))) {
                columnOffset = 1;
            } else {
                columnOffset = 0;
            }
        }

        const assignments = [];

        // Debug: Check if Tevfik is in the raw line but not being picked up due to column logic
        if (isTevfik(item.text)) {
            console.log(`DEBUG: Found Tevfik in line ${item.lineIndex} (Date: ${item.assignedDate}): "${item.text}"`);
            console.log(`DEBUG: Parts: ${JSON.stringify(parts)}, Offset: ${columnOffset}`);
        }

        // If pipes are missing, try splitting by double spaces or just spaces if desperate?
        // But spaces are used in names. Double spaces might work.
        if (parts.length < 2 && item.text.includes('  ')) {
            const spaceParts = item.text.split(/\s{2,}/);
            if (spaceParts.length > parts.length) {
                // Use space parts but we need to be careful about the offset
                // If we split by spaces, we lose the pipe structure. 
                // But maybe we can map them to columns?
                // Let's just append them to parts to increase chances of hitting the loop?
                // Or better, just iterate over them if the main loop failed.
            }
        }

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

        // Fallback: If Tevfik is in the text but we couldn't assign a column (e.g. missing pipes)
        if (assignments.length === 0 && isTevfik(item.text)) {
            console.log(`Fallback: Found Tevfik in line ${item.lineIndex} but no column match. Adding generic assignment.`);
            // Try to guess based on position in string? 
            // If it's at the end, maybe On Call?
            // For now, just generic.
            assignments.push({ location: "Scheduled (Check Image)", time: "See Schedule" });
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

    const file = await getLatestFile(drive);
    if (!file) {
        console.log("No suitable schedule file to process. Aborting.");
        return;
    }

    const isPDF = file.mimeType === 'application/pdf';
    const ext = isPDF ? '.pdf' : (file.mimeType === 'image/png' ? '.png' : '.jpg');
    const localPath = (isPDF ? path.join(__dirname, 'temp_schedule') : TEMP_IMG_PATH) + ext;

    console.log(`Downloading ${file.name}...`);
    await downloadFile(drive, file.id, localPath);

    let ocrPath = localPath;
    let processedPath = null;

    // If it's an image, preprocess it
    if (!isPDF) {
        processedPath = path.join(__dirname, 'temp_processed_schedule.png');
        const success = await preprocessImage(localPath, processedPath);
        if (success) {
            ocrPath = processedPath;
        }
    }

    console.log(`Extracting text from ${isPDF ? 'PDF' : 'image'}...`);
    try {
        const text = isPDF ?
            await extractTextFromPDF(localPath) :
            await extractTextFromImage(ocrPath);

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
        console.log(`Found ${schedule.length} days with shifts`);
    } catch (error) {
        console.error("Error extracting text:", error);
    }

    // Cleanup
    if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
    }
    if (processedPath && fs.existsSync(processedPath)) {
        fs.unlinkSync(processedPath);
    }
}

main();
