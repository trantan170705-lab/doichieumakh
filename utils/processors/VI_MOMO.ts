import * as XLSX from 'xlsx';
import { SheetInfo, EnrichedCodeData } from '../../types';
import { log } from '../logger';
import { safeSheetToJson } from '../excelHelper';

/**
 * Processor for Ví Momo (Excel files)
 * Takes specific columns based on header matching:
 * - MS.Mã đối tác -> Mã KH (Code)
 * - MS.Nợ -> Số tiền (Amount)
 * - MS.Tên khách hàng -> Diễn giải (Description)
 */
export const processVIMOMOWorkbook = (wb: XLSX.WorkBook, fileName: string, extractMetadata: boolean = true): SheetInfo[] | null => {
    const results: SheetInfo[] = [];
    let isViMomoFormat = false;

    log('VIMOMO', `Processing workbook: ${fileName}`);

    wb.SheetNames.forEach((sheetName, sheetIdx) => {
        // Only process sheet named "data"
        if (sheetName.toLowerCase() !== 'data') {
            return;
        }

        const ws = wb.Sheets[sheetName];
        const data = safeSheetToJson(ws);

        log('VIMOMO', `Processing sheet: ${sheetName}, Rows: ${data?.length}`);

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

            for (let r = 0; r < Math.min(data.length, 50); r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                for (let c = 0; c < row.length; c++) {
                    const cell = String(row[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();

                    if (cell.includes('ms.mã đối tác') || cell.includes('ms.ma doi tac') || cell === 'mã đối tác' || cell === 'ma doi tac') {
                        codeColIdx = c;
                    }
                    if (cell === 'ms.nợ' || cell === 'ms.no' || cell === 'nợ' || cell === 'no') {
                        amountColIdx = c;
                    }
                    if (cell.includes('ms.tên khách hàng') || cell.includes('ms.ten khach hang') || cell === 'tên khách hàng' || cell === 'ten khach hang') {
                        nameColIdx = c;
                    }
                }

                if (codeColIdx !== -1 && amountColIdx !== -1 && nameColIdx !== -1) {
                    headerRowIdx = r;
                    isViMomoFormat = true;
                    log('VIMOMO', `Header ACCEPTED at row ${r}. CodeCol: ${codeColIdx}, AmountCol: ${amountColIdx}, NameCol: ${nameColIdx}`);
                    break;
                }
            }

            if (headerRowIdx === -1) {
                log('VIMOMO', `Header NOT found in sheet ${sheetName}`);
                return; // skip this sheet
            }

            const startRow = headerRowIdx + 1;

            for (let r = startRow; r < data.length; r++) {
                const row = data[r];
                if (!Array.isArray(row)) continue;

                let foundCode: string | null = null;
                let amount: string | undefined;
                let description: string | undefined;

                if (codeColIdx >= 0 && row[codeColIdx] !== undefined) {
                    const val = String(row[codeColIdx]).trim();
                    if (val.length > 0) {
                        foundCode = val.toUpperCase(); // accept any non-empty string like VNPT
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

            log('VIMOMO', `Sheet ${sheetName}: extracted ${extracted.length} codes`);
            if (extracted.length === 0) error = "Không tìm thấy mã nào";

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
                bankName: 'Ví Momo',
                transactionDate: transactionDate,
            });
        }
    });

    log('VIMOMO', `Finished processing. isViMomoFormat: ${isViMomoFormat}`);

    if (!isViMomoFormat) return null;

    return results;
};
