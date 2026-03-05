import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for Bravo Accounting Software exported Excel files
 * 
 * Target Format:
 * Column: Diễn giải -> Contains code (e.g. X050606) & Name (e.g. DANG THANH DUC) delimited by '|'
 * Column: Nợ -> Contains Amount
 */
export const processBRAVOWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isBravoFormat = false;

    log('BRAVO', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('BRAVO', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

        let extracted: string[] = [];
        const enrichedData: EnrichedCodeData[] = [];
        let error: string | undefined = undefined;
        let transactionDate: string | undefined;

        const bankName = "Phần mềm Bravo";

        if (!data || data.length === 0) {
            error = "Sheet rỗng";
        } else {
            let descColIdx = -1;
            let debtColIdx = -1; // Nợ (Amount logic)
            let dateColIdx = -1; // Ngày (cho Tên báo cáo)

            const formatExcelDate = (val: any): string | undefined => {
                if (typeof val === 'number' && val > 30000 && val < 60000) {
                    const date = XLSX.SSF.parse_date_code(val);
                    const d = date.d < 10 ? `0${date.d}` : date.d;
                    const m = date.m < 10 ? `0${date.m}` : date.m;
                    return `${d}/${m}/${date.y}`;
                }
                return undefined;
            };

            // Search for header columns in first 20 rows
            // Bravo sometimes splits headers into 2 rows, "Phát sinh" merged on top of "Nợ" & "Có"
            for (let r = 0; r < Math.min(data.length, 20); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                for (let c = 0; c < row.length; c++) {
                    const rawCell = String(row[c] || '').toLowerCase().trim();
                    const cell = rawCell.replace(/\s+/g, ' ');

                    // "Diễn giải"
                    if (cell === 'diễn giải' || cell.includes('diễn giải')) {
                        if (descColIdx === -1) {
                            descColIdx = c;
                        }
                    }

                    // "Nợ"
                    if (cell === 'nợ' || cell === 'số nợ' || cell.includes('nợ (')) {
                        if (debtColIdx === -1) {
                            debtColIdx = c;
                        }
                    }

                    // "Ngày" chứng từ
                    if (cell === 'ngày' || cell === 'ngày chứng từ' || cell.includes('ngày g/d')) {
                        if (dateColIdx === -1) {
                            dateColIdx = c;
                        }
                    }
                }
            }

            // Check if it's Bravo format
            if (descColIdx !== -1 && debtColIdx !== -1) {
                // Look for another software specific hint if possible: "Tài khoản đối ứng"
                let hasBravoHint = false;
                for (let r = 0; r < Math.min(data.length, 20); r++) {
                    const row = data[r];
                    if (!Array.isArray(row)) continue;
                    if (row.some(val => String(val).toLowerCase().includes('tài khoản đối ứng') || String(val).toLowerCase().includes('chứng từ'))) {
                        hasBravoHint = true;
                        break;
                    }
                }

                if (hasBravoHint || fileName.toLowerCase().includes('bravo')) {
                    isBravoFormat = true;
                    log('BRAVO', `Identified Bravo format. Desc: ${descColIdx}, Debt: ${debtColIdx}, Date: ${dateColIdx}`);
                }
            }

            if (!isBravoFormat) return; // Note: We just break out to the next sheet

            // Scan for data
            for (let r = 0; r < data.length; r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                let foundCode: string | null = null;
                let amount: string | undefined;
                let description: string | undefined;

                // 1. Extract Description & Code
                if (descColIdx >= 0 && row[descColIdx]) {
                    const rawDesc = String(row[descColIdx]).trim();

                    // Ex: PAYOO : Thu hộ tiền nước kỳ 2/2026 | DANG THANH DUC | X050606 | XI0J001800 | | Lý Xuân Đào
                    const parts = rawDesc.split('|').map(p => p.trim());

                    let foundCodeIdx = -1;
                    for (let i = 0; i < parts.length; i++) {
                        // Looking for exact "X" + 6 digits in any of the segments
                        if (/^X\d{6}$/i.test(parts[i])) {
                            foundCodeIdx = i;
                            break;
                        }
                    }

                    if (foundCodeIdx !== -1) {
                        foundCode = parts[foundCodeIdx].toUpperCase(); // E.g., X050606

                        // User requested: "Tách ra chỉ lấy DANG THANH DUC"
                        // Usually the previous part in the segment holds the Name
                        if (foundCodeIdx > 0) {
                            description = parts[foundCodeIdx - 1];
                            if (!description || description === '') {
                                // Fallback
                                description = rawDesc;
                            }
                        } else {
                            description = parts.join(' ');
                        }
                    } else {
                        // Fallback logic for rows that might just contain the code without | delimiters
                        const codeMatch = rawDesc.match(/X\d{6}/i);
                        if (codeMatch) {
                            foundCode = codeMatch[0].toUpperCase();
                            description = rawDesc; // We don't know the exact boundary, save all
                        }
                    }
                }

                // 2. Extract Amount (Nợ)
                if (debtColIdx >= 0 && row[debtColIdx] !== undefined) {
                    const rawAmount = String(row[debtColIdx]);
                    if (rawAmount.trim() !== '' && rawAmount !== '-' && rawAmount.toLowerCase() !== 'nợ') {
                        // Clean commas and decode number
                        const numValue = parseFloat(rawAmount.replace(/,/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
                    }
                }

                // 3. Extract Date (cho metadata tính tên file báo cáo)
                if (extractMetadata && !transactionDate && dateColIdx >= 0 && row[dateColIdx]) {
                    const val = row[dateColIdx];
                    const excelDate = formatExcelDate(val);
                    if (excelDate) {
                        transactionDate = excelDate;
                    } else {
                        // Text date "01-03-26" -> we might need to change it to "01/03/2026" or format string
                        const sVal = String(val).trim();
                        const parts = sVal.split(/[\s-]/);
                        if (parts.length >= 3 && /\d{2}/.test(parts[0])) {
                            transactionDate = `${parts[0]}/${parts[1]}/${parts[2]}`; // fallback string mapping
                        } else {
                            transactionDate = sVal;
                        }
                    }
                }

                if (foundCode && amount) {
                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                } else if (foundCode) {
                    // Sometimes amount might be missing if 0 or empty, we still keep the code
                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                }
            }

            log('BRAVO', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
            if (extracted.length === 0) error = "Không tìm thấy mã nào (X...) trong cột Diễn giải";

            if (isBravoFormat) {
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

    log('BRAVO', `Finished processing. isBravoFormat: ${isBravoFormat}`);

    if (results.length === 0) return null; // No Bravo formats added

    return results;
};
