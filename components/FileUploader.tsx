import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Upload, FileSpreadsheet, FileText, AlertTriangle, X, CheckSquare, Square, List } from 'lucide-react';
import { PasswordModal } from './PasswordModal';
import { EnrichedCodeData, SheetInfo } from '../types';
import { processBIDVPdf, processBIDVWorkbook } from '../utils/processors/NH_BIDV';
import { processAGRIWorkbook } from '../utils/processors/NH_AGRI';
import { processVIETINWorkbook } from '../utils/processors/NH_VIETIN';
import { processVIETCOMWorkbook } from '../utils/processors/NH_VIETCOM';
import { processLPWorkbook } from '../utils/processors/NH_LP';
import { readExcelWorkbook, getHeaders } from '../utils/excelHelper';

interface FileUploaderProps {
    onDataLoaded: (data: string) => void;
    onEnrichedDataLoaded?: (data: EnrichedCodeData[]) => void;
    onMetadataLoaded?: (metadata: { bankName?: string; transactionDate?: string }) => void;
    label?: string;
    disableMetadataExtraction?: boolean;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
    onDataLoaded,
    onEnrichedDataLoaded,
    onMetadataLoaded,
    label = "Nạp File",
    disableMetadataExtraction = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [showSheetList, setShowSheetList] = useState(false);

    // Password handling
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    // Re-calculate output whenever sheets selection changes
    useEffect(() => {
        const selectedSheets = sheets.filter(s => s.selected && !s.error);
        if (selectedSheets.length > 0) {
            const allData = selectedSheets.flatMap(s => s.data);
            onDataLoaded(allData.join('\n'));

            // Also send enriched data if callback provided
            if (onEnrichedDataLoaded) {
                const allEnriched = selectedSheets.flatMap(s => s.enrichedData || []);
                onEnrichedDataLoaded(allEnriched);
            }

            // Send metadata (Bank Name, Date) from the first selected sheet that has it
            if (onMetadataLoaded) {
                const metadataSource = selectedSheets.find(s => s.bankName || s.transactionDate);
                if (metadataSource) {
                    onMetadataLoaded({
                        bankName: metadataSource.bankName,
                        transactionDate: metadataSource.transactionDate
                    });
                } else {
                    onMetadataLoaded({});
                }
            }
        } else if (sheets.length > 0) {
            onDataLoaded("");
            if (onEnrichedDataLoaded) {
                onEnrichedDataLoaded([]);
            }
            if (onMetadataLoaded) onMetadataLoaded({});
        }
    }, [sheets, onDataLoaded, onEnrichedDataLoaded, onMetadataLoaded]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsProcessing(true);
        setPasswordError(null);

        const newSheets: SheetInfo[] = [];
        const fileList = Array.from(files) as File[];

        for (const file of fileList) {
            const ext = file.name.split('.').pop()?.toLowerCase();

            if (ext === 'pdf') {
                try {
                    await processBIDVPdf(file, newSheets);
                } catch (err: any) {
                    if (err.message === 'PASSWORD_REQUIRED') {
                        setPendingFile(file);
                        setPasswordModalOpen(true);
                        setIsProcessing(false);
                        return;
                    }
                }
            } else {
                // Excel files: Read workbook once, then decide which processor to use
                try {
                    const wb = await readExcelWorkbook(file);

                    // Calculate extractMetadata flag
                    const extractMetadata = !disableMetadataExtraction;

                    // Try processing as VietinBank first
                    const vietinResults = processVIETINWorkbook(wb, file.name, extractMetadata);

                    if (vietinResults) {
                        newSheets.push(...vietinResults);
                    } else {
                        // Try processing as Vietcombank
                        const vietcomResults = processVIETCOMWorkbook(wb, file.name, extractMetadata);

                        if (vietcomResults) {
                            newSheets.push(...vietcomResults);
                        } else {
                            // Try processing as LPBank
                            const lpResults = processLPWorkbook(wb, file.name, extractMetadata);

                            if (lpResults) {
                                newSheets.push(...lpResults);
                            } else {
                                // Try processing as BIDV
                                const bidvResults = processBIDVWorkbook(wb, file.name, extractMetadata);

                                if (bidvResults) {
                                    newSheets.push(...bidvResults);
                                } else {
                                    // Fallback to Agribank (generic format)
                                    const agriResults = processAGRIWorkbook(wb, file.name, extractMetadata);
                                    newSheets.push(...agriResults);
                                }
                            }
                        }
                    }

                } catch (e) {
                    console.error("Error reading Excel", e);
                    // Add error sheet
                    newSheets.push({
                        id: `${file.name}-error-${Date.now()}`,
                        fileId: file.name,
                        fileName: file.name,
                        sheetName: "Lỗi",
                        data: [],
                        error: "Lỗi đọc file Excel",
                        selected: false,
                        type: 'excel'
                    });
                }
            }
        }

        setSheets(newSheets);
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handlePasswordSubmit = async (password: string) => {
        if (!pendingFile) return;

        setIsProcessing(true);
        setPasswordModalOpen(false);

        const newSheets = [...sheets];

        try {
            await processBIDVPdf(pendingFile, newSheets, password);
            setSheets(newSheets);
            setPendingFile(null);
        } catch (err: any) {
            if (err.message === 'PASSWORD_REQUIRED') {
                alert("Mật khẩu không đúng hoặc file vẫn bị khóa.");
                setPasswordModalOpen(true);
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const toggleSheet = (id: string) => {
        setSheets(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
    };

    const toggleSelectAll = () => {
        const validSheets = sheets.filter(s => !s.error);
        const allSelected = validSheets.every(s => s.selected);
        setSheets(prev => prev.map(s => !s.error ? { ...s, selected: !allSelected } : s));
    };

    const selectedCount = sheets.filter(s => s.selected).length;

    const groupedSheets = useMemo(() => {
        const groups: Record<string, SheetInfo[]> = {};
        sheets.forEach(s => {
            if (!groups[s.fileName]) groups[s.fileName] = [];
            groups[s.fileName].push(s);
        });
        return groups;
    }, [sheets]);

    return (
        <div className="relative inline-block">
            <input
                type="file"
                multiple
                accept=".xlsx, .xls, .csv, .pdf"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
            />

            {passwordModalOpen && pendingFile && (
                <PasswordModal
                    fileName={pendingFile.name}
                    onSubmit={handlePasswordSubmit}
                    onCancel={() => {
                        setPasswordModalOpen(false);
                        setPendingFile(null);
                        setIsProcessing(false);
                    }}
                />
            )}

            <div className="flex gap-2">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded text-xs font-semibold transition-colors border border-green-200"
                >
                    <Upload size={14} />
                    {label}
                    {isProcessing && <span className="animate-spin ml-1">...</span>}
                </button>

                {sheets.length > 0 && (
                    <button
                        onClick={() => setShowSheetList(!showSheetList)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold border transition-colors ${showSheetList ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-50 text-gray-600 border-gray-200'}`}
                    >
                        <List size={14} />
                        {selectedCount} nguồn chọn
                    </button>
                )}
            </div>

            {/* Sheet List Popup */}
            {showSheetList && sheets.length > 0 && (
                <div className="absolute z-40 top-full left-0 mt-2 w-[450px] max-w-[90vw] bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col max-h-[500px] animate-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                        <div className="text-sm font-semibold text-gray-700">
                            Nguồn dữ liệu
                            <div className="text-xs font-normal text-gray-500">Tổng: {sheets.filter(s => s.selected).reduce((acc, s) => acc + s.data.length, 0)} mã</div>
                        </div>
                        <div className="flex gap-2 items-center">
                            <button
                                onClick={toggleSelectAll}
                                className="text-xs text-blue-600 hover:underline font-medium"
                            >
                                {sheets.filter(s => !s.error).every(s => s.selected) ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                            </button>
                            <button onClick={() => setShowSheetList(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="overflow-y-auto p-4 space-y-4">
                        {Object.keys(groupedSheets).map(fileName => {
                            const sheetsInFile = groupedSheets[fileName];

                            return (
                                <div key={fileName}>
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1 truncate" title={fileName}>
                                        {fileName.endsWith('.pdf') ? <FileText size={12} className="text-red-500" /> : <FileSpreadsheet size={12} className="text-green-600" />}
                                        <span className="truncate">{fileName}</span>
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {sheetsInFile.map(sheet => (
                                            <button
                                                key={sheet.id}
                                                onClick={() => !sheet.error && toggleSheet(sheet.id)}
                                                disabled={!!sheet.error}
                                                title={sheet.error || `${sheet.data.length} mã`}
                                                className={`
                                              flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium border transition-all max-w-full
                                              ${sheet.error
                                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                                        : sheet.selected
                                                            ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                                                    }
                                          `}
                                            >
                                                {sheet.selected ? <CheckSquare size={12} /> : <Square size={12} />}
                                                <span className="truncate max-w-[150px]">{sheet.sheetName}</span>
                                                {!sheet.error && <span className="bg-white/50 px-1 rounded text-[10px] ml-1 border">{sheet.data.length}</span>}
                                                {sheet.error && <AlertTriangle size={10} className="text-orange-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
