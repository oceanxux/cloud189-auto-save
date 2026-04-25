import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Edit3 } from 'lucide-react';

interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
  title: string;
  message: string;
  initialValue?: string;
  placeholder?: string;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ 
  isOpen, onClose, onConfirm, title, message, initialValue = '', placeholder = '' 
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      className="max-w-md"
      footer={
        <div className="flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl text-xs font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            取消
          </button>
          <button 
            type="submit"
            form="prompt-form"
            className="px-8 py-2.5 rounded-2xl text-xs font-black text-white bg-[var(--app-accent)] shadow-xl shadow-[var(--app-accent-opacity)] transition-all active:scale-95"
          >
            确认提交
          </button>
        </div>
      }
    >
      <form id="prompt-form" onSubmit={handleSubmit} className="space-y-5 py-2">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500">
            <Edit3 size={20} />
          </div>
          <p className="text-sm font-bold text-[var(--text-secondary)]">{message}</p>
        </div>
        <input 
          type="text" 
          value={value} 
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="workbench-input !py-4 text-base font-bold"
          autoFocus
        />
      </form>
    </Modal>
  );
};

export default PromptDialog;
