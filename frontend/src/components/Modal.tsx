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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1rem)] max-w-2xl max-h-[calc(100vh-1rem)] rounded-2xl md:rounded-[28px] border border-[var(--modal-border)] bg-[var(--modal-bg)] text-[var(--text-primary)] shadow-2xl z-[201] overflow-hidden"
        >
          <div className="px-4 py-4 md:px-8 md:py-6 flex items-center justify-between gap-3 border-b border-[var(--modal-border)]">
            <h3 className="text-lg md:text-2xl font-normal text-[var(--text-primary)] truncate">{title}</h3>
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
