import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Link2, MoreVertical, RefreshCw, Edit2, Trash2, Folder, Play, CheckCircle2, AlertCircle, HelpCircle, Search, X, Check, FileText, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import FolderSelector, { SelectedFolder } from '../FolderSelector';
import { ToastType } from '../Toast';

interface StrmConfig {
  id: number;
  name: string;
  sourcePath: string;
  localPath: string;
  enable: boolean;
  accountId?: number;
  account?: { username: string; alias?: string; };
}

interface StrmConfigTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
}

const StrmConfigTab: React.FC<StrmConfigTabProps> = ({ onShowToast }) => {
  const [configs, setConfigs] = useState<StrmConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<StrmConfig | null>(null);
  const [accounts, setAccounts] = useState<{id: number, username: string, alias?: string}[]>([]);
  const [form, setForm] = useState({ name: '', sourcePath: '', localPath: '', accountId: '', enable: true });
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [folderSelectorMode, setFolderSelectorMode] = useState<'source' | 'local'>('source');

  useEffect(() => { fetchConfigs(); fetchAccounts(); }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/strm-configs');
      const data = await res.json();
      if (data.success) setConfigs(data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) setAccounts(data.data || []);
    } catch (e) { console.error(e); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingConfig ? `/api/strm-configs/${editingConfig.id}` : '/api/strm-configs';
    const method = editingConfig ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { 
        setIsModalOpen(false); 
        fetchConfigs(); 
        onShowToast?.('STRM 配置已保存', 'success');
      } else {
        onShowToast?.('保存失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('保存失败', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此 STRM 配置？')) return;
    try {
      const res = await fetch(`/api/strm-configs/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchConfigs();
        onShowToast?.('配置已删除', 'success');
      } else {
        onShowToast?.('删除失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('删除失败', 'error'); }
  };

  return (
    <div className="workbench-page">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">流媒体映射</p>
            <h1 className="text-[var(--text-primary)]">STRM 挂载配置</h1>
            <p>定义云盘路径与本地播放器路径的映射规则，实现 STRM 文件的精准生成与即时播放。</p>
          </div>
          <div className="workbench-hero-actions">
            <button onClick={() => { setEditingConfig(null); setForm({ name: '', sourcePath: '', localPath: '', accountId: '', enable: true }); setIsModalOpen(true); }} className="workbench-primary-button px-8"><Plus size={18} /> 新增配置</button>
            <button onClick={fetchConfigs} className="workbench-toolbar-button px-6"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新</button>
          </div>
        </div>
      </section>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <h2 className="workbench-section-title"><Link2 size={20} className="text-indigo-500" /> 映射方案 ({configs.length})</h2>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading && configs.length === 0 ? (
          <div className="py-20 text-center workbench-panel"><RefreshCw size={32} className="animate-spin mx-auto mb-4 text-indigo-500" /></div>
        ) : configs.length === 0 ? (
          <div className="py-20 text-center workbench-panel border-dashed"><Link2 size={48} className="mx-auto mb-4 text-slate-200" /><p className="text-sm font-bold text-slate-400">暂无挂载规则</p></div>
        ) : configs.map(config => (
          <div key={config.id} className="workbench-panel p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex items-start gap-5 flex-1">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0"><Link2 size={28} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-black text-[var(--text-primary)]">{config.name}</h3>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${config.enable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-500'}`}>{config.enable ? '生效中' : '已停用'}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-[var(--border-color)]">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">云端来源 (Source)</p>
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate">{config.sourcePath}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-[var(--border-color)]">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">本地映射 (Local)</p>
                      <p className="text-xs font-bold text-indigo-500 truncate">{config.localPath}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingConfig(config); setForm({ name: config.name, sourcePath: config.sourcePath, localPath: config.localPath, accountId: String(config.accountId || ''), enable: config.enable }); setIsModalOpen(true); }} className="p-3 workbench-toolbar-button border-none shadow-none"><Edit2 size={20} /></button>
                <button onClick={() => handleDelete(config.id)} className="p-3 workbench-toolbar-button border-none shadow-none text-red-500"><Trash2 size={20} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingConfig ? "编辑 STRM 映射" : "创建 STRM 映射"}>
        <form id="modal-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="workbench-form-item"><label className="workbench-label">配置方案名称</label><input type="text" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="workbench-input" placeholder="配置方案名称" /></div>
          <div className="workbench-form-item">
            <label className="workbench-label">绑定账号</label>
            <select required value={form.accountId} onChange={e => setForm({...form, accountId: e.target.value})} className="workbench-select">
              <option value="">请选择账号...</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.alias || acc.username}</option>)}
            </select>
          </div>
          <div className="workbench-form-item">
            <label className="workbench-label">云端目录路径</label>
            <div className="flex gap-2">
              <input type="text" value={form.sourcePath} onChange={e => setForm({...form, sourcePath: e.target.value})} className="flex-1 workbench-input font-mono text-xs" placeholder="/视频/电视剧" />
              <button type="button" onClick={() => { setFolderSelectorMode('source'); setIsFolderSelectorOpen(true); }} className="workbench-toolbar-button px-4"><Folder size={18} /></button>
            </div>
          </div>
          <div className="workbench-form-item">
            <label className="workbench-label">本地挂载前缀</label>
            <input type="text" required value={form.localPath} onChange={e => setForm({...form, localPath: e.target.value})} className="workbench-input font-mono text-xs" placeholder="/mnt/media/TV" />
          </div>
        </form>
      </Modal>

      <FolderSelector isOpen={isFolderSelectorOpen} onClose={() => setIsFolderSelectorOpen(false)} accountId={Number(form.accountId)} title="选择云端目录" onSelect={(f: SelectedFolder) => { setForm({ ...form, sourcePath: f.name }); setIsFolderSelectorOpen(false); }} />
    </div>
  );
};

export default StrmConfigTab;
