import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'swap.log');

export const logToFile = (message: string, debug: boolean = true) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    if (debug) {
        fs.appendFileSync(LOG_FILE, logMessage);
    }
};

export const logEnd = (debug: boolean = true) => {
    if (!debug) {
        return;
    }
    logToFile(
        '================================================================================',
    );
    logToFile('\n');
    logToFile(
        '================================================================================',
    );
    logToFile('\n');
    logToFile(
        '================================================================================',
    );
    logToFile('\n');
};
