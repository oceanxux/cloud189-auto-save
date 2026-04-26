import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Sparkles } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  variant?: 'default' | 'plain';
  hideDefaultFooter?: boolean;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, className = "", variant = 'default', hideDefaultFooter = false }) => {
  if (typeof document === 'undefined') return null;

  const isPlain = variant === 'plain';

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center overflow-y-auto p-3 sm:items-center sm:p-10">
          {/* Backdrop with enhanced blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xl dark:bg-slate-950/60"
          />

          {/* Modal Content */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 24 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300, mass: 0.8 }}
            className={`relative flex w-full max-w-2xl flex-col overflow-hidden rounded-[24px] sm:rounded-[32px]
              ${isPlain
                ? 'bg-white dark:bg-slate-900 shadow-[0_18px_60px_-18px_rgba(15,23,42,0.28)] border-0 backdrop-blur-none'
                : 'bg-white/80 dark:bg-slate-900/80 shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] border border-white/40 dark:border-white/10 backdrop-blur-3xl'}
              max-h-[calc(100dvh-1.5rem)] transition-all sm:max-h-[90vh] ${className}`}
          >
            {/* Glossy Overlay for Header */}
            {!isPlain && <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-white/40 dark:from-white/5 to-transparent pointer-events-none" />}

            {/* Header */}
            <div className={`relative flex items-center justify-between gap-4 ${isPlain ? 'px-5 py-4 sm:px-7 sm:py-5 border-b border-[var(--border-color)]' : 'px-5 py-5 sm:px-10 sm:py-8'}`}>
              <div className="flex flex-col gap-1">
                {!isPlain && (
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-[var(--app-accent)] animate-pulse" />
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--app-accent)] opacity-80">Workspace Action</p>
                  </div>
                )}
                <h3 className={`${isPlain ? 'text-lg' : 'text-2xl drop-shadow-sm'} font-black tracking-tight text-[var(--text-primary)]`}>{title}</h3>
              </div>
              <button 
                onClick={onClose} 
                className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12
                  bg-slate-100/50 dark:bg-slate-800/50 hover:bg-red-500 hover:text-white
                  transition-all duration-300 active:scale-90 overflow-hidden"
              >
                <X size={20} strokeWidth={3} className="relative z-10 transition-transform group-hover:rotate-90" />
              </button>
            </div>

            {/* Content with subtle scroll indicator */}
            <div className={`relative flex-1 overflow-y-auto custom-scrollbar-hidden scroll-smooth ${isPlain ? 'px-5 pb-6 pt-4 sm:px-7 sm:pb-7 sm:pt-5' : 'px-5 pb-6 pt-1 sm:px-10 sm:pb-10 sm:pt-2'}`}>
              <div className="text-[var(--text-primary)]">
                {children}
              </div>
            </div>

            {/* Footer with high contrast layout */}
            {footer != null ? (
              <div className="relative border-t border-slate-200/40 dark:border-white/5 bg-slate-50/30 dark:bg-black/10 px-5 py-4 sm:px-10 sm:py-6">
                {footer}
              </div>
            ) : !hideDefaultFooter ? (
              <div className="relative border-t border-slate-200/40 dark:border-white/5 bg-slate-50/30 dark:bg-black/10 px-5 py-4 sm:px-10 sm:py-6 flex flex-col sm:flex-row justify-end gap-4">
                <button 
                  onClick={onClose} 
                  className="px-6 py-3 rounded-2xl text-xs font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  form="modal-form" 
                  className="px-8 py-3 bg-[var(--app-accent)] text-[var(--bg-main)] rounded-2xl text-xs font-black
                    shadow-[0_12px_32px_-8px_rgba(var(--app-accent-rgb),0.5)] 
                    hover:translate-y-[-2px] hover:shadow-[0_16px_40px_-8px_rgba(var(--app-accent-rgb),0.6)]
                    active:translate-y-0 transition-all duration-300"
                >
                  确认并执行
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
