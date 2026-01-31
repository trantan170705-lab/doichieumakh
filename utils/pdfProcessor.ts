import * as pdfjsLib from 'pdfjs-dist';
import { EnrichedCodeData } from '../types';

// Use CDN for worker to ensure it loads correctly in dev/build without complex config
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export const readPdfText = async (file: File, password?: string): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();

    try {
        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            password: password,
        });

        const pdf = await loadingTask.promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => item.str)
                .join(' ');
            fullText += pageText + '\n';
        }

        return fullText;

    } catch (error: any) {
        if (error.name === 'PasswordException') {
            throw new Error('PASSWORD_REQUIRED');
        }
        console.error("Error reading PDF:", error);
        throw error;
    }
};

export const extractCodesFromText = (text: string): string[] => {
    // Regex to find X followed by 6 digits (case insensitive)
    const regex = /[xX]\d{6}/g;
    const matches = text.match(regex);

    if (!matches) return [];

    // Normalize to Upper Case and unique
    const uniqueCodes = new Set(matches.map(code => code.toUpperCase()));
    return Array.from(uniqueCodes);
};

/**
 * Extract enriched data from PDF text.
 * Parses transactions to get: Code, Credit Amount, Description
 * 
 * Example text pattern:
 * "REM Tfr Ac:7010519754 O@L_193001_212001_0_0_1302915972 _x029302_KH:PHAN XUAN QUI, SODB:X029302 TT TIEN NUOC THANG:1 - NAM:2026, SOTIEN: 62860"
 */
export const extractEnrichedDataFromPdf = (fullText: string): EnrichedCodeData[] => {
    const results: EnrichedCodeData[] = [];
    const processedCodes = new Set<string>();

    // Pattern to find customer code (X followed by 6 digits)
    const codeRegex = /[xX]\d{6}/g;

    // Split text into lines/chunks for processing
    const transactions = fullText.split(/(?=REM\s+Tfr)/i);

    for (const transaction of transactions) {
        if (!transaction.trim()) continue;

        // Find code in this transaction
        const codeMatches = transaction.match(codeRegex);
        if (!codeMatches || codeMatches.length === 0) continue;

        const code = codeMatches[0].toUpperCase();

        // Skip if already processed
        if (processedCodes.has(code)) continue;
        processedCodes.add(code);

        // Extract amount - look for SOTIEN: pattern
        // Example: "SOTIEN: 62860 42 26/01/2026" - we only want 62860
        let amount: string | undefined;

        // Match SOTIEN: followed by the first number (no spaces in the number)
        const sotienMatch = transaction.match(/SOTIEN:\s*([0-9,.]+)/i);
        if (sotienMatch) {
            // Parse as number: remove commas and take integer part
            const numStr = sotienMatch[1].trim().replace(/,/g, '');
            const numValue = parseFloat(numStr);
            if (!isNaN(numValue)) {
                amount = Math.round(numValue).toLocaleString('en-US');
            }
        }

        // Extract description - only the part from "KH:" to before ", SOTIEN:" or end
        let description: string | undefined;
        const descMatch = transaction.match(/KH:([^,]+),\s*SODB:[^\s]+\s+([^,]+)/i);
        if (descMatch) {
            // Format: "KH:NAME, SODB:CODE TT TIEN NUOC THANG:X - NAM:YYYY"
            const fullMatch = transaction.match(/KH:[^,]+,\s*SODB:[^\s]+\s+TT\s+TIEN\s+NUOC\s+THANG:\d+\s*-\s+NAM:\d+/i);
            if (fullMatch) {
                description = fullMatch[0];
            }
        }

        results.push({
            code,
            amount,
            description,
            source: 'pdf'
        });
    }

    return results;
};
