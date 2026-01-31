import React from 'react';
import { Upload, Trash2, ClipboardPaste } from 'lucide-react';

interface InputAreaProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  color: 'blue' | 'purple';
  onClear?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ label, value, onChange, placeholder, color, onClear }) => {
  const borderColor = color === 'blue' ? 'border-blue-200 focus:border-blue-500' : 'border-purple-200 focus:border-purple-500';
  const headerColor = color === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700';
  const iconColor = color === 'blue' ? 'text-blue-500' : 'text-purple-500';

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
    } catch (err) {
      console.error('Không thể đọc từ clipboard: ', err);
    }
  };

  return (
    <div className="flex flex-col h-full shadow-sm rounded-lg overflow-hidden border border-gray-200 bg-white">
      <div className={`px-4 py-3 border-b flex justify-between items-center ${headerColor}`}>
        <h3 className="font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
          {color === 'blue' ? <Upload size={16} /> : <Upload size={16} />}
          {label}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handlePaste}
            title="Dán từ Clipboard"
            className={`p-1.5 hover:bg-white rounded transition-colors ${iconColor}`}
          >
            <ClipboardPaste size={16} />
          </button>
          <button
            onClick={() => onClear ? onClear() : onChange('')}
            title="Xóa hết"
            className="p-1.5 hover:bg-white rounded transition-colors text-red-400 hover:text-red-600"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <textarea
        className={`flex-1 w-full p-4 font-mono text-sm resize-none outline-none border-2 border-transparent transition-all ${borderColor}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500 flex justify-between">
        <span>{value.split('\n').filter(Boolean).length} hàng</span>
      </div>
    </div>
  );
};