import React, { useState, useEffect } from 'react';
import { Search, ExternalLink, Plus, RefreshCw, X, Check } from 'lucide-react';
import Modal from './Modal';

interface CloudSaverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransfer: (data: any) => void;
}

const CloudSaverModal: React.FC<CloudSaverModalProps> = ({ isOpen, onClose, onTransfer }) => {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/cloudsaver/search?keyword=${encodeURIComponent(keyword.trim())}`);
      const data = await response.json();
      if (data.success) {
        setResults(data.data || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="CloudSaver 资源搜索"
      footer={null}
    >
      <div className="space-y-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜索网盘资源..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-[#0b57d0]/20"
            />
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <button 
            onClick={handleSearch}
            className="px-6 py-3 bg-[#0b57d0] text-white rounded-2xl text-sm font-medium hover:bg-[#0b57d0]/90 transition-all flex items-center gap-2"
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Search size={18} />} 搜索
          </button>
        </div>

        <div className="max-h-[400px] overflow-y-auto space-y-3 custom-scrollbar pr-1">
          {loading ? (
            <div className="text-center py-20 text-slate-500">正在搜索优质资源...</div>
          ) : results.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              {keyword ? '未找到相关资源' : '输入关键字开始搜索'}
            </div>
          ) : results.map((res, i) => (
            <div key={i} className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-[#0b57d0]/30 transition-all group">
              <div className="flex justify-between items-start gap-4">
                <div className="space-y-1">
                  <h4 className="font-medium text-slate-900 line-clamp-2 leading-snug">{res.title}</h4>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{res.size || '未知大小'}</span>
                    <span>{res.date || '未知日期'}</span>
                  </div>
                </div>
                <button 
                  onClick={() => onTransfer({
                    shareLink: res.url,
                    accessCode: res.accessCode || '',
                    taskName: res.title
                  })}
                  className="shrink-0 p-2.5 bg-[#c4eed0] text-[#146c2e] rounded-xl hover:bg-[#b2e7c0] transition-colors"
                  title="一键转存"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          ))}
        </div>
        
        <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 flex items-start gap-3">
          <ExternalLink size={18} className="text-[#0b57d0] shrink-0 mt-0.5" />
          <p className="text-[10px] text-[#0b57d0] leading-relaxed">
            提示：CloudSaver 会检索公开分享的资源。转存前请确保您的账号空间充足。部分资源可能需要提取码。
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default CloudSaverModal;