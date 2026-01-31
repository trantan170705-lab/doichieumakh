import * as XLSX from 'xlsx';

export const readExcelWorkbook = (file: File): Promise<XLSX.WorkBook> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                resolve(wb);
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsBinaryString(file);
    });
};

export const getHeaders = (ws: XLSX.WorkSheet): string[] => {
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
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
