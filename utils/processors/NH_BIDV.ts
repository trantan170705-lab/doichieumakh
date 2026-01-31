import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { readPdfText, extractCodesFromText } from '../pdfProcessor';
import { log, error as logError } from '../logger';

/**
 * Processor for NH BIDV (Excel files)
 * Returns SheetInfo[] if successful, or null if file doesn't match BIDV format
 */
export const processBIDVWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isBIDVFormat = false;

    log('BIDV', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('BIDV', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

        let extracted: string[] = [];
        const enrichedData: EnrichedCodeData[] = [];
        let error: string | undefined = undefined;
        let bankName: string | undefined;
        let transactionDate: string | undefined;

        if (!data || data.length === 0) {
            error = "Sheet rỗng";
        } else {
            // Find header row to locate columns
            let codeColIdx = -1;
            let amountColIdx = -1;
            let descColIdx = -1;
            let headerRowIdx = -1;
            let bankNameColIdx = -1;
            let transactionDateColIdx = -1;

            const formatExcelDate = (val: any): string | undefined => {
                if (typeof val === 'number' && val > 30000 && val < 60000) {
                    const date = XLSX.SSF.parse_date_code(val);
                    const d = date.d < 10 ? `0${date.d}` : date.d;
                    const m = date.m < 10 ? `0${date.m}` : date.m;
                    return `${d}/${m}/${date.y}`;
                }
                return undefined;
            };

            // Search for header row in first 50 rows
            for (let r = 0; r < Math.min(data.length, 50); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;



                for (let c = 0; c < row.length; c++) {
                    const rawCell = String(row[c] || '').toLowerCase();
                    const cell = rawCell.replace(/\s+/g, ' ').trim();

                    const isHeaderKeyword = (s: string) => {
                        const lower = s.toLowerCase();
                        return lower.includes('ngày thu') || lower === 'ngày' || lower.includes('số tiền') || lower.includes('mô tả') || lower.includes('ghi chú') || lower.includes('mã kh');
                    };

                    // Vertical Extraction Check
                    if (extractMetadata && bankNameColIdx !== -1 && c === bankNameColIdx && !bankName) {
                        const val = String(row[c] || '').trim();
                        if (val && !isHeaderKeyword(val) && !val.toLowerCase().includes('người thu')) {
                            bankName = val;
                        }
                    }
                    if (extractMetadata && transactionDateColIdx !== -1 && c === transactionDateColIdx && !transactionDate) {
                        const val = row[c];
                        const dateStr = formatExcelDate(val);
                        if (dateStr) {
                            transactionDate = dateStr;
                        } else {
                            const sVal = String(val || '').trim();
                            if (sVal && /\d/.test(sVal) && !isHeaderKeyword(sVal) && !sVal.toLowerCase().includes('ngày thu')) {
                                transactionDate = sVal;
                            }
                        }
                    }

                    if (extractMetadata) {
                        if (cell.includes('người thu') || cell.includes('nguoi thu')) {
                            bankNameColIdx = c;
                            const sameCellMatch = cell.match(/(?:người|nguoi)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && !isHeaderKeyword(val)) bankName = val;
                            } else if (c + 1 < row.length) {
                                const val = String(row[c + 1] || '').trim();
                                if (val && !isHeaderKeyword(val)) {
                                    bankName = val;
                                }
                            }
                        }
                        if (cell.includes('ngày thu') || cell.includes('ngay thu')) {
                            transactionDateColIdx = c;
                            const sameCellMatch = cell.match(/(?:ngày|ngay)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && /\d/.test(val) && !isHeaderKeyword(val)) transactionDate = val;
                            } else if (c + 1 < row.length) {
                                const val = row[c + 1];
                                const dateStr = formatExcelDate(val);
                                if (dateStr) {
                                    transactionDate = dateStr;
                                } else {
                                    const sVal = String(val || '').trim();
                                    if (sVal && /\d/.test(sVal) && !isHeaderKeyword(sVal)) {
                                        transactionDate = sVal;
                                    }
                                }
                            }
                        }
                    }

                    if (headerRowIdx === -1) {
                        // "Mã KH" -> Code
                        const lowerCell = cell.toLowerCase();
                        const isGenericCodeHeader = (lowerCell.includes('mã kh') || lowerCell === 'ma kh') && !lowerCell.includes('cif') && !lowerCell.includes('khách hàng');

                        if (isGenericCodeHeader) {
                            // Check for BIDV Branding
                            // Look in current row + lookahead 7 rows
                            let hasBranding = (bankName && bankName.toLowerCase().includes('bidv')) || cell.includes('bidv');

                            if (!hasBranding) {
                                // Check row content
                                const rowContent = row.map(x => String(x || '')).join(' ').toLowerCase();
                                if (rowContent.includes('bidv') || rowContent.includes('đầu tư và phát triển')) {
                                    hasBranding = true;
                                }
                            }

                            if (!hasBranding) {
                                // Lookahead
                                const maxLookahead = Math.min(data.length, r + 8);
                                for (let lr = r + 1; lr < maxLookahead; lr++) {
                                    const lRow = data[lr];
                                    if (Array.isArray(lRow)) {
                                        const lRowStr = lRow.map(x => String(x || '')).join(' ').toLowerCase();
                                        if (lRowStr.includes('bidv') || lRowStr.includes('đầu tư và phát triển')) {
                                            hasBranding = true;
                                            break;
                                        }
                                    }
                                }
                            }

                            if (hasBranding) {
                                log('BIDV', `Found Code column at ${c} ("${cell}") with branding.`);
                                codeColIdx = c;
                            } else {
                                log('BIDV', `Found 'Mã KH' but NO BIDV branding found. Skipping.`);
                            }
                        }

                        // Amount
                        if (cell.includes('số tiền') || cell.includes('so tien') || cell.includes('tổng tiền') || cell.includes('tong tien') || cell === 'amount') {
                            amountColIdx = c;
                        }
                        // Description
                        if (cell.includes('nội dung') || cell.includes('noi dung') || cell.includes('diễn giải') || cell.includes('dien giai') || cell.includes('ghi chú') || cell.includes('ghi chu') || cell === 'description') {
                            descColIdx = c;
                        }
                    }
                }

                if (codeColIdx !== -1 && headerRowIdx === -1) {
                    headerRowIdx = r;
                    isBIDVFormat = true;
                    log('BIDV', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}`);
                    // Removed break
                }
            }

            if (headerRowIdx === -1) {
                log('BIDV', `Header NOT found in sheet ${sheetName}`);
                // Continue to next sheet
                return;
            }

            // Scan for data
            const startRow = headerRowIdx + 1;
            for (let r = startRow; r < data.length; r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                let foundCode: string | null = null;
                let amount: string | undefined;
                let description: string | undefined;

                if (codeColIdx >= 0 && row[codeColIdx]) {
                    const val = String(row[codeColIdx]).trim();
                    // Match Xxxxxxx
                    const codeMatch = val.match(/X\d{6}/i);
                    if (codeMatch) {
                        foundCode = codeMatch[0].toUpperCase();
                    }
                }

                if (foundCode) {
                    if (amountColIdx >= 0 && row[amountColIdx] !== undefined) {
                        const rawAmount = String(row[amountColIdx]);
                        const numValue = parseFloat(rawAmount.replace(/[,\s]/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
                    }
                    if (descColIdx >= 0 && row[descColIdx] !== undefined) {
                        description = String(row[descColIdx]).trim();
                    }

                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                }
            }

            log('BIDV', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
            if (extracted.length === 0) error = "Không tìm thấy mã nào (X...)";

            results.push({
                id: `${fileName}-${sheetName}-${Date.now()}-${sheetIdx}`,
                fileId: fileName,
                fileName: fileName,
                sheetName: sheetName,
                data: extracted,
                enrichedData: enrichedData,
                error: error,
                selected: !error && extracted.length > 0,
                type: 'excel',
                bankName: bankName || 'Ngân hàng BIDV',
                transactionDate: transactionDate,
            });
        }
    });

    log('BIDV', `Finished processing. isBIDVFormat: ${isBIDVFormat}`);
    if (!isBIDVFormat) return null;

    return results;
};


/**
 * Processor for NH BIDV (PDF files)
 */
export const processBIDVPdf = async (file: File, results: SheetInfo[], password?: string): Promise<void> => {
    try {
        const text = await readPdfText(file, password);
        const codes = extractCodesFromText(text);
        const enrichedData = extractEnrichedDataFromPdf(text);

        results.push({
            id: `${file.name}-pdf-${Date.now()}`,
            fileId: file.name,
            fileName: file.name,
            sheetName: "Toàn bộ file",
            data: codes,
            enrichedData: enrichedData,
            error: codes.length === 0 ? "Không tìm thấy mã nào" : undefined,
            selected: codes.length > 0,
            type: 'pdf',
            bankName: 'Ngân hàng BIDV'
        });
    } catch (err: any) {
        logError('BIDV_PDF', err);
        if (err.message === 'PASSWORD_REQUIRED') {
            throw err;
        }
        results.push({
            id: `${file.name}-error-${Date.now()}`,
            fileId: file.name,
            fileName: file.name,
            sheetName: "Lỗi",
            data: [],
            error: "Lỗi đọc file PDF",
            selected: false,
            type: 'pdf'
        });
    }
};

/**
 * Extract enriched data from PDF text.
 * Parses transactions to get: Code, Credit Amount, Description
 * Specific for BIDV format
 */
const extractEnrichedDataFromPdf = (fullText: string): EnrichedCodeData[] => {
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
                // Return as number or string? Types say string currently...
                // But in ResultsView we parse it back to number.
                // Existing logic returned string formatted with locale.
                // Let's keep existing logic for consistency until further refactor.
                // Wait, recent fix changed extraction in pdfProcessor.ts to:
                /*
                if (!isNaN(numValue)) {
                    amount = Math.round(numValue).toLocaleString('en-US');
                }
                */
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
