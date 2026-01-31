import React from 'react';
import * as XLSX from 'xlsx';
import { ComparisonResult, ProcessedItem, EnrichedCodeData } from '../types';
import { Check, AlertCircle, Copy, Download, FileDown } from 'lucide-react';
import { exportMasterReport } from '../utils/reportExporter';
import { log } from '../utils/logger';

interface ResultsViewProps {
  results: ComparisonResult;
  labelA: string;
  labelB: string;
  enrichedDataA?: EnrichedCodeData[];
  enrichedDataB?: EnrichedCodeData[];
  reportMetadata?: { bankName?: string; transactionDate?: string };
}

const ListColumn: React.FC<{ items: ProcessedItem[], title: string, color: 'blue' | 'purple' }> = ({ items, title, color }) => {
  return (
    <div className="flex flex-col h-[500px] border rounded-lg bg-white overflow-hidden shadow-sm">
      <div className={`p-3 font-semibold text-sm border-b ${color === 'blue' ? 'bg-blue-50 text-blue-800' : 'bg-purple-50 text-purple-800'}`}>
        {title} (Đối chiếu)
      </div>
      <div className="overflow-y-auto flex-1 p-0">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 w-12 text-center">Hàng</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 text-left">Giá trị</th>
              <th className="px-4 py-2 text-xs font-medium text-gray-500 w-24 text-right">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              if (!item.isValid) return null;

              if (!item.value) {
                return (
                  <tr key={idx} className="border-b border-gray-100 bg-gray-50">
                    <td className="px-2 py-1 text-center text-gray-400 text-xs font-mono">{idx + 1}</td>
                    <td className="px-4 py-1 text-gray-400 italic">(trống)</td>
                    <td></td>
                  </tr>
                )
              }

              const isMatch = item.existsInOther;
              const isDuplicate = item.isDuplicate;

              let rowClass = '';
              let icon = null;

              if (isMatch) {
                rowClass = 'bg-green-50 hover:bg-green-100 text-green-900';
                icon = <Check size={14} className="text-green-600 ml-auto" />;
              } else {
                rowClass = 'bg-red-50 hover:bg-red-100 text-red-900 font-medium';
                icon = <AlertCircle size={14} className="text-red-500 ml-auto" />;
              }

              if (isDuplicate) {
                rowClass = 'bg-yellow-50 hover:bg-yellow-100 text-yellow-900';
              }

              return (
                <tr key={idx} className={`border-b border-gray-100 transition-colors ${rowClass}`}>
                  <td className="px-2 py-1.5 text-center text-gray-500 text-xs font-mono border-r border-gray-200/50">{idx + 1}</td>
                  <td className="px-4 py-1.5 font-mono flex items-center gap-2">
                    {item.value}
                    {isDuplicate && (
                      <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded border border-yellow-300">
                        Trùng
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5 text-right align-middle">
                    {icon}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface MissingListProps {
  items: string[];
  title: string;
  subtitle: string;
  color: string;
  enrichedData?: EnrichedCodeData[];
  showExport?: boolean;
  exportFilename?: string;
  codeHeader?: string;
}

const MissingList: React.FC<MissingListProps> = ({ items, title, subtitle, color, enrichedData, showExport, exportFilename = 'export', codeHeader = 'Mã KH' }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(items.join('\n'));
  };

  const handleExport = () => {
    if (!enrichedData || enrichedData.length === 0) {
      // Fallback: export codes only
      const data = items.map(code => ({ code, amount: null, description: '' }));
      exportToExcel(data, exportFilename, codeHeader);
      return;
    }

    // Create a map for quick lookup
    const dataMap = new Map<string, EnrichedCodeData>();
    enrichedData.forEach(d => dataMap.set(d.code, d));

    // Build export data with amounts as numbers
    const exportData = items.map(code => {
      const enriched = dataMap.get(code);
      // Parse amount string to number (remove commas)
      let amountNum: number | null = null;
      if (enriched?.amount) {
        const parsed = parseFloat(enriched.amount.replace(/,/g, ''));
        if (!isNaN(parsed)) {
          amountNum = parsed;
        }
      }
      return {
        code,
        amount: amountNum,
        description: enriched?.description || ''
      };
    });

    exportToExcel(exportData, exportFilename, codeHeader);
  };

  if (items.length === 0) return null;

  return (
    <div className={`rounded-lg border overflow-hidden ${color}`}>
      <div className="px-4 py-3 border-b bg-white/50 flex justify-between items-center">
        <div>
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            {title} <span className="bg-white px-2 py-0.5 rounded-full text-xs border shadow-sm">{items.length}</span>
          </h4>
          <p className="text-xs opacity-80 mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={handleCopy} className="text-xs flex items-center gap-1 hover:underline font-medium px-2 py-1 bg-white/50 rounded whitespace-nowrap">
            <Copy size={12} /> Sao chép
          </button>
          {showExport && (
            <button
              onClick={handleExport}
              className="text-xs flex items-center gap-1 hover:underline font-medium px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200 whitespace-nowrap"
            >
              <Download size={12} /> Xuất Excel
            </button>
          )}
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2 bg-white/30">
        <div className="flex flex-wrap gap-2">
          {items.map((item, i) => (
            <span key={i} className="inline-flex items-center px-2 py-1 rounded text-xs font-mono bg-white border shadow-sm">
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper function to export data to Excel with proper number formatting
const exportToExcel = (data: { code: string; amount: number | null; description: string }[], filename: string, codeHeader: string) => {
  // Calculate total
  const totalAmount = data.reduce((sum, row) => sum + (row.amount || 0), 0);

  // Convert to export format with proper column names
  const exportRows = data.map(row => ({
    [codeHeader]: row.code,
    'Số tiền': row.amount,
    'Diễn giải/Nội dung': row.description
  }));

  // Add total row
  exportRows.push({
    [codeHeader]: 'TỔNG CỘNG',
    'Số tiền': totalAmount,
    'Diễn giải/Nội dung': `${data.length} mã thừa/lạ`
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mã thừa');

  // Auto-size columns
  const colWidths = [
    { wch: 12 }, // Mã 
    { wch: 15 }, // Số tiền
    { wch: 80 }  // Diễn giải
  ];
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

export const ResultsView: React.FC<ResultsViewProps> = ({ results, labelA, labelB, enrichedDataA, enrichedDataB, reportMetadata }) => {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Actions */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            log('ResultsView', `Exporting report. Metadata passed:`, reportMetadata);
            exportMasterReport({ results, labelA, labelB, enrichedDataA, enrichedDataB, metadata: reportMetadata });
          }}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-sm transition-colors font-medium text-sm"
        >
          <FileDown size={18} />
          Xuất Báo Cáo Tổng Thể
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Tổng Trùng Khớp</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-green-600">{results.intersection.length}</span>
            <span className="text-sm text-gray-500 mb-1">mã có ở cả 2 bên</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Thiếu ở cột {labelB}</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-orange-500">{results.inAOnly.length}</span>
            <span className="text-sm text-gray-500 mb-1">có trong {labelA} nhưng chưa có ở {labelB}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Thừa ở cột {labelB}</div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-red-500">{results.inBOnly.length}</span>
            <span className="text-sm text-gray-500 mb-1">có trong {labelB} nhưng không có ở {labelA}</span>
          </div>
        </div>
      </div>

      {/* Visual Comparison Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ListColumn items={results.processedA} title={labelA} color="blue" />
        <ListColumn items={results.processedB} title={labelB} color="purple" />
      </div>

      {/* Detailed Diff Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Missing in Actual - Left Side */}
        <div>
          <MissingList
            items={results.inAOnly}
            title={`Thiếu trong cột Thực Tế`}
            subtitle={`Các mã này nằm trong ${labelA} nhưng không tìm thấy ở ${labelB}`}
            color="bg-orange-50 text-orange-900 border-orange-200"
            enrichedData={enrichedDataA}
            showExport={false}
            codeHeader="Mã KH"
          />
        </div>

        {/* Extra in Actual - Right Side */}
        <div>
          <MissingList
            items={results.inBOnly}
            title={`Mã lạ / Mã thừa`}
            subtitle={`Các mã này xuất hiện ở ${labelB} nhưng không có trong kế hoạch (${labelA})`}
            color="bg-red-50 text-red-900 border-red-200"
            enrichedData={enrichedDataB}
            showExport={false}
            codeHeader="Mã Thực Tế"
          />
        </div>
      </div>
    </div>
  );
};