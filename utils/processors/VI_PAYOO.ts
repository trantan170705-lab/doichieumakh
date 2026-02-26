import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';
import { safeSheetToJson } from '../excelHelper';

/**
 * Processor for Ví Payoo (Excel files)
 * Takes specific columns based on header matching:
 * - Mã khách hàng -> Mã KH (Code)
 * - Số tiền(VND) -> Số tiền (Amount)
 * - Họ tên -> Diễn giải (Description)
 */
export const processVIPAYOOWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isViPayooFormat = false;

    log('VIPAYOO', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        const ws = wb.Sheets[sheetName];
        const data = safeSheetToJson(ws);

        log('VIPAYOO', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

        let extracted: string[] = [];
        const enrichedData: EnrichedCodeData[] = [];
        let error: string | undefined = undefined;
        let transactionDate: string | undefined;

        if (!data || data.length === 0) {
            error = "Sheet rỗng";
        } else {
            // Locate columns
            let codeColIdx = -1;
            let amountColIdx = -1;
            let nameColIdx = -1;
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

            for (let r = 0; r < Math.min(data.length, 50); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                for (let c = 0; c < row.length; c++) {
                    const cell = String(row[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();

                    if (cell.includes('mã khách hàng') || cell === 'mã kh' || cell === 'ma khach hang') {
                        codeColIdx = c;
                    }
                    if (cell.includes('số tiền(vnd)') || cell.includes('số tiền') || cell.includes('so tien')) {
                        amountColIdx = c;
                    }
                    if (cell.includes('họ tên') || cell.includes('ho ten') || cell.includes('tên khách hàng')) {
                        nameColIdx = c;
                    }
                }

                if (codeColIdx !== -1 && amountColIdx !== -1 && nameColIdx !== -1) {
                    headerRowIdx = r;
                    isViPayooFormat = true;
                    log('VIPAYOO', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}, AmountCol: ${amountColIdx}, NameCol: ${nameColIdx}`);
                    break;
                }
            }

            if (headerRowIdx === -1) {
                log('VIPAYOO', `Header NOT found in sheet ${sheetName}`);
                return;
            }

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

                    if (nameColIdx >= 0 && row[nameColIdx] !== undefined) {
                        description = String(row[nameColIdx]).trim();
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

            log('VIPAYOO', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
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
                bankName: 'Ví Payoo',
                transactionDate: transactionDate,
            });
        }
    });

    log('VIPAYOO', `Finished processing. isViPayooFormat: ${isViPayooFormat}`);

    if (!isViPayooFormat) return null;

    return results;
};
