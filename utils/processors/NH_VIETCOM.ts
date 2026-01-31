import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for NH Vietcombank (Excel files)
 * Returns SheetInfo[] if successful, or null if file doesn't match Vietcombank format
 */
export const processVIETCOMWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isVietcomFormat = false;

    log('VIETCOM', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('VIETCOM', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

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

                    // Metadata extraction: 'Người thu' and 'Ngày thu'
                    const isHeaderKeyword = (s: string) => {
                        const lower = s.toLowerCase();
                        return lower.includes('ngày thu') || lower === 'ngày' || lower.includes('số tiền') || lower.includes('mô tả') || lower.includes('ghi chú') || lower.includes('thành tiền');
                    };

                    // Vertical Extraction Check
                    if (extractMetadata && bankNameColIdx !== -1 && c === bankNameColIdx && !bankName) {
                        const val = String(row[c] || '').trim();
                        if (val && !isHeaderKeyword(val) && !val.toLowerCase().includes('người thu')) {
                            log('VIETCOM', `Found BankName (Vertical): ${val}`);
                            bankName = val;
                        }
                    }
                    if (extractMetadata && transactionDateColIdx !== -1 && c === transactionDateColIdx && !transactionDate) {
                        const val = row[c];
                        const dateStr = formatExcelDate(val);
                        if (dateStr) {
                            log('VIETCOM', `Found Date (Vertical Excel): ${dateStr}`);
                            transactionDate = dateStr;
                        } else {
                            const sVal = String(val || '').trim();
                            if (sVal && /\d/.test(sVal) && !isHeaderKeyword(sVal) && !sVal.toLowerCase().includes('ngày thu')) {
                                log('VIETCOM', `Found Date (Vertical): ${sVal}`);
                                transactionDate = sVal;
                            }
                        }
                    }

                    if (extractMetadata) {
                        if (cell.includes('người thu') || cell.includes('nguoi thu')) {
                            bankNameColIdx = c;
                            // Check if value is in the same cell (e.g. "Người thu: VietinBank")
                            const sameCellMatch = cell.match(/(?:người|nguoi)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && !isHeaderKeyword(val)) bankName = val;
                            } else if (c + 1 < row.length) {
                                // Check next cell
                                const val = String(row[c + 1] || '').trim();
                                if (val && !isHeaderKeyword(val)) {
                                    log('VIETCOM', `Found BankName: ${val}`);
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
                                    log('VIETCOM', `Found Date (Excel): ${dateStr}`);
                                    transactionDate = dateStr;
                                } else {
                                    const sVal = String(val || '').trim();
                                    if (sVal && /\d/.test(sVal) && !isHeaderKeyword(sVal)) {
                                        log('VIETCOM', `Found Date: ${sVal}`);
                                        transactionDate = sVal;
                                    }
                                }
                            }
                        }
                    }

                    if (headerRowIdx === -1) {
                        // "Mô tả" -> Code & Description source
                        const lowerCell = cell.toLowerCase();
                        const isGenericCodeHeader = (lowerCell.includes('mã kh') || lowerCell === 'ma kh') && !lowerCell.includes('cif') && !lowerCell.includes('khách hàng');
                        const isVietcomStatementHeader = lowerCell === 'mô tả' || lowerCell === 'mo ta' || lowerCell === 'description';

                        if (isVietcomStatementHeader || isGenericCodeHeader) {
                            if (isGenericCodeHeader) {
                                // Check for Branding
                                let hasBranding = (bankName && (bankName.toLowerCase().includes('vietcom') || bankName.toLowerCase().includes('ngoại thương'))) ||
                                    cell.includes('vietcom') || cell.includes('ngoại thương');

                                if (!hasBranding) {
                                    // Check row content
                                    const rowContent = row.map(x => String(x || '')).join(' ').toLowerCase();
                                    if (rowContent.includes('vietcom') || rowContent.includes('ngoại thương')) {
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
                                            if (lRowStr.includes('vietcom') || lRowStr.includes('ngoại thương')) {
                                                hasBranding = true;
                                                break;
                                            }
                                        }
                                    }
                                }

                                if (!hasBranding) {
                                    log('VIETCOM', `Found generic 'Mã KH' but NO Vietcom brand found. Skipping.`);
                                    continue;
                                }
                            }

                            log('VIETCOM', `Found Code/Desc column at ${c} ("${cell}")`);
                            codeColIdx = c;
                        }
                        // "Số tiền ghi có" -> Amount
                        if (cell.includes('số tiền') || cell.includes('so tien') || cell.includes('credit amount')) {
                            log('VIETCOM', `Found Amount column at ${c} ("${cell}")`);
                            amountColIdx = c;
                        }
                    }
                }

                if (codeColIdx !== -1 && headerRowIdx === -1) {
                    headerRowIdx = r;
                    // If we found headers, mark as Vietcom format
                    isVietcomFormat = true;
                    log('VIETCOM', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}, AmountCol: ${amountColIdx}`);
                    // Removed break
                }
            }

            if (headerRowIdx === -1) {
                log('VIETCOM', `Header NOT found in sheet ${sheetName}`);
                results.push({
                    id: `${fileName}-${sheetName}-${Date.now()}-${sheetIdx}`,
                    fileId: fileName,
                    fileName: fileName,
                    sheetName: sheetName,
                    data: [],
                    error: "Không tìm thấy cột 'Mô tả'",
                    selected: false,
                    type: 'excel',
                    bankName: bankName || 'Ngân hàng Vietcombank',
                    transactionDate: transactionDate,
                });
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

                    // 1. Extract Code: Look for "X" followed by digits (e.g., X134539)
                    // Pattern seems to be X followed by 6 digits based on examples, but let's be slightly flexible with \d+
                    const codeMatch = val.match(/X\d{6}/i);
                    if (codeMatch) {
                        foundCode = codeMatch[0].toUpperCase();
                    }

                    // 2. Extract Description: Remove prefix "MBVCB..._GENPCO_"
                    // Example: "MBVCB.12800478724_20260129_GENPCO_TA THI MY HANH..." -> "TA THI MY HANH..."
                    if (val.includes('GENPCO_')) {
                        const parts = val.split('GENPCO_');
                        if (parts.length > 1) {
                            description = parts[1].trim();
                        } else {
                            description = val;
                        }
                    } else {
                        description = val;
                    }
                }

                if (foundCode) {
                    // Get amount
                    if (amountColIdx >= 0 && row[amountColIdx] !== undefined) {
                        const rawAmount = String(row[amountColIdx]);
                        // Remove commas, spaces
                        const numValue = parseFloat(rawAmount.replace(/[,\s]/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
                    }

                    // Always add, allowing duplicates as per general requirement
                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description: description || '',
                        source: 'excel'
                    });
                }
            }

            log('VIETCOM', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
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
                bankName: bankName || 'Ngân hàng Vietcombank',
                transactionDate: transactionDate,
            });
        }
    });

    log('VIETCOM', `Finished processing. isVietcomFormat: ${isVietcomFormat}`);

    if (!isVietcomFormat) return null;

    return results;
};
