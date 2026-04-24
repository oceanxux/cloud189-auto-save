import React, { useState, useEffect } from 'react';
import { Shield, Database, Save, RefreshCw, Key, Folder, Send, Globe, Trash2, RotateCcw, MessageSquare, Bell, PlayCircle, Clock, Check } from 'lucide-react';
import Modal from '../Modal';
import FolderSelector, { SelectedFolder } from '../FolderSelector';
import { ToastType } from '../Toast';

interface SettingsData {
  task: {
    taskExpireDays: number; taskCheckCron: string; cleanRecycle: boolean;
    enableOnlySaveMedia: boolean; enableAutoDeleteCompletedTask: boolean; enableAutoCreateFolder: boolean;
    enableFamilyTransit: boolean; enableFamilyTransitFirst: boolean;
    autoCreate: { accountId: string; targetFolderId: string; targetFolder: string; organizerTargetFolderId: string; organizerTargetFolderName: string; mode: 'normal' | 'lazy'; }
  };
  wecom: { enable: boolean; webhook: string; };
  telegram: { enable: boolean; proxyDomain: string; botToken: string; chatId: string; };
  proxy: {
    host: string; port: number; username: string; password: string;
    services: { telegram: boolean; tmdb: boolean; openai: boolean; cloud189: boolean; customPush: boolean; }
  };
  bark: { enable: boolean; serverUrl: string; key: string; };
  pushplus: { enable: boolean; token: string; topic: string; channel: string; webhook: string; to: string; };
  system: { 
    username: string; password: string; baseUrl: string; apiKey: string; streamProxySecret: string;
    logExpireDays: number;
    logCleanupCron: string;
  };
}

interface Props {
  onShowToast?: (message: string, type: ToastType) => void;
}

const initialSettings: SettingsData = {
  task: {
    taskExpireDays: 3, taskCheckCron: '0 19-23 * * *', cleanRecycle: false,
    enableOnlySaveMedia: false, enableAutoDeleteCompletedTask: false, enableAutoCreateFolder: false, enableFamilyTransit: true, enableFamilyTransitFirst: false,
    autoCreate: { accountId: '', targetFolderId: '', targetFolderName: '', organizerTargetFolderId: '', organizerTargetFolderName: '', mode: 'lazy' }
  },
  wecom: { enable: false, webhook: '' },
  telegram: { enable: false, proxyDomain: '', botToken: '', chatId: '' },
  proxy: { host: '', port: 0, username: '', password: '', services: { telegram: false, tmdb: false, openai: false, cloud189: false, customPush: false } },
  bark: { enable: false, serverUrl: '', key: '' },
  pushplus: { enable: false, token: '', topic: '', channel: 'wechat', webhook: '', to: '' },
  system: { username: 'admin', password: 'admin', baseUrl: '', apiKey: '', streamProxySecret: '', logExpireDays: 7, logCleanupCron: '0 3 * * *' },
};

const SettingsTab: React.FC<Props> = ({ onShowToast }) => {
  const [settings, setSettings] = useState<SettingsData>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [folderSelectorMode, setFolderSelectorMode] = useState<'target' | 'organizer'>('target');

  useEffect(() => { loadSettings(); fetchAccounts(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success) setSettings(prev => ({ ...initialSettings, ...data.data }));
    } catch (error) { console.error('加载设置失败:', error); }
    finally { setLoading(false); }
  };

  const fetchAccounts = async () => {
    try {
      const response = await fetch('/api/accounts');
      const data = await response.json();
      if (data.success) setAccounts(data.data || []);
    } catch (error) { console.error('获取账号失败:', error); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        if (onShowToast) onShowToast('系统设置已成功保存', 'success');
      } else {
        if (onShowToast) onShowToast(`保存失败: ${data.error}`, 'error');
      }
    } catch (error: any) { 
      if (onShowToast) onShowToast('保存配置时发生错误: ' + error.message, 'error');
    }
    finally { setSaving(false); }
  };

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let apiKey = '';
    for (let i = 0; i < 32; i++) apiKey += chars.charAt(Math.floor(Math.random() * chars.length));
    updateSettings('system.apiKey', apiKey);
  };

  const updateSettings = (path: string, value: any) => {
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

  if (loading) return <div className="flex items-center justify-center py-20"><RefreshCw size={32} className="text-blue-500 animate-spin" /></div>;

  return (
    <div className="workbench-page max-w-5xl pb-12">
      <section className="workbench-hero !py-3">
        <h1 className="text-xl font-black tracking-tight text-[var(--text-primary)]">系统与自动化设置</h1>
        <p className="mt-1 max-w-2xl text-[10px] font-medium leading-relaxed text-[var(--text-secondary)] opacity-60">管理认证权限、网络代理及自动化任务的核心逻辑。</p>
      </section>

      <section className="space-y-4">
        <h3 className="workbench-section-title px-2"><Shield size={20} className="text-blue-500" /> 访问认证安全</h3>
        <div className="workbench-panel p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="workbench-form-item">
              <label className="workbench-label">管理员用户名</label>
              <input type="text" value={settings.system.username} onChange={(e) => updateSettings('system.username', e.target.value)} className="workbench-input font-bold" />
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">重置新密码</label>
              <input type="password" value={settings.system.password} onChange={(e) => updateSettings('system.password', e.target.value)} className="workbench-input font-mono" placeholder="留空则保持原密码" />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
            <div className="workbench-form-item">
              <label className="workbench-label">系统内部通信密钥 (API Key)</label>
              <div className="flex gap-3">
                <input type="text" value={settings.system.apiKey} onChange={(e) => updateSettings('system.apiKey', e.target.value)} className="flex-1 workbench-input font-mono text-xs" />
                <button onClick={generateApiKey} className="workbench-toolbar-button px-6 shrink-0">重新生成</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="workbench-form-item">
                  <label className="workbench-label">日志保留天数</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" min="1" max="30" step="1"
                      value={settings.system.logExpireDays || 7} 
                      onChange={(e) => updateSettings('system.logExpireDays', parseInt(e.target.value))} 
                      className="flex-1 accent-blue-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer" 
                    />
                    <span className="w-12 text-center text-[10px] font-black bg-blue-50 text-blue-600 py-1.5 rounded-xl border border-blue-100">{settings.system.logExpireDays || 7}天</span>
                  </div>
               </div>
               <div className="workbench-form-item">
                  <label className="workbench-label">日志清理任务 Cron</label>
                  <div className="relative group">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                    <input 
                      type="text" 
                      value={settings.system.logCleanupCron || '0 3 * * *'} 
                      onChange={(e) => updateSettings('system.logCleanupCron', e.target.value)} 
                      className="workbench-input pl-10 font-mono text-xs" 
                      placeholder="例如: 0 3 * * *" 
                    />
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="workbench-section-title px-2"><Database size={20} className="text-emerald-500" /> 任务执行策略</h3>
        <div className="workbench-panel p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="workbench-form-item"><label className="workbench-label">任务超时天数</label><input type="number" value={settings.task.taskExpireDays} onChange={(e) => updateSettings('task.taskExpireDays', parseInt(e.target.value))} className="workbench-input font-bold" /></div>
            <div className="workbench-form-item"><label className="workbench-label">全量检查 Cron</label><input type="text" value={settings.task.taskCheckCron} onChange={(e) => updateSettings('task.taskCheckCron', e.target.value)} className="workbench-input font-mono" /></div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.cleanRecycle', !settings.task.cleanRecycle)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.cleanRecycle ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{settings.task.cleanRecycle && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">自动清空个人回收站</p><p className="text-[9px] font-bold text-slate-400">清理释放存储空间</p></div>
            </div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.enableFamilyTransit', !settings.task.enableFamilyTransit)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.enableFamilyTransit ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>{settings.task.enableFamilyTransit && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">启用家庭云中转</p><p className="text-[9px] font-bold text-slate-400">提升秒传成功率</p></div>
            </div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.enableFamilyTransitFirst', !settings.task.enableFamilyTransitFirst)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.enableFamilyTransitFirst ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>{settings.task.enableFamilyTransitFirst && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">优先家庭云中转</p><p className="text-[9px] font-bold text-slate-400">强制走家庭云路径</p></div>
            </div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.enableOnlySaveMedia', !settings.task.enableOnlySaveMedia)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.enableOnlySaveMedia ? 'bg-amber-500 border-amber-500' : 'border-slate-300'}`}>{settings.task.enableOnlySaveMedia && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">仅转存媒体文件</p><p className="text-[9px] font-bold text-slate-400">过滤非视频/音频后缀</p></div>
            </div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.enableAutoDeleteCompletedTask', !settings.task.enableAutoDeleteCompletedTask)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.enableAutoDeleteCompletedTask ? 'bg-rose-500 border-rose-500' : 'border-slate-300'}`}>{settings.task.enableAutoDeleteCompletedTask && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">完成后自动删除</p><p className="text-[9px] font-bold text-slate-400">任务完成后从列表移除</p></div>
            </div>
            <div className="flex items-center gap-4 pt-5 px-1">
               <div onClick={() => updateSettings('task.enableAutoCreateFolder', !settings.task.enableAutoCreateFolder)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center cursor-pointer transition-all ${settings.task.enableAutoCreateFolder ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>{settings.task.enableAutoCreateFolder && <Check size={14} strokeWidth={4} className="text-white" />}</div>
               <div><p className="text-xs font-black uppercase tracking-tighter">自动创建目录</p><p className="text-[9px] font-bold text-slate-400">自动补全云盘路径</p></div>
            </div>
          </div>

          <div className="pt-8 border-t border-[var(--border-color)] space-y-6">
            <h4 className="text-sm font-black uppercase tracking-widest flex items-center gap-2"><PlayCircle size={18} className="text-blue-500" /> 自动化追剧默认全局配置</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              <div className="workbench-form-item">
                <label className="workbench-label">执行账号</label>
                <select value={settings.task.autoCreate.accountId} onChange={(e) => updateSettings('task.autoCreate.accountId', e.target.value)} className="workbench-select font-bold">
                  <option value="">请选择默认账号...</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.alias || acc.username}</option>)}
                </select>
              </div>
              <div className="workbench-form-item">
                <label className="workbench-label">默认模式</label>
                <select value={settings.task.autoCreate.mode} onChange={(e) => updateSettings('task.autoCreate.mode', e.target.value)} className="workbench-select font-bold">
                  <option value="lazy">懒转存 (Lazy)</option>
                  <option value="normal">常规模式 (Normal)</option>
                </select>
              </div>
              <div className="workbench-form-item">
                <label className="workbench-label">默认存入路径</label>
                <div className="flex gap-2">
                  <input type="text" value={settings.task.autoCreate.targetFolder || '根目录'} readOnly className="flex-1 workbench-input font-bold opacity-60 text-xs" />
                  <button onClick={() => { setFolderSelectorMode('target'); setIsFolderSelectorOpen(true); }} disabled={!settings.task.autoCreate.accountId} className="workbench-toolbar-button px-3 shadow-none shrink-0"><Folder size={18} /></button>
                </div>
              </div>
              <div className="workbench-form-item">
                <label className="workbench-label">默认归档路径</label>
                <div className="flex gap-2">
                  <input type="text" value={settings.task.autoCreate.organizerTargetFolderName || '默认继承'} readOnly className="flex-1 workbench-input font-bold opacity-60 text-xs" />
                  <button onClick={() => { setFolderSelectorMode('organizer'); setIsFolderSelectorOpen(true); }} disabled={!settings.task.autoCreate.accountId} className="workbench-toolbar-button px-3 shadow-none shrink-0"><Folder size={18} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-12 flex justify-end gap-3 px-2">
        <button onClick={loadSettings} className="workbench-toolbar-button px-8 border-none"><RotateCcw size={16} /> 放弃修改</button>
        <button onClick={handleSave} disabled={saving} className="workbench-primary-button px-10">
          {saving ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
          确认并保存设置
        </button>
      </div>

      <FolderSelector 
        isOpen={isFolderSelectorOpen} 
        onClose={() => setIsFolderSelectorOpen(false)}
        accountId={Number(settings.task.autoCreate.accountId)}
        title={folderSelectorMode === 'target' ? '选择默认存入目录' : '选择默认整理目录'}
        onSelect={(folder: SelectedFolder) => {
          if (folderSelectorMode === 'target') {
            updateSettings('task.autoCreate.targetFolderId', folder.id);
            updateSettings('task.autoCreate.targetFolder', folder.name);
          } else {
            updateSettings('task.autoCreate.organizerTargetFolderId', folder.id);
            updateSettings('task.autoCreate.organizerTargetFolderName', folder.name);
          }
          setIsFolderSelectorOpen(false);
        }} 
      />
    </div>
  );
};

export default SettingsTab;
