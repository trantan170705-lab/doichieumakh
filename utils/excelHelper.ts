import * as XLSX from 'xlsx';

export const readExcelWorkbook = (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const arr = evt.target?.result;
                const wb = XLSX.read(arr, { type: 'array' });
                resolve(wb);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsArrayBuffer(file);
    });
};

export const getHeaders = (ws: XLSX.WorkSheet): string[] => {
    const data = safeSheetToJson(ws);
    if (!data || data.length === 0) return [];

    // Scan first 10 rows for a likely header row
    // A header row usually has multiple string columns
    for (let r = 0; r < Math.min(data.length, 10); r++) {
        const row = data[r];
        if (!Array.isArray(row)) continue;

        // Simple heuristic: Row matches if it has at least 2 string cells
        const stringCells = row.filter(c => typeof c === 'string').length;
        if (stringCells >= 2) {
            return row.map(c => String(c || '').toLowerCase().trim());
        }
    }
    return [];
};

export const safeSheetToJson = (ws: XLSX.WorkSheet): any[][] => {
    if (!ws) return [];

    // Recalculate !ref by finding max row and col
    let maxRow = 0;
    let maxCol = 0;
    let hasKeys = false;

    for (let key in ws) {
        if (key.startsWith('!')) continue;
        hasKeys = true;
        const addr = XLSX.utils.decode_cell(key);
        if (addr.r > maxRow) maxRow = addr.r;
        if (addr.c > maxCol) maxCol = addr.c;
    }

    if (hasKeys) {
        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
    }

    return XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
};
