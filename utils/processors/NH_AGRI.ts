import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';

/**
 * Processor for NH Agribank (Excel files)
 */
export const processAGRIWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] => {
    const results: SheetInfo[] = [];

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

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
                const strVal = String(val || '').trim();
                // Try parsing decimal string as excel date code (e.g. "46049.123")
                if (/^\d+\.?\d*$/.test(strVal)) {
                    const num = parseFloat(strVal);
                    if (num > 30000 && num < 60000) {
                        const date = XLSX.SSF.parse_date_code(num);
                        const d = date.d < 10 ? `0${date.d}` : date.d;
                        const m = date.m < 10 ? `0${date.m}` : date.m;
                        return `${d}/${m}/${date.y}`;
                    }
                }
                return undefined;
            };

            // Search for header row in first 20 rows (increased from 10 to be safe)
            for (let r = 0; r < Math.min(data.length, 20); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;



                for (let c = 0; c < row.length; c++) {
                    const rawCell = String(row[c] || '').toLowerCase();
                    const cell = rawCell.trim();

                    // Metadata extraction helpers
                    const isHeaderKeyword = (s: string) => {
                        const lower = s.toLowerCase();
                        return lower.includes('ngày thu') || lower === 'ngày' || lower.includes('số tiền') || lower.includes('mô tả') || lower.includes('ghi chú') || lower.includes('mã kh');
                    };

                    // Vertical Extraction Check (Restored)
                    if (extractMetadata && bankNameColIdx !== -1 && c === bankNameColIdx && !bankName) {
                        const val = String(row[c] || '').trim();
                        if (val && !isHeaderKeyword(val) && !val.toLowerCase().includes('người thu')) {
                            bankName = val;
                        }
                    }

                    // Explicit Debug for Date Column Logic
                    if (extractMetadata && transactionDateColIdx !== -1 && c === transactionDateColIdx) {
                        const val = row[c];
                        if (!transactionDate) {
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
                    }

                    if (extractMetadata) {
                        if (cell.includes('người thu') || cell.includes('nguoi thu')) {
                            log('AGRI', `Found 'Người thu' header at Row ${r}, Col ${c}`);
                            bankNameColIdx = c; // Mark column for vertical extraction

                            // Check for inline value: "Người thu: Ngân hàng..."
                            const sameCellMatch = cell.match(/(?:người|nguoi)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && !isHeaderKeyword(val)) {
                                    log('AGRI', `Extracted BankName (Same Cell): ${val}`);
                                    bankName = val;
                                }
                            } else if (c + 1 < row.length) {
                                // Horizontal check
                                const val = String(row[c + 1] || '').trim();
                                if (val && !isHeaderKeyword(val)) {
                                    log('AGRI', `Extracted BankName (Horizontal): ${val}`);
                                    bankName = val;
                                }
                            }
                        }
                        if (cell.includes('ngày thu') || cell.includes('ngay thu')) {
                            log('AGRI', `Found 'Ngày thu' header at Row ${r}, Col ${c}`);
                            transactionDateColIdx = c; // Mark column for vertical extraction

                            const sameCellMatch = cell.match(/(?:ngày|ngay)\s+thu\s*[:.-]?\s+(.+)/i);
                            if (sameCellMatch && sameCellMatch[1]) {
                                const val = sameCellMatch[1].trim();
                                if (val && /\d/.test(val) && !isHeaderKeyword(val)) {
                                    log('AGRI', `Extracted Date (Same Cell): ${val}`);
                                    transactionDate = val;
                                }
                            } else if (c + 1 < row.length) {
                                const val = row[c + 1];
                                const dateStr = formatExcelDate(val);
                                if (dateStr) {
                                    log('AGRI', `Extracted Date (Horizontal) via formatExcelDate: ${dateStr}`);
                                    transactionDate = dateStr;
                                } else {
                                    const sVal = String(val || '').trim();
                                    if (sVal && /\d/.test(sVal) && !isHeaderKeyword(sVal)) {
                                        log('AGRI', `Extracted Date (Horizontal) via Raw String: ${sVal}`);
                                        transactionDate = sVal;
                                    }
                                }
                            }
                        }
                    }
                    if (cell.includes('mã kh') || cell.includes('ma kh') || /^x\d{6}$/i.test(cell)) {
                        // Negative check: If we see other bank names in this row, skip
                        const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
                        if (rowStr.includes('lienviet') || rowStr.includes('lpbank') || rowStr.includes('vietin') || rowStr.includes('vietcom') || rowStr.includes('bidv')) {
                            log('AGRI', `Found 'Mã KH' but row contains other bank name in row ${r}. Skipping.`);
                            continue;
                        }
                        log('AGRI', `Found Code Header at Row ${r}, Col ${c}`);
                        if (codeColIdx === -1) codeColIdx = c;
                    }
                    // Amount columns
                    if (cell.includes('số tiền') || cell.includes('so tien') || cell.includes('tổng tiền') || cell.includes('tong tien') || cell === 'amount') {
                        amountColIdx = c;
                    }
                    // Description columns
                    if (cell.includes('nội dung') || cell.includes('noi dung') || cell.includes('diễn giải') || cell.includes('dien giai') || cell.includes('họ tên') || cell.includes('ho ten') || cell === 'description') {
                        descColIdx = c;
                    }
                }

                if (codeColIdx !== -1) {
                    headerRowIdx = r;
                    // Do NOT break here immediately if we still need to find metadata vertically
                    // But we might want to break if we are sure we found the header row and we rely on vertical search for metadata
                    // The issue is: if headerRow is 0, and Date is in Row 1, and we break at Row 0, we miss Date.
                    // So we should NOT break if we are looking for vertical metadata.
                    // However, we don't want to re-assign headerRowIdx later.
                    // Let's just mark it and continue.
                }
            }

            // Global Negative Check: Scan first 10 rows for OTHER bank names
            // If we find explicit branding for another bank, we likely shouldn't process this as generic Agribank
            let hasOtherBankBranding = false;
            for (let r = 0; r < Math.min(data.length, 10); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;
                const rowStr = row.map(c => String(c || '')).join(' ').toLowerCase();
                // Check for other banks
                if (rowStr.includes('lienviet') || rowStr.includes('lpbank') ||
                    rowStr.includes('vietin') || rowStr.includes('công thương') ||
                    rowStr.includes('vietcom') || rowStr.includes('ngoại thương') ||
                    rowStr.includes('bidv') || rowStr.includes('đầu tư và phát triển')) {

                    log('AGRI', `Found OTHER BANK branding in row ${r}: ${rowStr}. REJECTING Agribank processor.`);
                    hasOtherBankBranding = true;
                    break;
                }
            }

            if (hasOtherBankBranding) {
                // Reject this processor
                // We return an empty result or generic error so it doesn't get added?
                // Actually, if we return empty array, it might be fine, or we return a specific error that filters it out?
                // But in FileUploader, we push(...results). If results is empty, nothing added.
                // But wait, processAGRIWorkbook returns SheetInfo[].
                // If we return [], it effectively ignores the file for this processor.
                log('AGRI', "Rejected due to other bank branding.");
                // We should probably return empty, effectively saying "Not Agribank"
                // But since Agribank is the FALLBACK, if we reject it here, the file goes processed by NO ONE?
                // Correct. If it falls through all specific processors and Agribank also rejects it, then it's effectively "Unknown Format".
                // But wait, if it was rejected by specific processors (e.g. due to bug), catching it here means NO result.
                // That is better than WRONG result (Agribank claim).
                // User can see "No data found" or we can return a "Unrecognized Bank" error sheet?
                // Let's return nothing for now, or maybe an error sheet if we want to be explicit.
                // Current logic: return results (empty or with error).
                // Let's return an empty list so it doesn't add garbage.
                // However, we are inside a loop over sheets.
                // We should probably set a flag to skip this sheet.
                // Refactoring to check branding BEFORE processing sheets? Or per sheet?
                // Per sheet is fine.
            }

            if (hasOtherBankBranding) {
                // Continue to next sheet (effectively skipping this one)
                return;
            }

            // Scan for valid codes (X followed by 6 digits)
            const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

            for (let r = startRow; r < data.length; r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                // Try to find code in the identified column or scan all cells
                let foundCode: string | null = null;
                let amount: string | undefined;
                let description: string | undefined;

                if (codeColIdx >= 0 && row[codeColIdx]) {
                    const val = String(row[codeColIdx]).trim();
                    if (/^X\d{6}$/i.test(val)) {
                        foundCode = val.toUpperCase();
                    }
                } else {
                    // Scan all cells for code pattern
                    for (const cell of row) {
                        if (cell && typeof cell === 'string') {
                            const val = cell.trim();

                            // Check strict match first
                            if (/^X\d{6}$/i.test(val)) {
                                foundCode = val.toUpperCase();
                                break;
                            }

                            // Check embedded match (e.g. "MA_GD:541541323|X039209,...")
                            // We prioritize strict match, so we continue checking other cells if strict match is possible.
                            // But here we are iterating cells. If we find a strict match, we stop.
                            // If we find an embedded match, should we stop? 
                            // Let's hold distinct matches. If we find a strict match later in the row, that wins.

                            const embeddedMatch = val.match(/(?:^|[^\w])(X\d{6})(?:$|[^\w])/i) || val.match(/(X\d{6})/i);
                            if (embeddedMatch) {
                                // Keep this as a candidate, but keep looking for a STRICT match in other cells
                                if (!foundCode) {
                                    foundCode = embeddedMatch[1].toUpperCase();
                                }
                            }
                        }
                    }
                }

                if (foundCode) {
                    // Get amount - parse as number
                    if (amountColIdx >= 0 && row[amountColIdx] !== undefined) {
                        const rawAmount = String(row[amountColIdx]);
                        const numValue = parseFloat(rawAmount.replace(/[,\s]/g, ''));
                        if (!isNaN(numValue)) {
                            amount = Math.round(numValue).toLocaleString('en-US');
                        } else {
                            amount = rawAmount;
                        }
                    }
                    // Get description - extract only relevant part
                    // Pattern used in recent fix: "X\d{6},[^#]+#[^#]+"
                    if (descColIdx >= 0 && row[descColIdx] !== undefined) {
                        const rawDesc = String(row[descColIdx]);
                        // Try to match pattern: X code followed by info up to # # or # #[
                        const descMatch = rawDesc.match(/X\d{6},[^#]+#[^#]+/i);
                        if (descMatch) {
                            description = descMatch[0].trim();
                        } else {
                            // Fallback: just use the raw description
                            description = rawDesc;
                        }
                    }

                    // ALLOW DUPLICATES: Capture every transaction row
                    extracted.push(foundCode);
                    enrichedData.push({
                        code: foundCode,
                        amount,
                        description,
                        source: 'excel'
                    });
                }
            }

            if (extracted.length === 0) error = "Không có mã hợp lệ (X...)";
        }

        results.push({
            id: `${fileName}-${sheetName}-${Date.now()}-${sheetIdx}`,
            fileId: fileName,
            fileName: fileName,
            sheetName: sheetName,
            data: extracted,
            enrichedData: enrichedData,
            error: error,
            selected: !error,
            type: 'excel',
            bankName: bankName || 'Ngân hàng Agribank',
            transactionDate: transactionDate,
        });
    });

    return results;
};
