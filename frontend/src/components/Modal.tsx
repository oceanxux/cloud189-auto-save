import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200]"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="fixed left-1/2 top-1/2 z-[201] max-h-[calc(100vh-1rem)] w-[calc(100vw-1rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[30px] border border-[var(--modal-border)] bg-[var(--modal-bg)] text-[var(--text-primary)] shadow-[var(--app-shadow)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--modal-border)] bg-[linear-gradient(180deg,rgba(20,89,199,0.06),rgba(255,255,255,0))] px-4 py-4 md:px-8 md:py-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">Workspace Panel</p>
              <h3 className="mt-1 truncate text-lg font-extrabold tracking-tight text-[var(--text-primary)] md:text-2xl">{title}</h3>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 rounded-full transition-colors text-[var(--text-secondary)]">
              <X size={24} />
            </button>
          </div>
          <div className="px-4 pb-4 md:px-8 md:pb-6 max-h-[calc(100vh-9rem)] md:max-h-[60vh] overflow-y-auto">
            {children}
          </div>
          {footer !== undefined ? (
            footer
          ) : (
            <div className="px-4 py-4 md:px-8 md:py-6 flex flex-col-reverse md:flex-row justify-end gap-3">
              <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-medium text-[#0b57d0] hover:bg-[#0b57d0]/10 transition-colors">
                取消
              </button>
              <button type="submit" form="modal-form" className="px-6 py-2.5 rounded-full text-sm font-medium bg-[#0b57d0] text-white hover:bg-[#0b57d0]/90 transition-colors shadow-sm">
                确认提交
              </button>
            </div>
          )}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

export default Modal;
