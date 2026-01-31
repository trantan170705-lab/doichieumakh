// Basic types for code comparison

export interface ProcessedItem {
  value: string;
  originalIndex: number;
  existsInOther: boolean;
  isValid: boolean;
  isDuplicate: boolean;
}

export interface ComparisonResult {
  inAOnly: string[];
  inBOnly: string[];
  intersection: string[];
  totalA: number;
  totalB: number;
  processedA: ProcessedItem[];
  processedB: ProcessedItem[];
}

export enum AnalysisStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// Enriched data for export functionality
export interface EnrichedCodeData {
  code: string;           // Mã KH (e.g., X052373)
  amount?: string;        // Số tiền / Credit Amount
  description?: string;   // Diễn giải / Nội dung
  source?: 'pdf' | 'excel';
}

// Map from code to its enriched data
export type EnrichedDataMap = Map<string, EnrichedCodeData>;

export interface SheetInfo {
  id: string;
  fileId: string;
  fileName: string;
  sheetName: string;
  data: string[];
  enrichedData?: EnrichedCodeData[];
  error?: string;
  selected: boolean;
  type: 'excel' | 'pdf';
  bankName?: string;
  transactionDate?: string;
}
