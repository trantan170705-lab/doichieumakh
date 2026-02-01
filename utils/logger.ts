/**
 * Centralized logger for the application.
 * 
 * USER CONFIGURATION:
 * Change the value of ENABLE_LOGS below to turn debug logs ON or OFF.
 * - true:  Logs will appear in the browser console.
 * - false: Logs are hidden (Clean console).
 */

export const ENABLE_LOGS = true;

export const log = (tag: string, message: string, ...args: any[]) => {
    if (ENABLE_LOGS) {
        console.log(`[${tag}] ${message}`, ...args);
    }
};

export const error = (tag: string, message: string, ...args: any[]) => {
    // Always log errors, regardless of debug setting
    console.error(`[${tag}] ${message}`, ...args);
};
