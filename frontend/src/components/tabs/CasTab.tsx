import React, { useState, useEffect } from 'react';
import { Zap, FileText, Download, Upload, Loader2, AlertCircle, CheckCircle2, Copy, Search, FolderOpen, Cloud, Share2, UserRound, Home, MoveRight, FolderInput } from 'lucide-react';
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

interface CloudCasResult {
  totalFiles: number;
  uploadedCount: number;
  failedCount: number;
  uploaded?: Array<{ name: string; fileId?: string }>;
  failed?: Array<{ name: string; error: string }>;
}

interface CasTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
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
  const [exportSourceFolder, setExportSourceFolder] = useState<SelectedFolder | null>(null);
  const [exportTargetFolder, setExportTargetFolder] = useState<SelectedFolder | null>(null);
  const [exportFolderPickerMode, setExportFolderPickerMode] = useState<'source' | 'target' | null>(null);
  const [isGeneratingCloudCas, setIsGeneratingCloudCas] = useState(false);
  const [cloudCasResult, setCloudCasResult] = useState<CloudCasResult | null>(null);

  const flowSteps = [
    { title: '个人云源文件', desc: '已有媒体文件', icon: Cloud, tone: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    { title: '生成 .cas', desc: '提取 MD5 与大小', icon: Zap, tone: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
    { title: '转存共享目录', desc: '只共享小存根', icon: Share2, tone: 'text-violet-500 bg-violet-500/10 border-violet-500/20' },
    { title: '用户获取', desc: '下载或转存 .cas', icon: UserRound, tone: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
    { title: '家庭云复原', desc: '秒传恢复原文件', icon: Home, tone: 'text-orange-500 bg-orange-500/10 border-orange-500/20' },
    { title: '移回个人云', desc: '复制后清理中转', icon: FolderInput, tone: 'text-sky-500 bg-sky-500/10 border-sky-500/20' },
  ];

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
      if (onShowToast) onShowToast('请确保已选择账号、填写存根内容并选择目标目录', 'error');
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

  const handleGenerateCloudCas = async () => {
    if (!selectedAccountId) {
      if (onShowToast) onShowToast('请先选择执行账号', 'error');
      return;
    }
    if (!exportSourceFolder || !exportTargetFolder) {
      if (onShowToast) onShowToast('请选择源目录和共享目录', 'error');
      return;
    }

    setIsGeneratingCloudCas(true);
    try {
      const res = await fetch('/api/cas/export-folder-to-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          sourceFolderId: exportSourceFolder.id,
          targetFolderId: exportTargetFolder.id,
          recursive: true,
          overwrite: true
        })
      });
      const data = await res.json();
      if (data.success) {
        setCloudCasResult(data.data);
        if (onShowToast) onShowToast(`已生成 ${data.data.uploadedCount}/${data.data.totalFiles} 个 .cas 文件`, data.data.failedCount ? 'info' : 'success');
      } else {
        if (onShowToast) onShowToast('生成失败: ' + (data.error || '未知错误'), 'error');
      }
    } catch (e) {
      if (onShowToast) onShowToast('生成请求失败', 'error');
    } finally {
      setIsGeneratingCloudCas(false);
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
            <h1 className="text-[var(--text-primary)]">妙传中心</h1>
            <p>上传 → 生成 .cas → 共享 → 获取 → 秒传恢复 → 移回，围绕天翼云服务端 Hash 命中完成极速恢复。</p>
          </div>
        </div>
      </section>

      <section className="workbench-panel p-5 mb-6">
        <div className="flex flex-col gap-2 mb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-[var(--app-accent)]" />
              <h2 className="text-sm font-black text-[var(--text-primary)]">完整 6 步流程</h2>
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">.cas 只保存元数据；真正恢复依赖天翼云服务端已有相同 Hash 的文件。</p>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-600">
            家庭中转已接入：恢复后自动复制回个人云
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {flowSteps.map((step, index) => (
            <div key={step.title} className="relative min-h-[112px] rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] p-4">
              {index < flowSteps.length - 1 && (
                <MoveRight size={16} className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-slate-300 xl:block" />
              )}
              <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl border ${step.tone}`}>
                <step.icon size={19} strokeWidth={2.6} />
              </div>
              <div className="text-[10px] font-black text-slate-400">0{index + 1}</div>
              <div className="mt-1 text-xs font-black text-[var(--text-primary)]">{step.title}</div>
              <div className="mt-1 text-[10px] font-bold text-slate-400">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 恢复区域 */}
        <div className="workbench-panel p-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Download className="text-blue-500" size={20} />
            <h2 className="text-sm font-black text-[var(--text-primary)]">获取后秒传恢复</h2>
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
              <p>1. 秒传存根包含文件名、大小、MD5 与分片 MD5。</p>
              <p>2. 只要天翼云服务端命中相同 Hash，即可直接恢复，不需要重新上传原文件。</p>
              <p>3. 恢复个人目录时默认先走家庭云中转，再复制回个人云并清理中转文件。</p>
              <p className="pt-2 text-[10px] text-blue-500/60">提示：如果 Hash 未命中，秒传恢复会失败，需要回到正常下载/上传流程。</p>
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

          <div className="workbench-panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <FolderOpen className="text-indigo-500" size={18} />
              <h2 className="text-sm font-black text-[var(--text-primary)]">生成 .cas 到共享目录</h2>
            </div>
            <p className="text-xs text-slate-400 font-bold mb-4">选择个人云已有媒体目录，再选择用于分享的 .cas 目录；系统只上传同名 .cas 小文件。</p>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExportFolderPickerMode('source')}
                  className="flex-1 h-11 px-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-left text-[10px] font-black hover:border-[var(--app-accent)] transition-all flex items-center justify-between gap-2"
                >
                  <span className={exportSourceFolder ? 'text-[var(--text-primary)] truncate' : 'text-slate-400'}>
                    {exportSourceFolder ? exportSourceFolder.name : '选择源目录（已有电影文件）'}
                  </span>
                  <Search size={14} className="text-slate-400 shrink-0" />
                </button>
                <button
                  onClick={() => setExportFolderPickerMode('target')}
                  className="flex-1 h-11 px-4 rounded-xl bg-[var(--bg-main)] border border-[var(--border-color)] text-left text-[10px] font-black hover:border-[var(--app-accent)] transition-all flex items-center justify-between gap-2"
                >
                  <span className={exportTargetFolder ? 'text-[var(--text-primary)] truncate' : 'text-slate-400'}>
                    {exportTargetFolder ? exportTargetFolder.name : '选择共享目录（保存 .cas）'}
                  </span>
                  <Search size={14} className="text-slate-400 shrink-0" />
                </button>
              </div>

              <button
                onClick={handleGenerateCloudCas}
                disabled={isGeneratingCloudCas || !exportSourceFolder || !exportTargetFolder}
                className="workbench-primary-button w-full h-12 rounded-2xl shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none"
              >
                {isGeneratingCloudCas ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} strokeWidth={3} />}
                生成到共享目录
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

      <FolderSelector
        isOpen={!!exportFolderPickerMode}
        onClose={() => setExportFolderPickerMode(null)}
        accountId={selectedAccountId || 0}
        onSelect={(folder) => {
          if (exportFolderPickerMode === 'source') {
            setExportSourceFolder(folder);
          } else if (exportFolderPickerMode === 'target') {
            setExportTargetFolder(folder);
          }
          setExportFolderPickerMode(null);
        }}
        title={exportFolderPickerMode === 'source' ? '选择源目录' : '选择共享目录'}
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

      <Modal
        isOpen={!!cloudCasResult}
        onClose={() => setCloudCasResult(null)}
        title={`网盘生成结果 ${cloudCasResult?.uploadedCount || 0}/${cloudCasResult?.totalFiles || 0}`}
        footer={
          <div className="flex justify-end w-full">
            <button onClick={() => setCloudCasResult(null)} className="px-10 h-11 border border-[var(--border-color)] rounded-xl text-xs font-black">关闭</button>
          </div>
        }
      >
        <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          <div className="p-4 rounded-2xl border border-[var(--border-color)] bg-slate-50 dark:bg-slate-900/50 space-y-2">
            {(cloudCasResult?.uploaded || []).slice(0, 12).map((file) => (
              <div key={file.name} className="flex items-center gap-2 text-[10px] font-bold text-emerald-600">
                <CheckCircle2 size={12} /> <span className="truncate">{file.name}</span>
              </div>
            ))}
            {(cloudCasResult?.uploaded?.length || 0) > 12 && (
              <div className="text-[10px] font-bold text-slate-400">还有 {(cloudCasResult?.uploaded?.length || 0) - 12} 个成功文件未展开</div>
            )}
            {(cloudCasResult?.failed || []).map((file) => (
              <div key={file.name} className="text-[10px] font-bold text-rose-500 leading-relaxed">
                {file.name}: {file.error}
              </div>
            ))}
            {cloudCasResult && cloudCasResult.totalFiles === 0 && (
              <div className="text-center py-8 text-xs font-bold text-slate-400">源目录下没有可生成 .cas 的媒体文件</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CasTab;
