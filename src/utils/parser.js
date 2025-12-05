import * as Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export const parseScheduleFile = async (file, targetName = "Tevfik") => {
    console.log(`Processing file: ${file.name}, looking for: ${targetName}`);
    let text = "";

    if (file.type === "application/pdf") {
        text = await extractTextFromPDF(file);
    } else if (file.type.startsWith("image/")) {
        text = await extractTextFromImage(file);
    } else if (
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel" ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
    ) {
        text = await extractTextFromExcel(file);
    } else {
        throw new Error("Unsupported file type. Please upload PDF, JPG, or Excel.");
    }

    return parseScheduleText(text, targetName);
};

const extractTextFromImage = async (file) => {
    console.log("Starting OCR on image...");
    const { data: { text } } = await Tesseract.recognize(
        file,
        'tur+eng',
        { logger: m => console.log(m) }
    );
    return text;
};

const extractTextFromPDF = async (file) => {
    console.log("Extracting text from PDF...");
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);
    const pdf = await loadingTask.promise;

    let fullText = "";

    // First, try standard text extraction
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    // If text is too short, assume it's a scanned PDF and use OCR
    if (fullText.trim().length < 50) {
        console.log("PDF appears scanned, switching to OCR...");
        fullText = ""; // Reset

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // Scale up for better OCR

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // Run OCR on the canvas
            const { data: { text } } = await Tesseract.recognize(
                canvas,
                'tur+eng'
            );
            fullText += text + '\n';
        }
    }

    return fullText;
};

const extractTextFromExcel = async (file) => {
    console.log("Extracting text from Excel...");
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to CSV text to reuse the text parser logic
    // or we could write a custom excel parser. For simplicity, text conversion first.
    return XLSX.utils.sheet_to_csv(worksheet, { FS: '|' });
};

// Adapted from fetch_schedule.js
export const parseScheduleText = (text, targetName) => {
    console.log("Parsing schedule text...");
    const rawLines = text.split('\n').filter(l => l.trim().length > 0);
    const schedule = [];

    // Helper to clean text
    const clean = (str) => str ? str.trim().toLowerCase() : '';

    const isTargetName = (str) => {
        const s = clean(str);
        const target = clean(targetName);
        // Simple check + common OCR typos for "Tevfik" if target is Tevfik
        if (target === 'tevfik') {
            return s.includes('tevfik') || s.includes('revfik') || s.includes('tevfık') || s.includes('tevflk') ||
                s.includes('at vik') || s.includes('atvik') || s.includes('vik') || s.includes('deevfik');
        }
        return s.includes(target);
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
    let currentFoundDate = null; // Track date to help inference

    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        let explicitDate = null;
        let dayNameIndex = null;

        const lowerLine = line.toLowerCase();
        for (const day of days) {
            if (lowerLine.includes(day)) {
                dayNameIndex = dayMap[day];
                break;
            }
        }

        // Regex for date: look for number at start or before pipe
        // Matches "8 |", "(8 |", "08|", etc.
        let dateMatch = line.match(/^\(?\s*([0-9il]+)\)?\s*[|]/);

        if (!dateMatch) {
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

        const hasPipes = line.includes('|') || line.includes(';'); // CSV might use ;
        // We consider it a data row if it has a date OR (pipes AND check for name/day)
        const isDataRow = explicitDate || (hasPipes);

        if (isDataRow) {
            parsedLines.push({
                text: line,
                explicitDate,
                dayNameIndex,
                assignedDate: null,
                lineIndex: i
            });
        }
    }

    // Step 2: Assign dates logic (same as original basically)
    let lastDate = 0;

    // Naive forward pass for dates
    parsedLines.forEach(row => {
        if (row.explicitDate) {
            lastDate = row.explicitDate;
            row.assignedDate = lastDate;
        } else if (lastDate > 0) {
            // Very simple inference: if we hit a new row w/o date, is it next day?
            // Actually, in the schedule, rows are usually days.
            // If explicit date missing, it might be same day continuation OR next day?
            // If it has day name, we can check.
            row.assignedDate = lastDate + 1; // Simplify: assume sequential if missing
            lastDate = row.assignedDate;
        }
    });

    // Now extract shifts
    parsedLines.forEach(item => {
        if (!item.assignedDate) return;

        // Split by pipe or semicolon (CSV)
        const separator = item.text.includes('|') ? '|' : (item.text.includes(';') ? ';' : ',');
        const parts = item.text.split(separator).map(p => p.trim());

        let assignments = [];

        // Logic to find column. Original logic was specific to Column offsets.
        // We will try a more generic approach: check ALL parts for name.
        // If found, try to map index to location if possible, or just default to "Shift".

        parts.forEach((part, index) => {
            if (isTargetName(part)) {
                // Map known indices from Doha Clinic schedule format
                // 0 or 1 is usually Room 201/214 AM
                // 2 is Room 214 PM
                // 3 is On Call
                // 4 is Abu Sidra
                // This is very fragile if format changes or image shift.
                // Let's try to be smart with "header" detection if we had it, but we don't.
                // We will stick to the hardcoded mapping but relax it.

                let location = "Shift";
                let time = "08:00 - 16:00";

                // Heuristic based on typical position in parts array
                // The date/day usually takes 1 or 2 slots at start.
                // If parts starts with date, index 0 is date.

                // Effective index (skipping date columns)
                let effectiveIndex = index;
                if (item.explicitDate || (parts[0] && parseInt(parts[0]))) effectiveIndex -= 1;
                if (parts[1] && days.some(d => parts[1].toLowerCase().includes(d))) effectiveIndex -= 1;

                if (effectiveIndex === 0) { location = "Room 201"; time = "08:00 - 15:00"; }
                else if (effectiveIndex === 1) { location = "Room 214"; time = "08:00 - 12:00"; }
                else if (effectiveIndex === 2) { location = "Room 214"; time = "12:00 - 19:00"; }
                else if (effectiveIndex === 3) { location = "On Call"; time = "24h"; }
                else if (effectiveIndex === 4) { location = "Abu Sidra"; time = "13:00 - 21:00"; }
                else {
                    // Fallback
                    if (part.toLowerCase().includes("call")) { location = "On Call"; time = "24h"; }
                    else if (part.toLowerCase().includes("sidra")) { location = "Abu Sidra"; time = "13:00 - 21:00"; }
                    else { location = "Hospital Duty"; }
                }

                assignments.push({ location, time });
            }
        });

        if (assignments.length > 0) {
            schedule.push({
                day: item.assignedDate,
                assignments
            });
        }
    });

    return schedule;
};

export const generateICS = (scheduleEvents) => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DohaClinic//Schedule//EN\n";

    scheduleEvents.forEach(daySchedule => {
        daySchedule.assignments.forEach(event => {
            // Calculate date
            const today = new Date();
            let eventDate = new Date(today.getFullYear(), today.getMonth(), daySchedule.day);

            // If day has passed this month, assume next month
            if (daySchedule.day < today.getDate() - 5) {
                eventDate.setMonth(eventDate.getMonth() + 1);
            }

            const dateString = eventDate.toISOString().replace(/[-:]/g, '').split('T')[0];

            // Time parsing
            let startTime = "080000";
            let endTime = "170000";

            if (event.time === "24h") {
                startTime = "080000";
                endTime = "080000";
            } else {
                const times = event.time.split('-').map(t => t.trim());
                if (times.length === 2) {
                    startTime = times[0].replace(':', '') + "00";
                    endTime = times[1].replace(':', '') + "00";
                }
            }

            // Add visual markers for special shifts
            let title = `Dr. Tevfik - ${event.location}`;
            if (event.location === "On Call") {
                title = `🔴 NÖBET - On Call`;
            } else if (event.location === "Abu Sidra") {
                title = `🏥 ABU SIDRA`;
            }

            icsContent += "BEGIN:VEVENT\n";
            icsContent += `SUMMARY:${title}\n`;

            if (event.time === "24h") {
                icsContent += `DTSTART;VALUE=DATE:${dateString}\n`;
            } else {
                icsContent += `DTSTART:${dateString}T${startTime}\n`;
                icsContent += `DTEND:${dateString}T${endTime}\n`;
            }

            icsContent += `LOCATION:${event.location}\n`;
            icsContent += `DESCRIPTION:Duty at ${event.location} (${event.time})\n`;
            icsContent += "END:VEVENT\n";
        });
    });

    icsContent += "END:VCALENDAR";
    return icsContent;
};
