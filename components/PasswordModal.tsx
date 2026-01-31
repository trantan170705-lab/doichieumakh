import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';

interface PasswordModalProps {
    fileName: string;
    onSubmit: (password: string) => void;
    onCancel: () => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({ fileName, onSubmit, onCancel }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) {
            setError(true);
            return;
        }
        onSubmit(password);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                        <Lock size={18} className="text-gray-500" />
                        Bảo mật PDF
                    </h3>
                    <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        File <span className="font-semibold text-gray-900">{fileName}</span> được bảo vệ bằng mật khẩu. Vui lòng nhập mật khẩu để tiếp tục.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError(false);
                                }}
                                placeholder="Nhập mật khẩu..."
                                autoFocus
                                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-all ${error
                                        ? 'border-red-300 focus:ring-red-100'
                                        : 'border-gray-300 focus:ring-blue-100 focus:border-blue-400'
                                    }`}
                            />
                            {error && <p className="text-red-500 text-xs mt-1">Vui lòng nhập mật khẩu</p>}
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                            >
                                Mở khóa
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
