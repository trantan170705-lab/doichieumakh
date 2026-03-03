
import * as XLSX from 'xlsx';
import { ComparisonResult, EnrichedCodeData, ProcessedItem } from '../types';
import { log } from './logger';

interface ExportOptions {
    results: ComparisonResult;
    labelA: string;
    labelB: string;
    enrichedDataA?: EnrichedCodeData[];
    enrichedDataB?: EnrichedCodeData[];
    filename?: string;
    metadata?: { bankName?: string; transactionDate?: string };
}

export const exportMasterReport = ({
    results,
    labelA,
    labelB,
    enrichedDataA = [],
    enrichedDataB = [],
    filename = 'BaoCao_DoiChieu',
    metadata
}: ExportOptions) => {
    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Tổng Hợp (Summary) ---
    const summaryData = [
        ['BÁO CÁO TỔNG HỢP ĐỐI CHIẾU MÃ KHÁCH HÀNG'],
        [''],
        ['Thời gian xuất:', new Date().toLocaleString('vi-VN')],
        [''],
        ['THÔNG TIN', 'SỐ LƯỢNG', 'GHI CHÚ'],
        [`Tổng số mã trong ${labelA}`, results.totalA, ''],
        [`Tổng số mã trong ${labelB}`, results.totalB, ''],
        [''],
        ['KẾT QUẢ ĐỐI CHIẾU', '', ''],
        ['Mã khớp (Có ở cả 2 bên)', results.intersection.length, 'OK'],
        [`Lệch: Thiếu trong ${labelB}`, results.inAOnly.length, `Có ở ${labelA} nhưng không có ở ${labelB}`],
        [`Lệch: Thừa trong ${labelB}`, results.inBOnly.length, `Có ở ${labelB} nhưng khôgn có ở ${labelA}`],
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

    // Basic styling for Summary via column widths
    wsSummary['!cols'] = [{ wch: 35 }, { wch: 15 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, "TongHop");

    // --- Sheet 2: Chi Tiết (Details) ---
    // We want to list ALL occurrences involved instead of unique codes
    // so that duplicated "Mã thừa" transfers are fully visible.
    const allItems: { code: string; status: string; statusGroup: string }[] = [];

    // Create frequency map to identify duplicates across all results
    const frequencyMap = new Map<string, number>();

    // Add all items and count them
    const recordItem = (code: string, status: string, statusGroup: string) => {
        allItems.push({ code, status, statusGroup });
        frequencyMap.set(code, (frequencyMap.get(code) || 0) + 1);
    };

    results.intersection.forEach(code => recordItem(code, 'Khớp', 'MATCH'));
    results.inAOnly.forEach(code => recordItem(code, `Thiếu trong ${labelB}`, 'MISSING'));
    results.inBOnly.forEach(code => recordItem(code, `Thừa trong ${labelB}`, 'EXTRA'));

    // Sort to group identical codes together
    allItems.sort((a, b) => a.code.localeCompare(b.code));

    // Helper to get enriched data
    const mapA = new Map(enrichedDataA.map(d => [d.code, d]));
    const mapB = new Map(enrichedDataB.map(d => [d.code, d]));

    const parseAmount = (amt?: string) => {
        if (!amt) return null;
        const num = parseFloat(amt.replace(/,/g, ''));
        return isNaN(num) ? 0 : num;
    };

    const detailRows = allItems.map((item, index) => {
        const infoA = mapA.get(item.code);
        const infoB = mapB.get(item.code);
        const count = frequencyMap.get(item.code) || 1;
        const note = count > 1 ? `Chuyển đúp (${count} lần)` : '';

        return {
            'STT': index + 1,
            'Mã KH': item.code,
            'Trạng Thái': item.status,
            [`Số tiền (${labelA})`]: parseAmount(infoA?.amount),
            [`Diễn giải (${labelA})`]: infoA?.description || '',
            [`Số tiền (${labelB})`]: parseAmount(infoB?.amount),
            [`Diễn giải (${labelB})`]: infoB?.description || '',
            'Ghi chú': note
        };
    });

    const wsDetail = XLSX.utils.json_to_sheet(detailRows);

    // Auto-width for details
    wsDetail['!cols'] = [
        { wch: 5 },  // STT
        { wch: 15 }, // Code
        { wch: 25 }, // Status
        { wch: 15 }, // Amount A
        { wch: 40 }, // Desc A
        { wch: 15 }, // Amount B
        { wch: 40 }, // Desc B
        { wch: 20 }  // Note
    ];


    XLSX.utils.book_append_sheet(wb, wsDetail, "ChiTiet_ToanBo");


    // --- Sheet 3: Chi Tiết Thiếu (Missing in B) ---
    // Always create sheet even if empty
    const missingRows = results.inAOnly.map((code, idx) => {
        const info = mapA.get(code);
        const count = frequencyMap.get(code) || 1;
        const note = count > 1 ? `Chuyển đúp (${count} lần)` : '';

        return {
            'STT': idx + 1,
            'Mã KH': code,
            'Diễn giải': info?.description || '',
            'Số tiền': parseAmount(info?.amount),
            'Ghi chú': note
        };
    });
    const wsMissing = XLSX.utils.json_to_sheet(missingRows.length > 0 ? missingRows : [{}]);
    if (missingRows.length === 0) {
        XLSX.utils.sheet_add_aoa(wsMissing, [['STT', 'Mã KH', 'Diễn giải', 'Số tiền', 'Ghi chú']], { origin: "A1" });
    }
    wsMissing['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 40 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsMissing, "Thieu_Trong_ThucTe");


    // --- Sheet 4: Chi Tiết Thừa (Extra in B) ---
    // Always create sheet even if empty
    const extraRows = results.inBOnly.map((code, idx) => {
        const info = mapB.get(code);
        const count = frequencyMap.get(code) || 1;
        const note = count > 1 ? `Chuyển đúp (${count} lần)` : '';

        return {
            'STT': idx + 1,
            'Mã KH': code,
            'Diễn giải': info?.description || '',
            'Số tiền': parseAmount(info?.amount),
            'Ghi chú': note
        };
    });
    const wsExtra = XLSX.utils.json_to_sheet(extraRows.length > 0 ? extraRows : [{}]);
    if (extraRows.length === 0) {
        XLSX.utils.sheet_add_aoa(wsExtra, [['STT', 'Mã KH', 'Diễn giải', 'Số tiền', 'Ghi chú']], { origin: "A1" });
    }
    wsExtra['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 40 }, { wch: 15 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsExtra, "Thua_Trong_ThucTe");


    // Write file
    // Write file
    let finalKey = filename;

    // Custom filename logic if metadata exists
    log('exportMasterReport', `Metadata received:`, metadata);
    if (metadata?.transactionDate && metadata?.bankName) {
        try {
            log('exportMasterReport', `Formatting filename with:`, metadata);
            // metadata.transactionDate format: "29/01/2026 12:00:00 AM" or similar
            // We need "29-01"
            const parts = metadata.transactionDate.split(/[\s/]/); // Split by space or slash
            if (parts.length >= 2) {
                const day = parts[0];
                const month = parts[1];

                // Clean bank name: Remove "Ngân hàng " prefix
                let cleanBank = metadata.bankName.replace(/ngân hàng\s+/i, '').trim();
                // Or if it starts with "NH ", remove that too
                cleanBank = cleanBank.replace(/^NH\s+/i, '').trim();

                // Construct new filename: "VietinBank_29-01"
                // Replace spaces in bank name with nothing or keep? User example: "VietinBank" (has no space). 
                // "Liên Việt" -> "LiênViệt". 
                cleanBank = cleanBank.replace(/\s+/g, '');

                finalKey = `${cleanBank}_${day}-${month}`;
                log('exportMasterReport', `Generated Filename: ${finalKey}`);
            }
        } catch (e) {
            console.error("Error formatting filename", e);
        }
    } else {
        log('exportMasterReport', 'Missing metadata, using fallback filename.');
        // Fallback default date suffix
        finalKey = `${filename}_${new Date().toISOString().slice(0, 10)}`;
    }

    if (!finalKey.endsWith('.xlsx')) finalKey += '.xlsx';

    XLSX.writeFile(wb, finalKey);
};
