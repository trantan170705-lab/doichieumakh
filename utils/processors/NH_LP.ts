import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for LPBank (LienVietPostBank) Excel files
 */
export const processLPWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isLPFormat = false;

    log('LP', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('LP', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

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
            let nameColIdx = -1; // New: "Họ tên"
            let billAmountColIdx = -1; // New: "Tổng tiền HĐ"
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

                    // Metadata extraction
                    const isHeaderKeyword = (s: string) => {
                        const lower = s.toLowerCase();
                        return lower.includes('ngày thu') || lower === 'ngày' || lower.includes('số tiền') || lower.includes('mô tả') || lower.includes('ghi chú') || lower.includes('chi nhánh') || lower.includes('nội dung') || lower.includes('kỳ sao kê');
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


                        // Extra check for "Kỳ sao kê" (Statement period) -> "29/01/2026 - 29/01/2026"
                        if (!transactionDate && (cell.includes('kỳ sao kê') || cell.includes('statement period'))) {
                            // Likely in the NEXT cell or same cell
                            let val = '';
                            const parts = cell.split(':'); // sometimes "Period: ..."
                            if (parts.length > 1 && parts[1].trim().length > 0) {
                                val = parts[1];
                            }

                            if (!val || val.trim().length === 0) {
                                if (c + 1 < row.length) {
                                    val = String(row[c + 1] || '');
                                }
                            }

                            const dateMatch = val.match(/(\d{2}\/\d{2}\/\d{4})/);
                            if (dateMatch) {
                                transactionDate = dateMatch[1]; // First date found
                            }
                        }
                    }

                    if (headerRowIdx === -1) {
                        // "NỘI DUNG GIAO DỊCH (Details)" -> Code & Description
                        // Also support "Mã Khách hàng (CIF. No)" for history files
                        // Also support generic "Mã KH" IF we see LienViet branding
                        const lowerCell = cell.toLowerCase();
                        const isGenericCodeHeader = lowerCell.includes('mã kh') || lowerCell === 'ma kh';
                        const isLPStatementHeader = lowerCell.includes('nội dung giao dịch') || lowerCell.includes('noi dung giao dich') || (lowerCell.includes('details') && !lowerCell.includes('ref')) || lowerCell.includes('cif. no');

                        if (isLPStatementHeader || isGenericCodeHeader) {
                            if (isGenericCodeHeader) {
                                // Check for branding in current row or captured bankName
                                const rowContent = row.map(model => String(model || '')).join(' ').toLowerCase();
                                const hasLPBranding = (bankName && (bankName.toLowerCase().includes('lienviet') || bankName.toLowerCase().includes('lpbank'))) ||
                                    rowContent.includes('lienviet') || rowContent.includes('lpbank');

                                if (!hasLPBranding) {
                                    // Lookahead Scan: Check next 7 rows for branding
                                    let foundLookaheadBranding = false;
                                    const maxLookahead = Math.min(data.length, r + 8);
                                    for (let lr = r + 1; lr < maxLookahead; lr++) {
                                        const lRow = data[lr];
                                        if (Array.isArray(lRow)) {
                                            const lRowStr = lRow.map(c => String(c || '')).join(' ').toLowerCase();
                                            if (lRowStr.includes('lienviet') || lRowStr.includes('lpbank') || lRowStr.includes('linviet')) {
                                                foundLookaheadBranding = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (!foundLookaheadBranding) {
                                        log('LP', `Found generic 'Mã KH' but NO LPBank branding found (checked row and lookahead). Skipping.`);
                                        continue;
                                    } else {
                                        log('LP', `Found generic 'Mã KH' AND found branding in lookahead rows.`);
                                    }
                                }
                            }

                            log('LP', `Found Code column at ${c} ("${cell}")`);
                            codeColIdx = c;
                        }
                        // "GHI CÓ (Credit)" -> Amount
                        // Also support "Số tiền ghi có"
                        if (cell.includes('ghi có') || cell.includes('ghi co') || (cell.includes('credit') && !cell.includes('debit'))) {
                            log('LP', `Found Amount column at ${c} ("${cell}")`);
                            amountColIdx = c;
                        }

                        // "Tổng tiền HĐ" -> Bill Amount (Priority)
                        if (cell.includes('tổng tiền hđ') || cell.includes('tong tien hd') || cell.includes('tổng tiền thanh toán') || cell.includes('tong tien thanh toan')) {
                            log('LP', `Found Bill Amount column at ${c} ("${cell}")`);
                            billAmountColIdx = c;
                        }

                        // "Họ tên" -> Name (Priority Description)
                        if (cell.includes('họ tên') || cell.includes('ho ten') || cell.includes('tên kh') || cell.includes('ten kh') || cell.includes('người nộp') || cell.includes('nguoi nop')) {
                            log('LP', `Found Name column at ${c} ("${cell}")`);
                            nameColIdx = c;
                        }

                        // Description
                        if (cell.includes('diễn giải') || cell.includes('nội dung') || cell.includes('transaction description')) {
                            log('LP', `Found Description column at ${c} ("${cell}")`);
                            descColIdx = c;
                        }
                    }
                }

                if (codeColIdx !== -1 && headerRowIdx === -1) {
                    headerRowIdx = r;
                    // If we found headers, mark as LP format
                    isLPFormat = true;
                    log('LP', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}, AmountCol: ${amountColIdx}, DescCol: ${descColIdx}, NameCol: ${nameColIdx}, BillCol: ${billAmountColIdx}`);
                    // Removed break
                }
            }

            if (headerRowIdx === -1) {
                log('LP', `Header NOT found in sheet ${sheetName}`);
                results.push({
                    id: `${fileName}-${sheetName}-${Date.now()}-${sheetIdx}`,
                    fileId: fileName,
                    fileName: fileName,
                    sheetName: sheetName,
                    data: [],
                    error: "Không tìm thấy cột 'Nội dung giao dịch'",
                    selected: false,
                    type: 'excel',
                    bankName: bankName || 'Ngân hàng LPBank',
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
                    const codeMatch = val.match(/X\d{6}/i);

                    if (codeMatch) {
                        foundCode = codeMatch[0].toUpperCase();
                        // If we found it in a "Description-like" column (not pure Code column), use full val as desc
                        // But if it's "Mã KH" column, we might want to look elsewhere for description? 
                        // For now keep simple.
                    }

                    // If we haven't found a code yet (e.g. Code col was CIF No, or Description col didn't have X code directly), 
                    // AND we have a separate Description column (or if the Code column ITSELF was the description column), check there.
                    // Priority: Explicit Description Column > Code Column (fallback)

                    // 1. Try Description Column first
                    // 1. Try Name Column (Highest Priority)
                    if (nameColIdx >= 0 && row[nameColIdx]) {
                        description = String(row[nameColIdx]).trim();
                    }

                    // 2. Try Description Column
                    if ((!description || description === '') && descColIdx >= 0 && row[descColIdx]) {
                        description = String(row[descColIdx]).trim();
                    }

                    // 2. If valid code found in code column, but no description yet (or empty), check code column for description??
                    // Actually, if we have a valid code, the Code Column usually *contains* the code. 
                    // If the code column IS "Nội dung giao dịch", then `val` already has the description.

                    if (!description && codeColIdx >= 0 && row[codeColIdx]) {
                        const val = String(row[codeColIdx]).trim();
                        // Only use as description if it's long enough to be a description, or if descColIdx was missing entirely
                        if (val.length > (foundCode ? foundCode.length + 5 : 10)) {
                            description = val;
                        }
                    }
                }

                if (foundCode) {
                    // Priority: Bill Amount > Amount
                    let usedAmountColIdx = -1;
                    if (billAmountColIdx >= 0 && row[billAmountColIdx] !== undefined) {
                        usedAmountColIdx = billAmountColIdx;
                    } else if (amountColIdx >= 0 && row[amountColIdx] !== undefined) {
                        usedAmountColIdx = amountColIdx;
                    }

                    if (usedAmountColIdx >= 0) {
                        const rawAmount = String(row[usedAmountColIdx]);
                        const numValue = parseFloat(rawAmount.replace(/[,\s]/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
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

            log('LP', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
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
                bankName: bankName || 'Ngân hàng LPBank',
                transactionDate: transactionDate,
            });
        }
    });

    log('LP', `Finished processing. isLPFormat: ${isLPFormat}`);

    if (!isLPFormat) return null;

    return results;
};
