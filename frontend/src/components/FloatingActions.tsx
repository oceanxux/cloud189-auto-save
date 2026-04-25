import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Cpu, MessageSquare, Link2, X } from 'lucide-react';
import { useClickOutside } from '../utils/useClickOutside';

interface FloatingActionsProps {
  onAction?: (actionId: string) => void;
}

const FloatingActions: React.FC<FloatingActionsProps> = ({ onAction }) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setIsOpen(false), isOpen);
  
  const actions = [
    { id: 'createTask', icon: Plus, label: '创建转存任务', color: 'bg-blue-600 text-white' },
    { id: 'cloudsaver', icon: Cpu, label: 'CloudSaver 工具', color: 'bg-emerald-500 text-white' },
    { id: 'chat', icon: MessageSquare, label: 'AI 交互助手', color: 'bg-purple-500 text-white' },
    { id: 'strm', icon: Link2, label: '手动生成 STRM', color: 'bg-indigo-500 text-white' },
  ];

  const handleAction = (id: string) => {
    if (onAction) onAction(id);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-3">
      <AnimatePresence>
        {isOpen && (
          <div className="flex flex-col items-end gap-3 mb-2">
            {actions.map((action, index) => (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, scale: 0.5, y: 20, x: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                exit={{ opacity: 0, scale: 0.5, y: 20, x: 20 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300, delay: index * 0.04 }}
                onClick={() => handleAction(action.id)}
                className="flex items-center gap-3 group"
              >
                <span className="px-4 py-2 glass-modal rounded-2xl text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {action.label}
                </span>
                <div className={`w-12 h-12 rounded-2xl ${action.color} flex items-center justify-center shadow-xl hover:scale-110 active:scale-90 transition-all ring-4 ring-white/10`}>
                  <action.icon size={20} strokeWidth={2.5} />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </AnimatePresence>
      
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-3xl ${isOpen ? 'bg-slate-800 text-white rotate-90' : 'bg-[var(--app-accent)] text-[var(--bg-main)] shadow-blue-500/20'} flex items-center justify-center shadow-2xl transition-all duration-500 hover:scale-105 active:scale-90 ring-4 ring-slate-400/10`}
      >
        {isOpen ? <X size={24} strokeWidth={3} /> : <Plus size={28} strokeWidth={3} />}
      </button>
    </div>
  );
};

export default FloatingActions;
