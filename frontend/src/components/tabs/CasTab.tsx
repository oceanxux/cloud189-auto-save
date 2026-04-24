import React, { useState, useEffect } from 'react';
import { Zap, FileText, Download, Upload, Trash2, Loader2, AlertCircle, CheckCircle2, Copy, Search, ExternalLink, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FolderSelector, { SelectedFolder } from '../FolderSelector';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface Account {
  id: number;
  username: string;
  alias: string;
  accountType: string;
}

interface ExportedStub {
  name: string;
  content: string;
}

interface CasTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
}

const CasTab: React.FC<CasTabProps> = ({ onShowToast }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [casContent, setCasContent] = useState('');
  const [restoreName, setRestoreName] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [isExportFolderSelectorOpen, setIsExportFolderSelectorOpen] = useState(false);
  const [targetFolder, setTargetFolder] = useState<SelectedFolder | null>(null);

  // 格式说明弹窗
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  
  // 导出结果弹窗
  const [isExportResultModalOpen, setIsExportResultModalOpen] = useState(false);
  const [exportedStubs, setExportedStubs] = useState<ExportedStub[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data);
        if (data.data.length > 0) setSelectedAccountId(data.data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestore = async () => {
    if (!selectedAccountId || !casContent || !targetFolder) {
      alert('请确保已选择账号、填写存根内容并选择目标目录');
      return;
    }

    setIsRestoring(true);
    try {
      const res = await fetch('/api/cas/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          folderId: targetFolder.id,
          casContent: casContent.trim(),
          fileName: restoreName.trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        if (onShowToast) onShowToast(`秒传恢复成功: ${data.data.name}`, 'success');
        setCasContent('');
        setRestoreName('');
      } else {
        if (onShowToast) onShowToast('恢复失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      if (onShowToast) onShowToast('操作过程中发生错误', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleExportStubs = async (folder: SelectedFolder) => {
    if (!selectedAccountId) return;
    setIsExporting(true);
    setExportedStubs([]); // 清空旧数据
    try {
      const res = await fetch('/api/cas/export-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          folderId: folder.id
        })
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.length === 0) {
          if (onShowToast) onShowToast('该目录及其子目录下未找到拥有完整 MD5 信息的媒体文件。', 'info');
        } else {
          setExportedStubs(data.data);
          setIsExportResultModalOpen(true);
        }
      } else {
        if (onShowToast) onShowToast('导出失败: ' + data.error, 'error');
      }
    } catch (e) {
      if (onShowToast) onShowToast('请求导出失败', 'error');
    } finally {
      setIsExporting(false);
      setIsExportFolderSelectorOpen(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    if (onShowToast) onShowToast('已复制到剪贴板', 'success');
  };

  const downloadSingleStub = (name: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.cas`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAllStubs = () => {
    const text = exportedStubs.map(s => `${s.name}.cas\n${s.content}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stubs_export_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="workbench-page">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">极速传输</p>
            <h1 className="text-[var(--text-primary)]">秒传中心</h1>
            <p>手动解析 .cas 存根并恢复为文件，或通过 MD5 快速导入资源。</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 恢复区域 */}
        <div className="workbench-panel p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Download className="text-blue-500" size={20} />
            <h2 className="text-sm font-black text-[var(--text-primary)]">手动恢复秒传</h2>
          </div>

          <div className="space-y-4">
            <div className="workbench-form-item">
              <label className="workbench-label">执行账号</label>
              <select 
                value={selectedAccountId || ''} 
                onChange={(e) => setSelectedAccountId(Number(e.target.value))}
                className="workbench-select font-bold"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.alias || acc.username}</option>
                ))}
              </select>
            </div>

            <div className="workbench-form-item">
              <label className="workbench-label">存根内容 (Base64 或 JSON)</label>
              <textarea 
                value={casContent}
                onChange={(e) => setCasContent(e.target.value)}
                placeholder="粘贴 .cas 文件内容..."
                className="workbench-input min-h-[160px] font-mono text-[10px] py-3 leading-relaxed"
              />
            </div>

            <div className="workbench-form-item">
              <label className="workbench-label">自定义文件名 (可选)</label>
              <input 
                type="text" 
                value={restoreName}
                onChange={(e) => setRestoreName(e.target.value)}
                placeholder="不填则使用存根内的文件名"
                className="workbench-input"
              />
            </div>

            <div className="workbench-form-item">
              <label className="workbench-label">存入目录</label>
              <button 
                onClick={() => setIsFolderSelectorOpen(true)}
                className="w-full flex items-center justify-between px-4 h-11 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl text-xs font-bold hover:border-[var(--app-accent)] transition-all"
              >
                <span className={targetFolder ? 'text-[var(--text-primary)]' : 'text-slate-400'}>
                  {targetFolder ? targetFolder.name : '点击选择目标目录'}
                </span>
                <Search size={14} className="text-slate-400" />
              </button>
            </div>

            <button 
              onClick={handleRestore}
              disabled={isRestoring || !casContent || !targetFolder}
              className="workbench-primary-button w-full h-12 rounded-2xl shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
            >
              {isRestoring ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} strokeWidth={3} />}
              立即恢复
            </button>
          </div>
        </div>

        {/* 帮助与说明 */}
        <div className="space-y-6">
          <div className="workbench-panel p-6 bg-blue-500/5 border-blue-500/20">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="text-blue-500" size={18} />
              <h2 className="text-sm font-black text-blue-600">什么是 .cas 秒传？</h2>
            </div>
            <div className="space-y-3 text-xs leading-relaxed text-slate-500 font-bold">
              <p>1. 秒传存根是一个包含文件 MD5、大小、分片 MD5 的小型文本信息。</p>
              <p>2. 只要云端服务器（天翼云盘）曾经存在过该文件，通过存根即可在数秒内将其恢复到您的网盘。</p>
              <p>3. 这种方式不占用服务器带宽，且可以绕过部分敏感资源的直接分享限制。</p>
              <p className="pt-2 text-[10px] text-blue-500/60">提示：本系统支持家庭中转秒传，可有效规避个人网盘的 MD5 黑名单风控。</p>
            </div>
          </div>

          <div className="workbench-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Upload className="text-emerald-500" size={18} />
              <h2 className="text-sm font-black text-[var(--text-primary)]">快捷工具</h2>
            </div>
            <p className="text-xs text-slate-400 font-bold mb-4">管理您的秒传存根，进行批量导出或查阅格式规范。</p>
            <div className="flex gap-2">
               <button 
                onClick={() => setIsExportFolderSelectorOpen(true)}
                disabled={isExporting}
                className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-xl text-[10px] font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
               >
                 {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} 批量导出存根
               </button>
               <button 
                onClick={() => setIsInfoModalOpen(true)}
                className="flex-1 px-4 py-3 border border-[var(--border-color)] rounded-xl text-[10px] font-black hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
               >
                 <FileText size={12} /> 格式化说明
               </button>
            </div>
          </div>
        </div>
      </div>

      {/* 目录选择器 */}
      <FolderSelector 
        isOpen={isFolderSelectorOpen}
        onClose={() => setIsFolderSelectorOpen(false)}
        accountId={selectedAccountId || 0}
        onSelect={(folder) => {
          setTargetFolder(folder);
          setIsFolderSelectorOpen(false);
        }}
        title="选择存入目录"
      />

      <FolderSelector 
        isOpen={isExportFolderSelectorOpen}
        onClose={() => setIsExportFolderSelectorOpen(false)}
        accountId={selectedAccountId || 0}
        onSelect={handleExportStubs}
        title="选择要导出的目录"
        showFiles={true}
      />

      {/* 格式说明弹窗 */}
      <Modal 
        isOpen={isInfoModalOpen} 
        onClose={() => setIsInfoModalOpen(false)} 
        title="CAS 格式说明"
        footer={
          <div className="flex justify-end">
            <button 
              onClick={() => setIsInfoModalOpen(false)}
              className="px-10 py-3 bg-slate-100 dark:bg-slate-800 text-[var(--text-primary)] rounded-2xl text-xs font-black hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
            >
              知道了
            </button>
          </div>
        }
      >
        <div className="space-y-6 py-2">
          <div className="space-y-3">
            <h3 className="text-xs font-black text-[var(--text-primary)] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Base64 格式 (推荐)
            </h3>
            <p className="text-[10px] text-slate-500 font-bold">这是目前最通用的格式，由 JSON 字符串经过 Base64 编码而成。</p>
            <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl font-mono text-[9px] break-all leading-relaxed text-slate-600">
              eyJuYW1lIjoiZmlsZS5ta3YiLCJzaXplIjoxMjM0NSwibWQ1IjoiYWJjLi4uIiwic2xpY2VNZDUiOiJ4eXouLi4ifQ==
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black text-[var(--text-primary)] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              纯 JSON 格式
            </h3>
            <p className="text-[10px] text-slate-500 font-bold">直接粘贴包含关键字段的 JSON 也可以被识别。</p>
            <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl font-mono text-[9px] leading-relaxed text-slate-600">
              {"{"} "name": "文件名", "size": 1024, "md5": "...", "sliceMd5": "..." {"}"}
            </div>
          </div>

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
             <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
               注意：.cas 文件本质上只是这些文本信息的载体。在“秒传中心”，您直接粘贴上述文本即可恢复。
             </p>
          </div>
        </div>
      </Modal>

      {/* 导出结果弹窗 */}
      <Modal
        isOpen={isExportResultModalOpen}
        onClose={() => setIsExportResultModalOpen(false)}
        title={`成功生成 ${exportedStubs.length} 个存根`}
        footer={
          <div className="flex gap-2 w-full">
            <button onClick={downloadAllStubs} className="flex-1 workbench-primary-button h-11 text-xs">下载全部 (.txt)</button>
            <button onClick={() => setIsExportResultModalOpen(false)} className="flex-1 h-11 border border-[var(--border-color)] rounded-xl text-xs font-black">关闭</button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {exportedStubs.length === 0 ? (
            <div className="py-10 text-center text-slate-400 font-bold text-xs">该目录下没有可导出的媒体文件</div>
          ) : (
            exportedStubs.map((stub, i) => (
              <div key={i} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-[var(--border-color)] group hover:border-[var(--app-accent)] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black text-[var(--text-primary)] truncate flex-1 mr-2">{stub.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => downloadSingleStub(stub.name, stub.content)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors" title="下载 .cas 文件"><Download size={14} /></button>
                    <button onClick={() => copyToClipboard(stub.content)} className="p-1.5 text-slate-400 hover:text-[var(--app-accent)] transition-colors" title="复制内容"><Copy size={14} /></button>
                  </div>
                </div>
                <div className="text-[9px] font-mono text-slate-400 break-all line-clamp-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                  {stub.content}
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};

export default CasTab;
