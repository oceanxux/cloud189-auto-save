import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  isVisible: boolean;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const icons = {
    success: <CheckCircle2 className="text-emerald-500" size={18} />,
    error: <AlertCircle className="text-rose-500" size={18} />,
    info: <Info className="text-blue-500" size={18} />
  };

  const colors = {
    success: 'border-emerald-500/20 bg-emerald-50/90 dark:bg-emerald-950/30',
    error: 'border-rose-500/20 bg-rose-50/90 dark:bg-rose-950/30',
    info: 'border-blue-500/20 bg-blue-50/90 dark:bg-blue-950/30'
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.9, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -20, scale: 0.9, filter: 'blur(10px)' }}
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 px-5 py-3.5 
            rounded-2xl border backdrop-blur-xl shadow-[0_12px_40px_-12px_rgba(0,0,0,0.2)] ${colors[type]}`}
        >
          {icons[type]}
          <span className="text-xs font-black text-[var(--text-primary)]">{message}</span>
          <button 
            onClick={onClose}
            className="ml-2 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X size={14} className="text-slate-400" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
