import { LOG_FILE } from './constants.ts';
import fs from 'fs';

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
    logToFile(
        '================================================================================',
    );
    logToFile(
        '================================================================================',
    );
};
