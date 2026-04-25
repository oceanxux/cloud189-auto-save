import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Files, ChevronRight, Search, MoreVertical, RefreshCw, ArrowLeft, Move, Trash2, ExternalLink, Copy, FileText, Folder, PencilLine, ShieldCheck, Zap, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FolderSelector, { SelectedFolder } from '../FolderSelector';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface Account { id: number; username: string; alias?: string; accountType?: 'personal' | 'family'; driveLabel?: string; }
interface FileEntry { id: string; name: string; isFolder: boolean; size: number; lastOpTime: string; ext?: string; parentFolderId?: string; }

interface FileManagerTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'], i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const FileManagerTab: React.FC<FileManagerTabProps> = ({ onShowToast, onShowConfirm }) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState<{ id: string; name: string }[]>([{ id: '-11', name: '根目录' }]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterKeyword, setFilterKeyword] = useState('');
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  
  // CAS 相关状态
  const [isCasResultModalOpen, setIsCasResultModalOpen] = useState(false);
  const [casResult, setCasResult] = useState<{ fileName: string, casContent: string } | null>(null);
  const [isGeneratingCas, setIsGeneratingCas] = useState(false);

  // 批量重命名状态
  const [isBatchRenameOpen, setIsBatchRenameOpen] = useState(false);
  const [batchRenameMode, setBatchRenameMode] = useState<'template' | 'regex'>('template');
  const [templateValue, setTemplateValue] = useState('');
  const [templateStart, setTemplateStart] = useState('1');
  const [templatePadding, setTemplatePadding] = useState('2');
  const [regexSource, setRegexSource] = useState('');
  const [regexTarget, setRegexTarget] = useState('');
  const [batchRenameSubmitting, setBatchRenameSubmitting] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (selectedAccountId) fetchEntries(); }, [selectedAccountId, path]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setAccounts(data.data);
        setSelectedAccountId(String(data.data[0].id));
      }
    } catch (e) { console.error(e); }
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const currentFolderId = path[path.length - 1].id;
      const res = await fetch(`/api/file-manager/list?accountId=${selectedAccountId}&folderId=${currentFolderId}`);
      const data = await res.json();
      if (data.success) {
        setEntries(data.data.entries || []);
        setSelectedIds(new Set());
      } else {
        onShowToast?.('读取目录失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('读取目录失败', 'error'); }
    finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectedEntries = entries.filter(entry => selectedIds.has(entry.id));

  const handleBatchRenameSubmit = async () => {
    if (batchRenamePlans.length === 0) return;
    setBatchRenameSubmitting(true);
    try {
      const res = await fetch('/api/file-manager/batch-rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccountId, files: batchRenamePlans })
      });
      const data = await res.json();
      if (data.success) { 
        setIsBatchRenameOpen(false); 
        fetchEntries(); 
        onShowToast?.('批量重命名成功', 'success');
      } else {
        onShowToast?.('重命名失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('重命名失败', 'error'); }
    finally { setBatchRenameSubmitting(false); }
  };

  const handleMove = async (targetFolderId: string) => {
    try {
      const res = await fetch('/api/file-manager/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: selectedAccountId, targetFolderId, entries: selectedEntries })
      });
      const data = await res.json();
      if (data.success) { 
        setIsFolderSelectorOpen(false); 
        fetchEntries(); 
        onShowToast?.('文件移动成功', 'success');
      } else {
        onShowToast?.('移动失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('移动失败', 'error'); }
  };

  const handleGenerateCas = async (entry: FileEntry) => {
    setIsGeneratingCas(true);
    try {
      const parentId = path[path.length - 1].id;
      const res = await fetch('/api/cas/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          fileId: entry.id,
          parentId: parentId
        })
      });
      const data = await res.json();
      if (data.success) {
        setCasResult(data.data);
        setIsCasResultModalOpen(true);
        onShowToast?.('CAS 存根生成成功', 'success');
        
        // 自动触发下载
        const blob = new Blob([data.data.casContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.data.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        onShowToast?.('生成失败: ' + data.error, 'error');
      }
    } catch (e) {
      onShowToast?.('生成存根过程中发生错误', 'error');
    } finally {
      setIsGeneratingCas(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast?.('已复制到剪贴板', 'success');
  };

  const downloadResultFile = () => {
    if (!casResult) return;
    const blob = new Blob([casResult.casContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = casResult.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (targetIds: string[]) => {
    onShowConfirm?.('删除确认', `确定要删除选中的 ${targetIds.length} 个项目吗？删除后将进入回收站。`, async () => {
      try {
        const res = await fetch('/api/file-manager/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: selectedAccountId,
            entries: entries
              .filter(entry => targetIds.includes(entry.id))
              .map(entry => ({ id: entry.id, name: entry.name, isFolder: entry.isFolder }))
          })
        });
        const data = await res.json();
        if (data.success) {
          fetchEntries();
          onShowToast?.('文件已删除', 'success');
        } else {
          onShowToast?.('删除失败: ' + data.error, 'error');
        }
      } catch (e) { onShowToast?.('删除失败', 'error'); }
    }, 'danger');
  };

  const batchRenamePlans = React.useMemo(() => {
    const selectedFiles = entries.filter(e => selectedIds.has(e.id) && !e.isFolder);
    return selectedFiles.map((f, i) => {
      let newName = f.name;
      if (batchRenameMode === 'template') {
        const num = String(parseInt(templateStart) + i).padStart(parseInt(templatePadding), '0');
        const base = f.name.substring(0, f.name.lastIndexOf('.'));
        const ext = f.name.substring(f.name.lastIndexOf('.'));
        newName = templateValue.replace(/{name}/g, base).replace(/{n}/g, num).replace(/{ext}/g, ext);
      } else {
        try { newName = f.name.replace(new RegExp(regexSource, 'g'), regexTarget); } catch (e) {}
      }
      return { fileId: f.id, oldName: f.name, destFileName: newName };
    }).filter(p => p.oldName !== p.destFileName);
  }, [selectedIds, batchRenameMode, templateValue, templateStart, templatePadding, regexSource, regexTarget, entries]);

  const visibleEntries = entries.filter(e => e.name.toLowerCase().includes(filterKeyword.toLowerCase()));

  return (
    <div className="workbench-page">
      <section className="workbench-hero !py-2.5">
        <div className="flex items-center justify-between">
          <div><h1 className="text-lg font-black tracking-tight">文件工作台</h1><p className="text-[10px] text-slate-400">管理云端资源与存根</p></div>
          <div className="flex gap-2">
             <button onClick={() => setPath([{ id: '-11', name: '根目录' }])} className="workbench-toolbar-button px-3 py-1.5 text-[9px]">根目录</button>
             <button onClick={fetchEntries} className="workbench-toolbar-button p-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </div>
      </section>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="workbench-select text-xs font-black py-1.5 min-w-[140px]">
            {accounts.map(a => <option key={a.id} value={a.id}>{`${a.alias || a.username} ${a.accountType === 'family' ? '[家庭云]' : '[个人云]'}`}</option>)}
          </select>
          <button onClick={() => path.length > 1 && setPath(path.slice(0, -1))} disabled={path.length <= 1} className="workbench-toolbar-button py-1.5 px-3"><ArrowLeft size={14} /> 返回</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setIsBatchRenameOpen(true)} disabled={selectedIds.size === 0} className="workbench-toolbar-button py-1.5 px-3 text-amber-600 border-amber-100 bg-amber-50/20"><PencilLine size={14} /> 重命名</button>
          <button onClick={() => setIsFolderSelectorOpen(true)} disabled={selectedIds.size === 0} className="workbench-toolbar-button py-1.5 px-3 text-blue-600 border-blue-100 bg-blue-50/20"><Move size={14} /> 移动</button>
          <button onClick={() => handleDelete(Array.from(selectedIds))} disabled={selectedIds.size === 0} className="workbench-toolbar-button py-1.5 px-3 text-red-500 border-red-100 bg-red-50/20"><Trash2 size={14} /> 删除</button>
        </div>
      </div>

      <div className="workbench-panel p-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 truncate flex-1">
          {path.map((p, i) => <React.Fragment key={p.id}>{i > 0 && <span className="opacity-30">/</span>}<span className="hover:text-blue-500 cursor-pointer" onClick={() => setPath(path.slice(0, i + 1))}>{p.name}</span></React.Fragment>)}
        </div>
        <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} /><input type="text" placeholder="筛选..." value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} className="workbench-input pl-7 py-1 text-xs w-32" /></div>
      </div>

      <div className="workbench-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-[var(--border-color)] text-[10px] font-black uppercase text-slate-400">
                <th className="px-5 py-3 w-10 text-center"><div onClick={() => setSelectedIds(selectedIds.size === visibleEntries.length ? new Set() : new Set(visibleEntries.map(e => e.id)))} className={`mx-auto w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${selectedIds.size === visibleEntries.length && visibleEntries.length > 0 ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{selectedIds.size === visibleEntries.length && visibleEntries.length > 0 && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div></th>
                <th className="px-5 py-3">名称</th>
                <th className="px-5 py-3">大小</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && entries.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-20 text-center animate-pulse font-bold text-slate-400">同步云端目录...</td></tr>
              ) : visibleEntries.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-20 text-center text-slate-300 italic font-bold">空目录</td></tr>
              ) : visibleEntries.map(entry => (
                <tr key={entry.id} className={`hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors ${selectedIds.has(entry.id) ? 'bg-blue-50/10' : ''}`}>
                  <td className="px-5 py-2.5 text-center"><div onClick={() => toggleSelect(entry.id)} className={`mx-auto w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${selectedIds.has(entry.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-200'}`}>{selectedIds.has(entry.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div></td>
                  <td className="px-5 py-2.5"><div className="flex items-center gap-2.5">{entry.isFolder ? <Folder size={16} className="text-blue-500" /> : <FileText size={16} className="text-slate-400" />}<span className={`font-bold text-xs ${entry.isFolder ? 'cursor-pointer hover:text-blue-500' : ''}`} onClick={() => entry.isFolder && setPath([...path, { id: entry.id, name: entry.name }])}>{entry.name}</span></div></td>
                  <td className="px-5 py-2.5 text-[10px] font-bold text-slate-400">{entry.isFolder ? '-' : formatBytes(entry.size)}</td>
                  <td className="px-5 py-2.5 text-right flex items-center justify-end gap-1">
                    {!entry.isFolder && (
                        <button 
                            onClick={() => handleGenerateCas(entry)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="生成 CAS 存根"
                            disabled={isGeneratingCas}
                        >
                            <Zap size={14} />
                        </button>
                    )}
                    <button onClick={() => handleDelete([entry.id])} className="p-1.5 text-slate-200 hover:text-red-500"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <FolderSelector isOpen={isFolderSelectorOpen} onClose={() => setIsFolderSelectorOpen(false)} accountId={Number(selectedAccountId)} title="选择移动目标" onSelect={(f: SelectedFolder) => handleMove(f.id)} />

      {/* CAS 结果弹窗 */}
      <Modal
        isOpen={isCasResultModalOpen}
        onClose={() => setIsCasResultModalOpen(false)}
        title="CAS 存根已生成"
        footer={
          <div className="flex justify-end gap-3 px-8 py-6 border-t border-[var(--border-color)]">
            <button
                onClick={downloadResultFile}
                className="workbench-toolbar-button px-6 text-blue-500 border-blue-100"
            >
                <Download size={16} /> 下载 .cas
            </button>
            <button
                onClick={() => casResult && copyToClipboard(casResult.casContent)}
                className="workbench-primary-button px-8"
            >
                <Copy size={16} /> 复制内容
            </button>
            <button
              onClick={() => setIsCasResultModalOpen(false)}
              className="workbench-toolbar-button px-8 border-none"
            >
              关闭
            </button>
          </div>
        }
      >
        {casResult && (
            <div className="space-y-4">
                <div className="workbench-form-item">
                    <label className="workbench-label">文件名</label>
                    <div className="workbench-input font-bold truncate opacity-80">{casResult.fileName}</div>
                </div>
                <div className="workbench-form-item">
                    <label className="workbench-label">存根内容 (Base64)</label>
                    <textarea 
                        readOnly 
                        value={casResult.casContent}
                        className="workbench-input font-mono text-[10px] min-h-[120px] bg-slate-50 leading-relaxed"
                    />
                </div>
            </div>
        )}
      </Modal>

      {/* 批量重命名弹窗 */}
      <Modal
        isOpen={isBatchRenameOpen}
        onClose={() => setIsBatchRenameOpen(false)}
        title="批量重命名"
        footer={
          <div className="px-8 py-6 border-t border-[var(--border-color)] bg-[var(--bg-main)]/40 flex flex-col sm:flex-row justify-end gap-3">
            <button
              onClick={() => setIsBatchRenameOpen(false)}
              className="workbench-toolbar-button px-8 border-none shadow-none"
            >
              取消
            </button>
            <button
              onClick={handleBatchRenameSubmit}
              disabled={batchRenameSubmitting || batchRenamePlans.length === 0}
              className="workbench-primary-button px-10"
            >
              {batchRenameSubmitting ? '执行中...' : `确认重命名 ${batchRenamePlans.length} 个文件`}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
           <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
              <button onClick={() => setBatchRenameMode('template')} className={`px-4 py-1.5 rounded-lg text-xs font-black ${batchRenameMode === 'template' ? 'bg-white dark:bg-slate-800 shadow-sm' : 'text-slate-400'}`}>模板模式</button>
              <button onClick={() => setBatchRenameMode('regex')} className={`px-4 py-1.5 rounded-lg text-xs font-black ${batchRenameMode === 'regex' ? 'bg-white dark:bg-slate-800 shadow-sm' : 'text-slate-400'}`}>正则模式</button>
           </div>
           {batchRenameMode === 'template' ? (
             <div className="space-y-4">
                <div className="workbench-form-item"><label className="workbench-label">命名模板 ({`{name},{n},{ext}`})</label><input value={templateValue} onChange={e => setTemplateValue(e.target.value)} className="workbench-input font-bold" placeholder="例如: {name} - S01E{n}{ext}" /></div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="workbench-form-item"><label className="workbench-label">起始编号</label><input type="number" value={templateStart} onChange={e => setTemplateStart(e.target.value)} className="workbench-input text-center font-black" /></div>
                   <div className="workbench-form-item"><label className="workbench-label">补零位数</label><input type="number" value={templatePadding} onChange={e => setTemplatePadding(e.target.value)} className="workbench-input text-center font-black" /></div>
                </div>
             </div>
           ) : (
             <div className="grid grid-cols-2 gap-4">
                <div className="workbench-form-item"><label className="workbench-label">查找正则</label><input value={regexSource} onChange={e => setRegexSource(e.target.value)} className="workbench-input font-mono" /></div>
                <div className="workbench-form-item"><label className="workbench-label">替换结果</label><input value={regexTarget} onChange={e => setRegexTarget(e.target.value)} className="workbench-input font-mono" /></div>
             </div>
           )}
           <div className="workbench-panel p-4 bg-slate-50/50 max-h-40 overflow-y-auto divide-y divide-[var(--border-color)]">
              {batchRenamePlans.map(p => <div key={p.fileId} className="py-2 text-[10px]"><p className="text-slate-400 truncate">{p.oldName}</p><p className="font-bold text-blue-500 truncate">→ {p.destFileName}</p></div>)}
           </div>
        </div>
      </Modal>
    </div>
  );
};

export default FileManagerTab;
