const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
    const dataPath = path.join(process.cwd(), 'public', 'schedule.json');

    try {
        if (fs.existsSync(dataPath)) {
            const data = fs.readFileSync(dataPath, 'utf8');
            res.status(200).json(JSON.parse(data));
        } else {
            // If no data file exists, return default/empty structure
            res.status(200).json({
                lastUpdated: null,
                schedule: []
            });
        }
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
}
