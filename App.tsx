import React, { useState } from 'react';
import { InputArea } from './components/InputArea';
import { FileUploader } from './components/FileUploader';
import { ResultsView } from './components/ResultsView';
import { compareLists } from './utils/compareLogic';
import { ComparisonResult, EnrichedCodeData } from './types';
import { log } from './utils/logger';
import { FileSpreadsheet, ArrowRightLeft, RefreshCw, Info } from 'lucide-react';

// Dữ liệu mẫu
const DEMO_A = `X065322
X065321
X006768
X139814
X066118
X153104
X056431
X004576
X050989
X070300`;

const DEMO_B = `X017555
X065322
X065321
X006768
X139814
X066118
X153104
X056431
X004576
X050989`;

const App: React.FC = () => {
  const [inputA, setInputA] = useState('');
  const [inputB, setInputB] = useState('');
  const [results, setResults] = useState<ComparisonResult | null>(null);
  const [uploadKeyA, setUploadKeyA] = useState(0);
  const [uploadKeyB, setUploadKeyB] = useState(0);


  // Store enriched data from file uploads for export
  const [enrichedDataA, setEnrichedDataA] = useState<EnrichedCodeData[]>([]);
  const [enrichedDataB, setEnrichedDataB] = useState<EnrichedCodeData[]>([]);

  // Store metadata for report filename
  const [reportMetadata, setReportMetadata] = useState<{ bankName?: string; transactionDate?: string }>({});

  const handleCompare = () => {
    const res = compareLists(inputA, inputB);
    setResults(res);
  };

  const loadDemo = () => {
    setInputA(DEMO_A);
    setInputB(DEMO_B);
    setResults(null);
  };

  const clearAll = () => {
    setInputA('');
    setInputB('');
    setResults(null);
    setEnrichedDataA([]);
    setEnrichedDataB([]);
    setReportMetadata({});
    setUploadKeyA(prev => prev + 1);
    setUploadKeyB(prev => prev + 1);
  };


  const handleDataLoadedA = React.useCallback((data: string) => setInputA(data), []);
  const handleEnrichedDataLoadedA = React.useCallback((data: EnrichedCodeData[]) => setEnrichedDataA(data), []);

  // Metadata can come from either file. We merge them, giving priority to existing values so A overrides B?? 
  // actually usually Bank Statement (B) has the detailed metadata (Date/BankName). Target List (A) might just be codes.
  // So maybe data from ANY source is good.
  const handleMetadataLoaded = React.useCallback((meta: { bankName?: string; transactionDate?: string }) => {
    log('App', `Metadata received:`, meta);
    setReportMetadata(prev => {
      // If we already have a value, keep it, unless the new one provides something missing
      // Or if B provides date but A didn't.
      return {
        bankName: prev.bankName || meta.bankName,
        transactionDate: prev.transactionDate || meta.transactionDate
      };
    });
  }, []);

  const handleDataLoadedB = React.useCallback((data: string) => setInputB(data), []);
  const handleEnrichedDataLoadedB = React.useCallback((data: EnrichedCodeData[]) => setEnrichedDataB(data), []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded text-white">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Đối Chiếu Mã KH</h1>
              <p className="text-xs text-gray-500">So sánh giá trị thực tế của 2 cột dữ liệu</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadDemo}
              className="text-gray-600 hover:text-gray-900 px-3 py-1.5 text-sm font-medium transition-colors"
            >
              Dữ liệu Mẫu
            </button>
            <button
              onClick={clearAll}
              className="text-red-500 hover:text-red-700 px-3 py-1.5 text-sm font-medium transition-colors flex items-center gap-1"
            >
              <RefreshCw size={14} /> Làm mới
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Input Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px] mb-8">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>Mã KH (Danh sách Gốc)</span>
                <span className="text-blue-600 text-xs bg-blue-50 px-2 py-0.5 rounded">Cột A</span>
              </div>
              <FileUploader
                key={`A-${uploadKeyA}`}
                onDataLoaded={handleDataLoadedA}
                onEnrichedDataLoaded={handleEnrichedDataLoadedA}
                onMetadataLoaded={handleMetadataLoaded}
                label="Nạp File Gốc"
              />
            </div>
            <InputArea
              label="Dán Mã KH (Cột A)"
              value={inputA}
              onChange={setInputA}
              onClear={() => {
                setInputA('');
                setEnrichedDataA([]);
                setUploadKeyA(prev => prev + 1);
              }}
              placeholder="X065322&#10;X065321&#10;..."
              color="blue"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-gray-700 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span>Thực Tế (Đã quét / Kiểm kê)</span>
                <span className="text-purple-600 text-xs bg-purple-50 px-2 py-0.5 rounded">Cột B</span>
              </div>
              <FileUploader
                key={`B-${uploadKeyB}`}
                onDataLoaded={handleDataLoadedB}
                onEnrichedDataLoaded={handleEnrichedDataLoadedB}
                onMetadataLoaded={handleMetadataLoaded}
                label="Nạp File Thực Tế"
                disableMetadataExtraction={true}
              />
            </div>
            <InputArea
              label="Dán Mã Thực tế (Cột B)"
              value={inputB}
              onChange={setInputB}
              onClear={() => {
                setInputB('');
                setEnrichedDataB([]);
                setUploadKeyB(prev => prev + 1);
              }}
              placeholder="X017555&#10;X065322&#10;..."
              color="purple"
            />
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex justify-center mb-10">
          <button
            onClick={handleCompare}
            disabled={!inputA && !inputB}
            className="group relative bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-lg"
          >
            <span>So Sánh Ngay</span>
            <ArrowRightLeft className="group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>

        {/* Results Section */}
        {results ? (
          <div id="results">
            <ResultsView
              results={results}
              labelA="Mã KH"
              labelB="Thực Tế"
              enrichedDataA={enrichedDataA}
              enrichedDataB={enrichedDataB}
              reportMetadata={reportMetadata}
            />
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
            <div className="inline-flex justify-center items-center w-12 h-12 rounded-full bg-blue-50 text-blue-500 mb-4">
              <Info size={24} />
            </div>
            <h3 className="text-lg font-medium text-gray-900">Sẵn sàng so sánh</h3>
            <p className="text-gray-500 mt-1 max-w-md mx-auto">
              Dán 2 cột Excel vào ô bên trên và bấm "So Sánh Ngay" để tìm ra các mã bị thiếu hoặc sai lệch.
            </p>
          </div>
        )}

      </main>

      <footer className="bg-white border-t mt-auto py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-400 text-sm">
          <p>Dán dữ liệu trực tiếp từ Excel. Dữ liệu được xử lý cục bộ trên trình duyệt của bạn.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;