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

    // Detect Month and Year
    let detectedMonth = null;
    let detectedYear = null;

    const months = [
        { name: 'ocak', aliases: ['ocak', 'january', 'jan'], index: 0 },
        { name: 'subat', aliases: ['subat', 'şubat', 'february', 'feb'], index: 1 },
        { name: 'mart', aliases: ['mart', 'march', 'mar'], index: 2 },
        { name: 'nisan', aliases: ['nisan', 'april', 'apr'], index: 3 },
        { name: 'mayis', aliases: ['mayis', 'mayıs', 'may'], index: 4 },
        { name: 'haziran', aliases: ['haziran', 'june', 'jun'], index: 5 },
        { name: 'temmuz', aliases: ['temmuz', 'july', 'jul'], index: 6 },
        { name: 'agustos', aliases: ['agustos', 'ağustos', 'august', 'aug'], index: 7 },
        { name: 'eylul', aliases: ['eylul', 'eylül', 'september', 'sep'], index: 8 },
        { name: 'ekim', aliases: ['ekim', 'october', 'oct'], index: 9 },
        { name: 'kasim', aliases: ['kasim', 'kasım', 'november', 'nov'], index: 10 },
        { name: 'aralik', aliases: ['aralik', 'aralık', 'december', 'dec'], index: 11 }
    ];

    // Scan first 20 lines for month/year (headers usually)
    const headerText = rawLines.slice(0, 20).join(' ').toLowerCase();

    // Year
    const yearMatch = headerText.match(/202[4-9]/);
    if (yearMatch) {
        detectedYear = parseInt(yearMatch[0]);
    }

    // Month
    for (const m of months) {
        if (m.aliases.some(alias => headerText.includes(alias))) {
            detectedMonth = m.index;
            break;
        }
    }

    console.log(`Detected Date: Month=${detectedMonth}, Year=${detectedYear}`);

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

        // Flexible date detection:
        // 1. Full date match (DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY) anywhere in the line
        const fullDateMatch = line.match(/(\d{1,2})[./-](\d{1,2})[./-](202\d)/);
        if (fullDateMatch) {
            explicitDate = parseInt(fullDateMatch[1]);
            // Also try to update detectedMonth/Year if they are missing
            if (!detectedMonth) detectedMonth = parseInt(fullDateMatch[2]) - 1;
            if (!detectedYear) detectedYear = parseInt(fullDateMatch[3]);
        }

        if (!explicitDate) {
            // 2. Pattern: Date followed by pipe (optionally preceded by pipe/semicolon)
            // Matches "8 |", "| 8 |", ";8|", etc.
            let dateMatch = line.match(/(?:^|[|;])\s*\(?([0-9il]{1,2})\)?\s*[|;]/);

            if (!dateMatch) {
                // 3. Pattern: Date followed by day name
                for (const day of days) {
                    const pattern = new RegExp(`(?:^|[|;])\\s*\\(?([0-9il]{1,2})\\)?\\s+${day}`, 'i');
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
        }

        const hasPipes = line.includes('|') || line.includes(';');
        const isDataRow = explicitDate || (hasPipes);

        if (isDataRow) {
            // console.log(`Row ${i}: date=${explicitDate}, text="${line}"`); // Debug
            parsedLines.push({
                text: line,
                explicitDate,
                dayNameIndex,
                assignedDate: null,
                lineIndex: i
            });
        }
    }

    // Step 2: Assign dates logic
    let lastDate = 0;
    parsedLines.forEach(row => {
        if (row.explicitDate) {
            lastDate = row.explicitDate;
            row.assignedDate = lastDate;
        } else if (lastDate > 0) {
            row.assignedDate = lastDate + 1;
            lastDate = row.assignedDate;
        }
    });

    // Known shift patterns and their mappings
    const shiftMappings = [
        { keywords: ['201', 'am'], location: 'Room 201', time: '08:00 - 15:00' },
        { keywords: ['214', 'am'], location: 'Room 214', time: '08:00 - 12:00' },
        { keywords: ['214', 'pm', 'afternoon'], location: 'Room 214 (Afternoon)', time: '12:00 - 19:00' },
        { keywords: ['call', 'nobet', 'nöbet'], location: 'On Call', time: '24h' },
        { keywords: ['sidra'], location: 'Abu Sidra', time: '13:00 - 21:00' },
        { keywords: ['3pm', '10pm', '3-10'], location: 'Evening Shift', time: '15:00 - 22:00' },
        { keywords: ['12pm', '7pm', '12-7'], location: 'Afternoon Shift', time: '12:00 - 19:00' }
    ];

    // Helper to extract time from string if possible
    const extractTime = (str) => {
        const timePattern = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i;
        const match = str.match(timePattern);
        if (match) return `${match[1]} - ${match[2]}`;
        return null;
    };

    // Now extract shifts
    parsedLines.forEach(item => {
        if (!item.assignedDate) return;

        const separator = item.text.includes('|') ? '|' : (item.text.includes(';') ? ';' : ',');
        const parts = item.text.split(separator).map(p => p.trim());

        let assignments = [];

        // Find headers if this line looks like a header row (contains many locations)
        // But usually, we parse row by row.

        parts.forEach((part, index) => {
            if (isTargetName(part)) {
                let location = "Hospital Duty";
                let time = "08:00 - 15:00";

                // Detection logic:
                // 1. Check current part for time hints
                const timeInPart = extractTime(part);
                if (timeInPart) time = timeInPart;

                // 2. Map based on column index or keyword
                // Try to find a header or use the index-based mapping as a fallback
                // First, check if the header row above gave us clues (not implemented here yet)

                // Keyword search in the current column or surrounding context
                let effectiveIndex = index;
                if (parts[0] && (parseInt(parts[0]) || days.some(d => parts[0].toLowerCase().includes(d)))) effectiveIndex -= 1;
                if (parts[1] && (parseInt(parts[1]) || days.some(d => parts[1].toLowerCase().includes(d)))) effectiveIndex -= 1;
                effectiveIndex = Math.max(0, effectiveIndex);

                // Hardcoded fallback mapping for Doha Clinic typical Excel structure
                if (effectiveIndex === 0) { location = "Room 201"; time = "08:00 - 15:00"; }
                else if (effectiveIndex === 1) { location = "Room 214"; time = "08:00 - 12:00"; }
                else if (effectiveIndex === 2) { location = "Room 214 (Afternoon)"; time = "12:00 - 19:00"; }
                else if (effectiveIndex === 3) { location = "On Call"; time = "24h"; }
                else if (effectiveIndex === 4) { location = "Abu Sidra"; time = "13:00 - 21:00"; }

                // Override with better detection if possible
                // Look at the "part" itself for clues, or the header (if we could find it)
                // For now, let's use the part text to refine
                const lowerPart = part.toLowerCase();
                if (lowerPart.includes('201')) location = "Room 201";
                if (lowerPart.includes('214')) {
                    if (lowerPart.includes('pm') || lowerPart.includes('afternoon')) location = "Room 214 (Afternoon)";
                    else location = "Room 214";
                }
                if (lowerPart.includes('call') || lowerPart.includes('nobet') || lowerPart.includes('nöbet')) {
                    location = "On Call";
                    time = "24h";
                }
                if (lowerPart.includes('sidra')) {
                    location = "Abu Sidra";
                    time = "13:00 - 21:00";
                }

                // If part contains a specific time range like 3pm-10pm, use it
                const foundTime = extractTime(lowerPart);
                if (foundTime) time = foundTime;

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

    return {
        schedule,
        metadata: {
            month: detectedMonth,
            year: detectedYear
        }
    };
};

export const generateICS = (scheduleEvents) => {
    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//DohaClinic//Schedule//EN\n";

    scheduleEvents.forEach(daySchedule => {
        const today = new Date();
        // Use provided year/month if available, otherwise fallback to guessing logic
        let y = daySchedule.year !== undefined ? daySchedule.year : today.getFullYear();
        let m = daySchedule.month !== undefined ? daySchedule.month : today.getMonth();

        // Guessing logic fallback
        if (daySchedule.year === undefined || daySchedule.month === undefined) {
            if (daySchedule.day < today.getDate() - 5) {
                m++;
                if (m > 11) { m = 0; y++; }
            }
        }

        daySchedule.assignments.forEach(event => {
            let eventDate = new Date(y, m, daySchedule.day);
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
