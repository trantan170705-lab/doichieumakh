import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for NH VietinBank (Excel files)
 * Returns SheetInfo[] if successful, or null if file doesn't match VietinBank format
 */
export const processVIETINWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isVietinFormat = false;

    log('VIETIN', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        log('VIETIN', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

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

            // Search for header row in first 50 rows (increased scope)
            for (let r = 0; r < Math.min(data.length, 50); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;



                for (let c = 0; c < row.length; c++) {
                    const rawCell = String(row[c] || '').toLowerCase();
                    // Normalize whitespace: replace multiple spaces/tabs with single space
                    const cell = rawCell.replace(/\s+/g, ' ').trim();

                    // Metadata extraction: 'Người thu' and 'Ngày thu'
                    // IMPORTANT: Avoid capturing adjacent headers (e.g. if 'Người thu' is a column header next to 'Ngày thu')
                    const isHeaderKeyword = (s: string) => {
                        const lower = s.toLowerCase();
                        return lower.includes('ngày thu') || lower === 'ngày' || lower.includes('số tiền') || lower.includes('mô tả') || lower.includes('ghi chú') || lower.includes('thành tiền');
                    };

                    // Vertical Extraction Check (Scanning values in known metadata columns)
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
                            bankNameColIdx = c; // Mark column for vertical extraction

                            // Check if value is in the same cell (e.g. "Người thu: VietinBank")
                            const sameCellMatch = cell.match(/(?:người|nguoi)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && !isHeaderKeyword(val)) bankName = val;
                            } else if (c + 1 < row.length) {
                                // Check next cell (Horizontal)
                                const val = String(row[c + 1] || '').trim();
                                if (val && !isHeaderKeyword(val)) {
                                    bankName = val;
                                }
                            }
                        }
                        if (cell.includes('ngày thu') || cell.includes('ngay thu')) {
                            transactionDateColIdx = c; // Mark column for vertical extraction

                            // Check if value is in same cell
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

                        // Extra check for "Chu kỳ yêu cầu" or "From date" (History files)
                        if (!transactionDate && (cell.includes('chu kỳ yêu cầu') || cell.includes('from date'))) {
                            log('VIETIN', `Found Date Keyword at row ${r}, col ${c}: "${cell}"`);
                            // Likely in the NEXT cell or same cell
                            // Format: "2026-01-29 - 2026-01-29"
                            let val = '';

                            // Case 1: Value is in the same cell (e.g. "From date: 2026-01-29")
                            // Check if after split we actually have content
                            const parts = cell.split(':');
                            if (parts.length > 1 && parts[1].trim().length > 0) {
                                val = parts[1];
                            }

                            // Case 2: If val is still empty, check next cell
                            if (!val || val.trim().length === 0) {
                                if (c + 1 < row.length) {
                                    val = String(row[c + 1] || '');
                                    log('VIETIN', `Checking next cell for Date: "${val}"`);
                                }
                            }

                            const dateMatch = val.match(/(\d{4}-\d{2}-\d{2})/);
                            if (dateMatch) {
                                // Convert YYYY-MM-DD to DD/MM/YYYY
                                const [y, m, d] = dateMatch[1].split('-');
                                transactionDate = `${d}/${m}/${y}`;
                                log('VIETIN', `Found Date (Chu kỳ): ${transactionDate}`);
                            } else {
                                log('VIETIN', `Failed to parse date from: "${val}"`);
                            }
                        }
                    }

                    if (headerRowIdx === -1) {
                        // "Mô tả giao dịch" -> Code
                        // STRICTER CHECK: If we only see "Mã KH", we must be careful not to steal other banks' files.
                        // "Mã KH" is generic. "Mã Khách hàng (CIF. No)" contains "Mã KH" substring but is NOT Vietin.
                        const lowerCell = cell.toLowerCase();
                        const isGenericCodeHeader = (lowerCell.includes('mã kh') || lowerCell === 'ma kh') && !lowerCell.includes('cif') && !lowerCell.includes('khách hàng');
                        const isVietinStatementHeader = lowerCell.includes('mô tả giao dịch') || lowerCell.includes('mo ta giao dich') || lowerCell.includes('transaction description');

                        if (isVietinStatementHeader || isGenericCodeHeader) {
                            // If generic "Mã KH", check for counter-evidence OR requirement for Vietin branding
                            if (isGenericCodeHeader) {
                                // Scan previous rows/cols for other bank names to DISQUALIFY
                                const rowContent = row.map(model => String(model || '').toLowerCase()).join(' ');
                                if (rowContent.includes('lienviet') || rowContent.includes('lpbank') || rowContent.includes('agribank') || rowContent.includes('bidv') || rowContent.includes('vietcombank')) {
                                    log('VIETIN', `Found generic 'Mã KH' but also found other bank name in row ${r}. Skipping.`);
                                    continue;
                                }

                                // REQUIRE Vietin branding if we are relying on generic "Mã KH"
                                // If we haven't seen "VietinBank" or "Công Thương" yet (e.g. in bankName or previous rows), be skeptical.
                                // But usually `bankName` variable catches "Người thu: Ngân hàng VietinBank" BEFORE this if it's in the header.
                                // If `bankName` is detected as Vietin, we are good.
                                const hasVietinBranding = (bankName && (bankName.toLowerCase().includes('vietin') || bankName.toLowerCase().includes('công thương'))) ||
                                    rowContent.includes('vietin') || rowContent.includes('công thương') || rowContent.includes('efast');

                                if (!hasVietinBranding) {
                                    // Lookahead Scan: Check next 5 rows for branding
                                    let foundLookaheadBranding = false;
                                    const maxLookahead = Math.min(data.length, r + 6);
                                    for (let lr = r + 1; lr < maxLookahead; lr++) {
                                        const lRow = data[lr];
                                        if (Array.isArray(lRow)) {
                                            const lRowStr = lRow.map(c => String(c || '')).join(' ').toLowerCase();
                                            if (lRowStr.includes('vietin') || lRowStr.includes('công thương') || lRowStr.includes('efast')) {
                                                foundLookaheadBranding = true;
                                                break;
                                            }
                                        }
                                    }

                                    if (!foundLookaheadBranding) {
                                        log('VIETIN', `Found generic 'Mã KH' but NO VietinBank branding found (checked row and lookahead). Skipping to avoid false positive.`);
                                        continue;
                                    } else {
                                        log('VIETIN', `Found generic 'Mã KH' AND found branding in lookahead rows.`);
                                    }
                                }
                            }

                            log('VIETIN', `Found Code column at ${c} ("${cell}")`);
                            codeColIdx = c;
                        }
                        // "Có / Credit" -> Amount
                        // Note: Check for 'credit' but ensure it's not 'debit' if mixed, though usually separate cols
                        if (cell.includes('có / credit') || cell.includes('co / credit') || (cell.includes('credit') && !cell.includes('debit'))) {
                            log('VIETIN', `Found Amount column at ${c} ("${cell}")`);
                            amountColIdx = c;
                        }
                        // "Tên tài khoản đối ứng/ Corresponsive name" -> Description (updated as per request)
                        if (cell.includes('tên tài khoản đối ứng') || cell.includes('ten tai khoan doi ung') || cell.includes('corresponsive name')) {
                            log('VIETIN', `Found Description column at ${c} ("${cell}")`);
                            descColIdx = c;
                        }
                    }
                }

                // We need at least the Code column to be confident it's this format
                if (codeColIdx !== -1 && headerRowIdx === -1) {
                    headerRowIdx = r;
                    // If we found headers, mark as Vietin format
                    isVietinFormat = true;
                    log('VIETIN', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}, AmountCol: ${amountColIdx}, DescCol: ${descColIdx}`);
                    // Removed break to allow vertical extraction
                }
            }

            if (headerRowIdx === -1) {
                log('VIETIN', `Header NOT found in sheet ${sheetName}`);
                // Not the right format for this sheet, skip processing it
                // but keep iterating other sheets
                results.push({
                    id: `${fileName}-${sheetName}-${Date.now()}-${sheetIdx}`,
                    fileId: fileName,
                    fileName: fileName,
                    sheetName: sheetName,
                    data: [],
                    error: "Không tìm thấy cột 'Mô tả giao dịch'",
                    selected: false,
                    type: 'excel',
                    bankName: 'Ngân hàng VietinBank',
                    transactionDate: transactionDate,
                });
                return;
            }

            // Scan for data
            const startRow = headerRowIdx + 1;

            for (let r = startRow; r < data.length; r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                // Try to find code in the identified column
                let foundCode: string | null = null;
                let amount: string | undefined;
                let description: string | undefined;

                if (codeColIdx >= 0 && row[codeColIdx]) {
                    const val = String(row[codeColIdx]).trim();
                    // Extract code pattern from "TTHD Tien nuoc Ma KH-X139595 Ma HD-Ky 1/2026"
                    // Regex: Look for X followed by 6 digits
                    const codeMatch = val.match(/X\d{6}/i);
                    // Also try to match specific user provided example if regex misses for some reason (though regex shd work)
                    // "TTHD Tien nuoc Ma KH-X139595 Ma HD-Ky 1/2026"

                    if (codeMatch) {
                        foundCode = codeMatch[0].toUpperCase();
                    } else if (r < startRow + 5) {
                        // Only log first few non-matches to avoid spam
                        log('VIETIN', `Row ${r}: No code match found in value: "${val}"`);
                    }
                }

                if (foundCode) {
                    // Get amount - parse as number from "Có / Credit"
                    if (amountColIdx >= 0 && row[amountColIdx] !== undefined) {
                        const rawAmount = String(row[amountColIdx]);
                        const numValue = parseFloat(rawAmount.replace(/[,\s]/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
                    }

                    // Get description from "Số tài khoản đối ứng"
                    if (descColIdx >= 0 && row[descColIdx] !== undefined) {
                        description = String(row[descColIdx]).trim();
                    }

                    // ALLOW DUPLICATES: User wants to see ALL rows that have a code
                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                }
            }

            log('VIETIN', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
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
                bankName: bankName || 'Ngân hàng VietinBank',
                transactionDate: transactionDate,
            });
        }
    });

    log('VIETIN', `Finished processing. isVietinFormat: ${isVietinFormat}`);

    // If we didn't find any sheets matching the format (none set isVietinFormat = true), return null
    if (!isVietinFormat) return null;

    return results;
};
