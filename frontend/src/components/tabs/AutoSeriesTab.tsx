import React, { useState, useEffect } from 'react';
import { Plus, Search, PlayCircle, RefreshCw, AlertCircle, CheckCircle2, ArrowLeft, Check, User, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface CandidateResource { title: string; shareLink: string; type: 'normal' | 'lazy'; }
interface AutoSeriesSettings { id: number; keyword: string; searchType: string; status: string; enable: boolean; lastSearchTime: string | null; }

interface Props {
  onShowToast: (message: string, type?: ToastType) => void;
}

const AutoSeriesTab: React.FC<Props> = ({ onShowToast }) => {
  const [settings, setSettings] = useState<AutoSeriesSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', searchType: 'all', mode: 'lazy', enable: true });

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [seriesRes, settingsRes] = await Promise.all([
        fetch('/api/auto-series'),
        fetch('/api/settings')
      ]);
      const seriesData = await seriesRes.json();
      const settingsData = await settingsRes.json();
      
      if (seriesData.success) setSettings(seriesData.data || []);
      if (settingsData.success) {
        setForm(prev => ({ ...prev, mode: settingsData.data?.task?.autoCreate?.mode || 'lazy' }));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auto-series', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if ((await res.json()).success) { 
        setIsModalOpen(false); 
        fetchSettings(); 
        onShowToast?.('追剧规则已添加', 'success');
      }
    } catch (e) { onShowToast?.('保存失败', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此自动追剧规则？')) return;
    try {
      await fetch(`/api/auto-series/${id}`, { method: 'DELETE' });
      fetchSettings();
      onShowToast?.('规则已删除', 'success');
    } catch (e) { onShowToast?.('删除失败', 'error'); }
  };

  return (
    <div className="workbench-page">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">自动发现</p>
            <h1 className="text-[var(--text-primary)]">自动追剧控制台</h1>
            <p>管理关键词监控与自动检索规则，持续发现新资源并补全转存入口。</p>
          </div>
          <div className="workbench-hero-actions">
            <button onClick={async () => { 
               try {
                 const settingsRes = await fetch('/api/settings');
                 const settingsData = await settingsRes.json();
                 const defaultMode = settingsData.data?.task?.autoCreate?.mode || 'lazy';
                 setForm({ title: '', searchType: 'all', mode: defaultMode, enable: true }); 
               } catch(e) {
                 setForm({ title: '', searchType: 'all', mode: 'lazy', enable: true }); 
               }
               setIsModalOpen(true); 
            }} className="workbench-primary-button px-5 py-2 text-xs"><Plus size={14} /> 新建规则</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {settings.map(s => (
          <div key={s.id} className="workbench-panel p-4 group">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-black text-sm text-[var(--text-primary)] truncate">{s.keyword}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">模式: {s.searchType === 'all' ? '全网搜索' : '精准匹配'}</p>
              </div>
              <button onClick={() => handleDelete(s.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black ${s.enable ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-200 text-slate-500'}`}>{s.enable ? '监控中' : '已暂停'}</span>
              <span className="text-[9px] font-bold text-slate-400">上次检查: {s.lastSearchTime ? new Date(s.lastSearchTime).toLocaleDateString() : '从未'}</span>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="新增追剧规则">
        <form id="modal-form" onSubmit={handleSubmit} className="space-y-6">
          <div className="workbench-form-item"><label className="workbench-label">搜索关键字</label><input type="text" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="workbench-input" placeholder="例如：庆余年 第二季" /></div>
          <div className="workbench-form-item"><label className="workbench-label">搜索模式</label><select value={form.searchType} onChange={e => setForm({...form, searchType: e.target.value})} className="workbench-select font-bold"><option value="all">全网搜索</option><option value="exact">精准搜索</option></select></div>
          <div className="workbench-form-item"><label className="workbench-label">转存模式</label><select value={form.mode} onChange={e => setForm({...form, mode: e.target.value})} className="workbench-select font-bold"><option value="lazy">懒转存 (Lazy)</option><option value="normal">常规模式 (Normal)</option></select></div>
        </form>
      </Modal>
    </div>
  );
};

export default AutoSeriesTab;
