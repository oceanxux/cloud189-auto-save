import React, { useState, useEffect } from 'react';
import { Cpu, Link2, Tv, Globe, Search, Save, RefreshCw, AlertCircle, Monitor, Settings, RotateCcw, Plus, Trash2, Edit3 } from 'lucide-react';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface MediaTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
}

interface MediaSettings {
  strm: { enable: boolean; useStreamProxy: boolean; };
  emby: {
    enable: boolean; serverUrl: string; apiKey: string;
    proxy: { enable: boolean; port: number; };
    prewarm: { enable: boolean; sessionPollIntervalMs: number; dedupeTtlMs: number; };
  };
  cloudSaver: { baseUrl: string; username: string; password: string; };
  tmdb: { enableScraper: boolean; tmdbApiKey: string; };
  openai: {
    enable: boolean; mode: string; baseUrl: string; apiKey: string; model: string; flowControlEnabled: boolean;
    rename: { template: string; movieTemplate: string; }
  };
  alist: { enable: boolean; baseUrl: string; apiKey: string; };
  organizer: { categories: { tv: string; anime: string; movie: string; variety: string; documentary: string; } };
}

interface RegexPreset { name: string; description: string; sourceRegex: string; targetRegex: string; matchPattern: string; matchOperator: string; matchValue: string; }

const initialSettings: MediaSettings = {
  strm: { enable: false, useStreamProxy: false },
  emby: {
    enable: false, serverUrl: '', apiKey: '',
    proxy: { enable: false, port: 8097 },
    prewarm: { enable: false, sessionPollIntervalMs: 30000, dedupeTtlMs: 300000 }
  },
  cloudSaver: { baseUrl: '', username: '', password: '' },
  tmdb: { enableScraper: false, tmdbApiKey: '' },
  openai: { 
    enable: false, mode: 'fallback', baseUrl: '', apiKey: '', model: '', flowControlEnabled: false,
    rename: { template: '{name} - {se}{ext}', movieTemplate: '{name} ({year}){ext}' } 
  },
  alist: { enable: false, baseUrl: '', apiKey: '' },
  organizer: { categories: { tv: '电视剧', anime: '动漫', movie: '电影', variety: '综艺', documentary: '纪录片' } }
};

const MediaTab: React.FC<MediaTabProps> = ({ onShowToast }) => {
  const [settings, setSettings] = useState<MediaSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regexPresets, setRegexPresets] = useState<RegexPreset[]>([]);
  const [isRegexModalOpen, setIsRegexModalOpen] = useState(false);
  const [isEditRegexModalOpen, setIsEditRegexModalOpen] = useState(false);
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null);
  const [regexForm, setRegexForm] = useState<RegexPreset>({ name: '', description: '', sourceRegex: '', targetRegex: '', matchPattern: '', matchOperator: 'lt', matchValue: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const settingsRes = await fetch('/api/settings');
      const settingsData = await settingsRes.json();
      if (settingsData.success) {
        setSettings(prev => ({ ...initialSettings, ...settingsData.data }));
        setRegexPresets(settingsData.data.regexPresets || []);
      }
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, regexPresets })
      });
      const data = await response.json();
      if (data.success) {
        if (onShowToast) onShowToast('媒体配置已成功保存', 'success');
      } else {
        if (onShowToast) onShowToast(`保存失败: ${data.error}`, 'error');
      }
    } catch (error) { 
      if (onShowToast) onShowToast('保存配置时发生请求错误', 'error');
    }
    finally { setSaving(false); }
  };

  const updateSetting = (path: string, value: any) => {
    const parts = path.split('.');
    setSettings(prev => {
      const newSettings = { ...prev };
      let current: any = newSettings;
      for (let i = 0; i < parts.length - 1; i++) {
        current[parts[i]] = { ...current[parts[i]] };
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
  };

  const handleRegexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newPresets = [...regexPresets];
    if (editingPresetIndex !== null) newPresets[editingPresetIndex] = regexForm;
    else newPresets.push(regexForm);
    setRegexPresets(newPresets);
    setIsEditRegexModalOpen(false);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={32} className="text-blue-500 animate-spin" /></div>;

  return (
    <div className="workbench-page max-w-5xl pb-12">
      <section className="workbench-hero !py-3">
        <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)]">媒体链路控制台</h1>
        <p className="text-[10px] font-bold text-slate-400 opacity-60 mt-1">配置 AI 智能识别、TMDB 刮削与正则处理规则。</p>
      </section>

      {/* AI Settings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="workbench-section-title"><Cpu size={20} className="text-blue-500" /> AI 智能助手</h3>
          <label className="relative inline-flex items-center cursor-pointer group">
            <input type="checkbox" className="sr-only peer" checked={settings.openai.enable} onChange={(e) => updateSetting('openai.enable', e.target.checked)} />
            <div className="w-10 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-500" />
          </label>
        </div>
        <div className={`workbench-panel p-8 space-y-8 transition-all ${!settings.openai.enable ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="workbench-form-item"><label className="workbench-label">接口地址</label><input type="text" value={settings.openai.baseUrl} onChange={e => updateSetting('openai.baseUrl', e.target.value)} className="workbench-input font-bold" placeholder="https://api.openai.com/v1" /></div>
            <div className="workbench-form-item"><label className="workbench-label">API 密钥</label><input type="password" value={settings.openai.apiKey} onChange={e => updateSetting('openai.apiKey', e.target.value)} className="workbench-input font-mono" placeholder="sk-..." /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="workbench-form-item"><label className="workbench-label">模型名称 (Model)</label><input type="text" value={settings.openai.model} onChange={e => updateSetting('openai.model', e.target.value)} className="workbench-input font-bold text-blue-600" placeholder="例如: gpt-4o-mini 或 deepseek-chat" /></div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSetting('openai.flowControlEnabled', !settings.openai.flowControlEnabled)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.openai.flowControlEnabled ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{settings.openai.flowControlEnabled && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">启用并发流控</p><p className="text-[9px] font-bold text-slate-400">开启后 AI 请求将排队执行，防止 API 频率限制</p></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="workbench-form-item"><label className="workbench-label">电视剧命名模版</label><input type="text" value={settings.openai.rename.template} onChange={e => updateSetting('openai.rename.template', e.target.value)} className="workbench-input font-mono text-emerald-600" /></div>
            <div className="workbench-form-item"><label className="workbench-label">电影命名模版</label><input type="text" value={settings.openai.rename.movieTemplate} onChange={e => updateSetting('openai.rename.movieTemplate', e.target.value)} className="workbench-input font-mono text-amber-600" /></div>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-6 text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">示例</div>
            <div className="mt-2 space-y-1.5">
              <p>
                <span className="font-black text-slate-900 dark:text-slate-100">电视剧：</span>
                <code className="mx-1 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{'{name} - {se}{ext}'}</code>
                <span>→</span>
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">庆余年 - S01E01.mkv</code>
              </p>
              <p>
                <span className="font-black text-slate-900 dark:text-slate-100">电影：</span>
                <code className="mx-1 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{'{name} ({year}){ext}'}</code>
                <span>→</span>
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">流浪地球 (2019).mkv</code>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                可用变量：
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono dark:bg-slate-800">{'{name}'}</code>
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono dark:bg-slate-800">{'{se}'}</code>
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono dark:bg-slate-800">{'{year}'}</code>
                <code className="ml-1 rounded bg-white/80 px-1.5 py-0.5 font-mono dark:bg-slate-800">{'{ext}'}</code>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STRM & Alist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <h3 className="workbench-section-title px-2"><Link2 size={20} className="text-indigo-500" /> STRM 增强</h3>
          <div className="workbench-panel p-6 space-y-4">
            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-transparent hover:bg-slate-100 transition-all">
              <div onClick={() => updateSetting('strm.enable', !settings.strm.enable)} className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${settings.strm.enable ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'border-slate-300'}`}>{settings.strm.enable && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div>
              <span className="text-[10px] font-black uppercase">启用 STRM 生成</span>
            </label>
            <label className="flex items-center gap-4 cursor-pointer p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-transparent hover:bg-slate-100 transition-all">
              <div onClick={() => updateSetting('strm.useStreamProxy', !settings.strm.useStreamProxy)} className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${settings.strm.useStreamProxy ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'border-slate-300'}`}>{settings.strm.useStreamProxy && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div>
              <span className="text-[10px] font-black uppercase">服务端中转代理</span>
            </label>
          </div>
        </section>
        <section className="space-y-4">
          <div className="flex items-center justify-between px-2"><h3 className="workbench-section-title"><Globe size={20} className="text-sky-500" /> Alist 聚合</h3><label className="relative inline-flex items-center cursor-pointer group"><input type="checkbox" className="sr-only peer" checked={settings.alist.enable} onChange={e => updateSetting('alist.enable', e.target.checked)} /><div className="w-10 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-sky-500" /></label></div>
          <div className={`workbench-panel p-6 space-y-6 ${!settings.alist.enable ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
             <div className="workbench-form-item"><label className="workbench-label">API 地址</label><input type="text" value={settings.alist.baseUrl} onChange={e => updateSetting('alist.baseUrl', e.target.value)} className="workbench-input font-bold" /></div>
             <div className="workbench-form-item"><label className="workbench-label">身份令牌 (Token)</label><input type="password" value={settings.alist.apiKey} onChange={e => updateSetting('alist.apiKey', e.target.value)} className="workbench-input font-mono" /></div>
          </div>
        </section>
      </div>

      {/* TMDB Scraper Settings */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="workbench-section-title"><Tv size={20} className="text-pink-500" /> TMDB 刮削与广场</h3>
          <label className="relative inline-flex items-center cursor-pointer group">
            <input type="checkbox" className="sr-only peer" checked={settings.tmdb.enableScraper} onChange={(e) => updateSetting('tmdb.enableScraper', e.target.checked)} />
            <div className="w-10 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-pink-500" />
          </label>
        </div>
        <div className={`workbench-panel p-8 space-y-6 transition-all ${!settings.tmdb.enableScraper ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
          <div className="workbench-form-item max-w-xl">
            <label className="workbench-label">TMDB API Key (v3 auth)</label>
            <div className="flex gap-3">
              <input 
                type="password" 
                value={settings.tmdb.tmdbApiKey} 
                onChange={e => updateSetting('tmdb.tmdbApiKey', e.target.value)} 
                className="flex-1 workbench-input font-mono" 
                placeholder="在此粘贴您的 TMDB API 密钥..."
              />
              <a 
                href="https://www.themoviedb.org/settings/api" 
                target="_blank" 
                rel="noreferrer"
                className="workbench-toolbar-button px-4 flex items-center gap-2 text-[10px] shrink-0"
              >
                获取密钥 <Search size={12} />
              </a>
            </div>
          </div>
          <div className="p-4 bg-pink-50/50 dark:bg-pink-900/10 border border-pink-100 dark:border-pink-900/20 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-pink-500 shrink-0 mt-0.5" size={16} />
            <div className="text-[10px] leading-5 text-slate-500 font-bold">
              提示：填入有效的 API 密钥后，系统方可正常获取“资源广场”的热门推荐以及执行自动刮削（生成 NFO 元数据）。
            </div>
          </div>
        </div>
      </section>

      {/* 分类映射 - 彻底解决对齐问题 */}
      <section className="space-y-4">
        <h3 className="workbench-section-title px-2"><Settings size={20} className="text-slate-500" /> 媒体分类映射</h3>
        <div className="workbench-panel p-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {Object.entries(settings.organizer.categories).map(([key, value]) => (
              <div key={key} className="workbench-form-item">
                <label className="workbench-label text-center">
                  {key === 'tv' ? '电视剧' :
                   key === 'movie' ? '电影' :
                   key === 'anime' ? '动漫' :
                   key === 'variety' ? '综艺' : '纪录片'}
                </label>
                <input type="text" value={value} onChange={e => updateSetting(`organizer.categories.${key}`, e.target.value)} className="workbench-input text-center font-bold text-xs" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 正则策略预设 - 满血恢复 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="workbench-section-title"><Monitor size={20} className="text-purple-500" /> 高级配置 (正则过滤/替换)</h3>
          <button onClick={() => setIsRegexModalOpen(true)} className="workbench-toolbar-button px-6"><Plus size={14} /> 管理方案库</button>
        </div>
        <div className="workbench-panel p-8 flex flex-wrap gap-3">
          {regexPresets.map((p, i) => <div key={i} className="px-5 py-2.5 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-[10px] font-black text-purple-600 flex items-center gap-2 shadow-sm">#{i+1} {p.name}</div>)}
          {regexPresets.length === 0 && <p className="text-[10px] font-bold text-slate-300 italic py-2">暂无已保存的高级处理方案</p>}
        </div>
      </section>

      <div className="mt-12 pt-8 border-t border-[var(--border-color)] flex justify-end gap-3 px-2">
        <button onClick={fetchData} className="workbench-toolbar-button px-8 border-none"><RotateCcw size={16} /> 撤销修改</button>
        <button onClick={handleSave} disabled={saving} className="workbench-primary-button px-10">{saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />} 确认并保存配置</button>
      </div>

      {/* Regex Modal */}
      <Modal isOpen={isRegexModalOpen} onClose={() => setIsRegexModalOpen(false)} title="正则预设方案库">
        <div className="space-y-6">
          <div className="flex justify-end"><button onClick={() => { setEditingPresetIndex(null); setRegexForm({ name: '', description: '', sourceRegex: '', targetRegex: '', matchPattern: '', matchOperator: 'lt', matchValue: '' }); setIsEditRegexModalOpen(true); }} className="workbench-primary-button bg-purple-500"><Plus size={16} /> 新增方案</button></div>
          <div className="grid gap-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
            {regexPresets.map((p, i) => (
              <div key={i} className="p-5 bg-[var(--bg-main)] rounded-3xl border border-[var(--border-color)] flex items-center justify-between group transition-all hover:shadow-md">
                <div><h4 className="font-black text-sm text-[var(--text-primary)]">{p.name}</h4><p className="text-[9px] font-bold text-slate-400 mt-1 uppercase tracking-widest">{p.description || '无详细描述'}</p></div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button onClick={() => { setEditingPresetIndex(i); setRegexForm(p); setIsEditRegexModalOpen(true); }} className="p-2.5 hover:bg-slate-100 rounded-xl text-slate-400"><Edit3 size={18} /></button>
                  <button onClick={() => setRegexPresets(regexPresets.filter((_, idx) => idx !== i))} className="p-2.5 hover:bg-red-50 text-red-400 rounded-xl"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal isOpen={isEditRegexModalOpen} onClose={() => setIsEditRegexModalOpen(false)} title="配置正则策略详情">
        <form id="modal-form" onSubmit={handleRegexSubmit} className="space-y-6 py-2">
          <div className="grid grid-cols-2 gap-6">
             <div className="workbench-form-item"><label className="workbench-label">方案显示名称</label><input type="text" required value={regexForm.name} onChange={e => setRegexForm({...regexForm, name: e.target.value})} className="workbench-input font-bold" /></div>
             <div className="workbench-form-item"><label className="workbench-label">方案描述</label><input type="text" value={regexForm.description} onChange={e => setRegexForm({...regexForm, description: e.target.value})} className="workbench-input" /></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
             <div className="workbench-form-item"><label className="workbench-label">提取/查找正则</label><input type="text" required value={regexForm.sourceRegex} onChange={e => setRegexForm({...regexForm, sourceRegex: e.target.value})} className="workbench-input font-mono" /></div>
             <div className="workbench-form-item"><label className="workbench-label">重命名/替换结果</label><input type="text" required value={regexForm.targetRegex} onChange={e => setRegexForm({...regexForm, targetRegex: e.target.value})} className="workbench-input font-mono" /></div>
          </div>
          <div className="p-4 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/20 rounded-2xl">
             <p className="text-[10px] font-black text-purple-600 uppercase mb-4">高级筛选条件 (可选)</p>
             <div className="grid grid-cols-3 gap-4">
                <div className="workbench-form-item col-span-1"><label className="workbench-label">匹配模式</label><input type="text" value={regexForm.matchPattern} onChange={e => setRegexForm({...regexForm, matchPattern: e.target.value})} className="workbench-input" /></div>
                <div className="workbench-form-item col-span-1"><label className="workbench-label">运算逻辑</label><select value={regexForm.matchOperator} onChange={e => setRegexForm({...regexForm, matchOperator: e.target.value})} className="workbench-select font-bold"><option value="lt">小于</option><option value="gt">大于</option><option value="eq">等于</option></select></div>
                <div className="workbench-form-item col-span-1"><label className="workbench-label">目标阈值</label><input type="text" value={regexForm.matchValue} onChange={e => setRegexForm({...regexForm, matchValue: e.target.value})} className="workbench-input text-center font-black" /></div>
             </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default MediaTab;
