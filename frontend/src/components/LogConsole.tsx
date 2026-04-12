import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, RefreshCw, Trash2, Download } from 'lucide-react';
import Modal from './Modal';

interface LogConsoleProps {
  isOpen: boolean;
  onClose: () => void;
}

const LogConsole: React.FC<LogConsoleProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Connect to SSE
      const eventSource = new EventSource('/api/logs/stream');
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const newLog = event.data;
        setLogs(prev => [...prev, newLog].slice(-500)); // Keep last 500 logs
      };

      eventSource.onerror = (err) => {
        console.error('SSE Error:', err);
        eventSource.close();
      };

      return () => {
        eventSource.close();
      };
    }
  }, [isOpen]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const clearLogs = () => setLogs([]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="系统实时日志"
      footer={
        <div className="px-8 py-4 flex justify-between items-center bg-slate-50 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={e => setAutoScroll(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#0b57d0] focus:ring-[#0b57d0]/20"
            />
            <span className="text-sm text-slate-600">自动滚动</span>
          </label>
          <div className="flex gap-3">
            <button 
              onClick={clearLogs}
              className="p-2.5 hover:bg-red-50 text-red-500 rounded-full transition-colors"
              title="清空显示"
            >
              <Trash2 size={20} />
            </button>
            <button 
              onClick={onClose}
              className="px-6 py-2 bg-[#0b57d0] text-white rounded-full text-sm font-medium hover:bg-[#0b57d0]/90 transition-all"
            >
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div 
        ref={scrollRef}
        className="bg-slate-900 rounded-2xl p-4 font-mono text-xs text-green-400 h-[400px] overflow-y-auto custom-scrollbar"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 italic">
            <Terminal size={48} className="mb-4 opacity-20" />
            等待日志输出...
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="py-0.5 border-b border-white/5 last:border-0">
              <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
              {log}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

export default LogConsole;