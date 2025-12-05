import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const FOLDER_NAME = 'Doha_Schedules';

async function listFiles() {
    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    const drive = google.drive({ version: 'v3', auth });

    // Find folder
    const folderRes = await drive.files.list({
        q: `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
    });

    if (folderRes.data.files.length === 0) {
        console.log('Folder not found');
        return;
    }

    const folderId = folderRes.data.files[0].id;

    // List all files
    const filesRes = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        orderBy: 'createdTime desc',
        fields: 'files(id, name, mimeType, createdTime)',
    });

    console.log('Files in Doha_Schedules folder:\n');
    filesRes.data.files.forEach(file => {
        console.log(`- ${file.name}`);
        console.log(`  Type: ${file.mimeType}`);
        console.log(`  Created: ${file.createdTime}\n`);
    });
}

listFiles();
