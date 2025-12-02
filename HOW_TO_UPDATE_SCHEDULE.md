# How to Update the Schedule

This guide explains how to update the Doha Clinic App schedule for future months.

## Method 1: Manual Update (Recommended)

Since the automatic Google Drive fetching requires specific folder permissions, the most reliable way to update the schedule is by manually editing the `schedule.json` file.

1.  **Open the Project**: Navigate to the project folder on your computer.
2.  **Locate the File**: Go to `public/schedule.json`.
3.  **Edit the File**: Open `schedule.json` in a text editor (like VS Code, Notepad, or TextEdit).
4.  **Update the Data**:
    *   Find the `schedule` array.
    *   Update the `day` (day of the month), `dayName` (e.g., "Pzt", "Sal"), and `assignments` for each day.
    *   **Example Format**:
        ```json
        {
          "day": 1,
          "dayName": "Pzt",
          "assignments": [
            { "location": "Abu Sidra", "time": "13:00 - 21:00" }
          ]
        }
        ```
5.  **Save**: Save the file. The app will automatically show the new schedule.

## Method 2: Automatic Fetching (Requires Setup)

If you want to use the automatic PDF fetching feature:

1.  **Google Drive Folder**: Create a folder named `Doha_Schedules` in your Google Drive.
2.  **Share Folder**: Share this folder with the service account email found in `google-credentials.json` (inside the `client_email` field).
3.  **Upload PDF**: Upload the monthly schedule PDF into this folder.
4.  **Run Script**: Open a terminal in the project folder and run:
    ```bash
    node fetch_schedule.cjs
    ```
5.  **Check App**: If successful, the script will update `public/schedule.json` automatically.

## Tips
*   **Abu Sidra Hours**: Remember that Abu Sidra shifts are typically `13:00 - 21:00`.
*   **On Call**: Use `24h` for the time duration.
