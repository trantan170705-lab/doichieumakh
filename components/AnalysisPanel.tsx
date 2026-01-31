import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { analyzeDiscrepancies } from '../services/geminiService';
import { ComparisonResult, AnalysisStatus } from '../types';

interface AnalysisPanelProps {
  results: ComparisonResult;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ results }) => {
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const [analysis, setAnalysis] = useState<string>('');

  const handleAnalyze = async () => {
    setStatus(AnalysisStatus.LOADING);
    const validA = results.processedA.filter(i => i.isValid).map(i => i.value);
    const validB = results.processedB.filter(i => i.isValid).map(i => i.value);
    
    const text = await analyzeDiscrepancies(
      validA,
      validB,
      results.inAOnly,
      results.inBOnly
    );
    
    setAnalysis(text);
    setStatus(AnalysisStatus.SUCCESS);
  };

  if (results.totalA === 0 && results.totalB === 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-lg p-6 shadow-sm mt-8">
      <div className="flex justify-between items-start mb-4">
        <div>
           <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-500" />
            AI Smart Analysis
           </h3>
           <p className="text-sm text-indigo-700 mt-1">
             Get insights into why your data might not be matching.
           </p>
        </div>
        {status === AnalysisStatus.IDLE && (
            <button 
                onClick={handleAnalyze}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            >
                <Sparkles size={16} /> Analyze Discrepancies
            </button>
        )}
      </div>

      {status === AnalysisStatus.LOADING && (
        <div className="flex items-center gap-3 text-indigo-600 py-4">
            <Loader2 className="animate-spin" />
            <span>Analyzing code patterns...</span>
        </div>
      )}

      {status === AnalysisStatus.SUCCESS && (
        <div className="prose prose-sm prose-indigo max-w-none bg-white/60 p-4 rounded-md border border-indigo-100">
            <div className="whitespace-pre-wrap leading-relaxed">
                {analysis}
            </div>
        </div>
      )}
    </div>
  );
};