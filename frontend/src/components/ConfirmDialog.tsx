import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ 
  isOpen, onClose, onConfirm, title, message, 
  confirmText = "确认", cancelText = "取消", type = 'info' 
}) => {
  if (typeof document === 'undefined') return null;
  
  const colors = {
    danger: {
      border: 'border-rose-200/80 dark:border-rose-900/50',
      bg: 'bg-rose-50/95 dark:bg-rose-950/40',
      iconWrap: 'bg-rose-500 text-white',
      icon: <AlertTriangle size={18} strokeWidth={3} />,
      btn: 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/25'
    },
    warning: {
      border: 'border-amber-200/80 dark:border-amber-900/50',
      bg: 'bg-amber-50/95 dark:bg-amber-950/40',
      iconWrap: 'bg-amber-500 text-white',
      icon: <AlertTriangle size={18} strokeWidth={3} />,
      btn: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25'
    },
    info: {
      border: 'border-emerald-200/80 dark:border-emerald-900/50',
      bg: 'bg-emerald-50/95 dark:bg-emerald-950/40',
      iconWrap: 'bg-emerald-500 text-white',
      icon: <HelpCircle size={18} strokeWidth={3} />,
      btn: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25'
    }
  };

  const config = colors[type];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9998] pointer-events-none">
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18, scale: 0.96 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className={`pointer-events-auto fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.75rem)] w-[min(92vw,560px)] -translate-x-1/2 rounded-[24px] border px-4 py-4 shadow-[0_22px_70px_-28px_rgba(15,23,42,0.55)] backdrop-blur-2xl sm:top-7 sm:rounded-[28px] sm:px-5 ${config.border} ${config.bg}`}
          >
            <div className="flex items-start gap-4">
              <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${config.iconWrap}`}>
                {config.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-black text-[var(--text-primary)]">{title}</h3>
                    <p className="mt-1 text-xs font-bold leading-5 text-[var(--text-secondary)]">{message}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="shrink-0 rounded-xl p-1.5 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={onClose}
                    className="rounded-2xl bg-white/70 px-5 py-2 text-xs font-black text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:text-slate-800 active:translate-y-0 dark:bg-slate-900/50 dark:hover:text-slate-100"
                  >
                    {cancelText}
                  </button>
                  <button
                    onClick={() => { onConfirm(); onClose(); }}
                    className={`rounded-2xl px-6 py-2 text-xs font-black shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0 ${config.btn}`}
                  >
                    {confirmText}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmDialog;
