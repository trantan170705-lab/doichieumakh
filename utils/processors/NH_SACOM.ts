import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for Sacombank Excel files
 * 
 * Header Format based on user provided image:
 * Row 1: STT | Ngày giao dịch | Ngày hiệu lực | Số giao dịch | Diễn giải | Số tiền rút | Số tiền gửi | Số dư
 * Row 2: No | Booking date (*) | Value date (*) | Txn ID | Description | Debit | Credit | Actual Balance
 */
export const processSACOMWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isSacomFormat = false;

    log('SACOM', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('SACOM', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

        let extracted: string[] = [];
        const enrichedData: EnrichedCodeData[] = [];
        let error: string | undefined = undefined;
        let transactionDate: string | undefined;

        // Hardcoded bank name for Sacombank processor
        const bankName = "Ngân hàng Sacombank";

        if (!data || data.length === 0) {
            error = "Sheet rỗng";
        } else {
            // Find header row to locate columns
            let dateColIdx = -1;
            let descColIdx = -1;
            let creditColIdx = -1; // Số tiền gửi/Credit (Income)
            let headerRowIdx = -1;

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

                    // "Ngày giao dịch" / "Booking date"
                    if (cell.includes('ngày giao dịch') || cell.includes('booking date')) {
                        log('SACOM', `Found Date column at ${c} ("${cell}")`);
                        dateColIdx = c;
                    }

                    // "Diễn giải" / "Description"
                    if (cell === ('diễn giải') || cell === ('description') || cell.includes('diễn giải') || (cell.includes('description') && !cell.includes('txn'))) {
                        // Simple strict check might be better to avoid false positives, but 'includes' is safer for variations
                        if (descColIdx === -1) { // Only set if not already found (prefer first match?)
                            log('SACOM', `Found Description column at ${c} ("${cell}")`);
                            descColIdx = c;
                        }
                    }

                    // "Số tiền gửi" / "Credit"
                    // Important: Distinguish from "Số tiền rút" / "Debit"
                    if (cell.includes('số tiền gửi') || cell === 'credit' || (cell.includes('credit') && !cell.includes('debit'))) {
                        log('SACOM', `Found Credit/Amount column at ${c} ("${cell}")`);
                        creditColIdx = c;
                    }
                }

                if (dateColIdx !== -1 && descColIdx !== -1 && creditColIdx !== -1) {
                    headerRowIdx = r;
                    isSacomFormat = true;
                    log('SACOM', `Header ACCEPTED at row ${r}. Date: ${dateColIdx}, Desc: ${descColIdx}, Credit: ${creditColIdx}`);
                    break;
                }
            }

            if (headerRowIdx === -1) {
                // If this is not Sacombank, we simply skip silently/return null from function at end
                // But if we want to return an "empty" sheet result to indicate we TRIED but failed? 
                // Better to just push nothing if it's not Sacombank format
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

                // 1. Extract Description & Code
                if (descColIdx >= 0 && row[descColIdx]) {
                    description = String(row[descColIdx]).trim();
                    const codeMatch = description.match(/X\d{6}/i); // Basic X + 6 digits pattern
                    if (codeMatch) {
                        foundCode = codeMatch[0].toUpperCase();
                    }
                }

                // 2. Extract Amount (Credit only)
                // If it's a debit row (Credit column empty), we might skip? 
                // Usually we only care about money COMING IN (Credit) for "Báo có"
                if (creditColIdx >= 0 && row[creditColIdx] !== undefined) {
                    const rawAmount = String(row[creditColIdx]);
                    if (rawAmount.trim() !== '' && rawAmount !== '-') {
                        const numValue = parseFloat(rawAmount.replace(/,/g, '')); // Sacom uses comma for thousands?
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            // Try simpler parsing if replace failed
                            amount = rawAmount;
                        }
                    }
                }

                // 3. Extract Date (for metadata)
                if (extractMetadata && !transactionDate && dateColIdx >= 0 && row[dateColIdx]) {
                    const val = row[dateColIdx];
                    // Check if it's Excel serial date
                    const excelDate = formatExcelDate(val);
                    if (excelDate) {
                        transactionDate = excelDate;
                    } else {
                        // String date "25/01/2026 21:12:03"
                        const sVal = String(val).trim();
                        // Split by space to remove time
                        const parts = sVal.split(' ');
                        if (parts.length > 0 && /\d{2}\/\d{2}\/\d{4}/.test(parts[0])) {
                            transactionDate = parts[0];
                        }
                    }
                }

                if (foundCode) {
                    // Only add if we have a code. 
                    // Should we check if amount is present? Some flows might be 0? 
                    // Usually we accept it.

                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                }
            }

            log('SACOM', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
            if (extracted.length === 0) error = "Không tìm thấy mã nào (X...) trong cột Diễn giải";

            if (isSacomFormat) {
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
                    bankName: bankName,
                    transactionDate: transactionDate,
                });
            }
        }
    });

    log('SACOM', `Finished processing. isSacomFormat: ${isSacomFormat}`);

    if (!isSacomFormat) return null;

    return results;
};
