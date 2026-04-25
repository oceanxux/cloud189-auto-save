import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, X, Link2, Folder, User, Settings, Info, Save, Cpu, RefreshCw, AlertCircle, Files, Hash, Key } from 'lucide-react';
import Modal from './Modal';
import { ToastType } from './Toast';
import FolderSelector, { SelectedFolder } from './FolderSelector';
import { extractEpisodeCountFromTitle } from '../utils/episodeCount';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: any;
  onShowToast?: (message: string, type: ToastType) => void;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose, onSuccess, initialData, onShowToast }) => {
  const [formData, setFormData] = useState({
    shareLink: '',
    accessCode: '',
    resourceName: '',
    targetFolderId: '',
    targetFolderName: '',
    realFolderId: '',
    realFolderName: '',
    totalEpisodes: 0,
    tmdbSeasonNumber: null as number | null,
    tmdbSeasonName: '',
    tmdbSeasonEpisodes: null as number | null,
    type: 'normal',
    accountId: '',
    enableOrganizer: true
  });
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingEpisodes, setFetchingEpisodes] = useState(false);
  const [isFolderSelectorOpen, setIsFolderSelectorOpen] = useState(false);
  const [folderSelectorMode, setFolderSelectorMode] = useState<'target' | 'real'>('target');
  const seasonLabel = formData.tmdbSeasonNumber
    ? `S${String(formData.tmdbSeasonNumber).padStart(2, '0')}`
    : '';

  useEffect(() => {
    const init = async () => {
      await fetchAccounts();
      if (initialData) {
        const resourceName = initialData.resourceName || initialData.taskName || initialData.title || initialData.resourceTitle || '';
        const shareLink = initialData.shareLink || initialData.url || initialData.cloudLinks?.[0]?.link || '';
        const inferredTotalEpisodes = Number(initialData.totalEpisodes || 0)
          || extractEpisodeCountFromTitle(initialData.resourceTitle)
          || extractEpisodeCountFromTitle(initialData.taskName)
          || extractEpisodeCountFromTitle(initialData.title)
          || extractEpisodeCountFromTitle(resourceName);
        setFormData(prev => ({ 
          ...prev, 
          ...initialData,
          shareLink,
          accessCode: initialData.accessCode || '',
          resourceName,
          totalEpisodes: inferredTotalEpisodes,
          accountId: initialData.account?.id || initialData.accountId || ''
        }));
      } else {
        // 获取系统默认配置
        try {
          const settingsRes = await fetch('/api/settings');
          const settingsData = await settingsRes.json();
          const defaultAccId = settingsData.data?.task?.autoCreate?.accountId || '';
          const defaultTargetId = settingsData.data?.task?.autoCreate?.targetFolderId || '';
          const defaultTargetName = settingsData.data?.task?.autoCreate?.targetFolder || '';
          
          setFormData({
            shareLink: '',
            accessCode: '',
            resourceName: '',
            targetFolderId: defaultTargetId,
            targetFolderName: defaultTargetName,
            realFolderId: '',
            realFolderName: '',
            totalEpisodes: 0,
            tmdbSeasonNumber: null,
            tmdbSeasonName: '',
            tmdbSeasonEpisodes: null,
            type: 'normal',
            accountId: defaultAccId,
            enableOrganizer: true
          });
        } catch(e) {
          console.error('Failed to load default settings', e);
        }
      }
    };
    if (isOpen) init();
  }, [initialData, isOpen]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) setAccounts(data.data || []);
    } catch (e) { console.error(e); }
  };

  const handleFetchTotalEpisodes = async () => {
    if (!formData.resourceName) {
      onShowToast?.('请先输入任务备注名称以供搜索', 'info');
      return;
    }
    setFetchingEpisodes(true);
    try {
      const res = await fetch(`/api/auto-series/search?title=${encodeURIComponent(formData.resourceName)}`);
      const data = await res.json();
      if (data.success) {
          const payload = data.data;
          const bestMatch = Array.isArray(payload) ? payload[0] : payload?.tmdbInfo;
          const directTotalEpisodes = Number(
            bestMatch?.totalEpisodes
            || bestMatch?.number_of_episodes
            || bestMatch?.lastEpisodeToAir?.episode_number
            || 0
          );
          if (directTotalEpisodes > 0) {
            setFormData(prev => ({
              ...prev,
              totalEpisodes: directTotalEpisodes,
              tmdbSeasonNumber: bestMatch?.seasonNumber || prev.tmdbSeasonNumber,
              tmdbSeasonName: bestMatch?.seasonName || prev.tmdbSeasonName,
              tmdbSeasonEpisodes: bestMatch?.seasonEpisodes || prev.tmdbSeasonEpisodes
            }));
            onShowToast?.(`已获取 TMDB 最新集数: ${directTotalEpisodes}`, 'success');
            return;
          }

          const tmdbId = bestMatch?.tmdbId || bestMatch?.id;
          if (tmdbId) {
             const detailRes = await fetch(`/api/tmdb/tv/${tmdbId}`);
             const detail = await detailRes.json();
             const totalEpisodes = Number(
              detail.data?.totalEpisodes
              || detail.data?.number_of_episodes
              || detail.data?.lastEpisodeToAir?.episode_number
              || 0
             );
             if (detail.success && totalEpisodes > 0) {
                 setFormData(prev => ({ ...prev, totalEpisodes }));
                 onShowToast?.(`已获取 TMDB 最新集数: ${totalEpisodes}`, 'success');
                 return;
             }
          }
          onShowToast?.('未能获取到集数信息', 'error');
      } else {
        onShowToast?.('未找到匹配的剧集信息', 'error');
      }
    } catch (e) { onShowToast?.('获取集数失败', 'error'); }
    finally { setFetchingEpisodes(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const method = initialData ? 'PUT' : 'POST';
      const url = initialData ? `/api/tasks/${initialData.id}` : '/api/tasks';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) { 
        onShowToast?.(initialData ? '任务已更新' : '任务已创建', 'success');
        onSuccess(); 
        onClose(); 
      } else {
        onShowToast?.('操作失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('请求失败', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={initialData ? "修改转存任务" : "创建全新转存任务"}>
        <form id="modal-form" onSubmit={handleSubmit} className="space-y-6 py-2">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3 workbench-form-item">
              <label className="workbench-label">资源分享链接</label>
              <div className="relative group">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                <input 
                  type="text" required value={formData.shareLink} 
                  onChange={e => setFormData({...formData, shareLink: e.target.value})}
                  className="workbench-input pl-10" placeholder="粘贴天翼云盘分享链接"
                />
              </div>
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">访问密码</label>
              <div className="relative group">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                <input 
                  type="text" value={formData.accessCode} 
                  onChange={e => setFormData({...formData, accessCode: e.target.value})}
                  className="workbench-input pl-10 font-mono" placeholder="可选"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 workbench-form-item">
              <label className="workbench-label">任务备注名称</label>
              <input 
                type="text" required value={formData.resourceName} 
                onChange={e => setFormData({...formData, resourceName: e.target.value})}
                onBlur={() => { if (!formData.totalEpisodes || formData.totalEpisodes === 0) handleFetchTotalEpisodes(); }}
                className="workbench-input font-bold" placeholder="例如：庆余年 第二季"
              />
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">预期总集数</label>
              <div className="flex gap-2">
                <div className="relative flex-1 group">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input 
                    type="number" value={formData.totalEpisodes} 
                    onChange={e => setFormData({...formData, totalEpisodes: parseInt(e.target.value) || 0})}
                    className="workbench-input pl-9 font-mono" placeholder="0"
                  />
                </div>
                <button type="button" onClick={handleFetchTotalEpisodes} disabled={fetchingEpisodes} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all disabled:opacity-30">
                  <RefreshCw size={18} className={fetchingEpisodes ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="workbench-form-item">
              <label className="workbench-label">识别季</label>
              <div className="relative group">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={14} />
                <input
                  type="text"
                  value={seasonLabel || '未识别'}
                  readOnly
                  className="workbench-input pl-9 font-black text-blue-600 opacity-80"
                />
              </div>
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">该季集数</label>
              <div className="relative group">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-400" size={14} />
                <input
                  type="number"
                  value={formData.tmdbSeasonEpisodes || ''}
                  onChange={e => {
                    const value = parseInt(e.target.value) || 0;
                    setFormData({
                      ...formData,
                      tmdbSeasonEpisodes: value || null,
                      totalEpisodes: value || formData.totalEpisodes
                    });
                  }}
                  className="workbench-input pl-9 font-mono"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">季名称</label>
              <input
                type="text"
                value={formData.tmdbSeasonName || ''}
                onChange={e => setFormData({...formData, tmdbSeasonName: e.target.value})}
                className="workbench-input font-bold"
                placeholder="自动识别后显示"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="workbench-form-item">
              <label className="workbench-label">执行账号</label>
              <select 
                required value={formData.accountId} 
                onChange={e => setFormData({...formData, accountId: e.target.value})}
                className="workbench-select font-bold text-blue-600"
              >
                <option value="">选择天翼云账号...</option>
                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.alias || acc.username}</option>)}
              </select>
            </div>
            <div className="workbench-form-item">
              <label className="workbench-label">转存模式</label>
              <select 
                value={formData.type} 
                onChange={e => setFormData({...formData, type: e.target.value})}
                className="workbench-select font-bold"
              >
                <option value="normal">自动转存 (普通)</option>
                <option value="lazy">懒转存 (STRM 挂载)</option>
              </select>
            </div>
          </div>

          <div className="workbench-form-item">
            <label className="workbench-label">目标保存目录 (归档根目录)</label>
            <div className="flex gap-2">
              <div className="relative flex-1 group">
                <Folder className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" value={formData.targetFolderName || '根目录'} 
                  readOnly className="workbench-input pl-10 opacity-60 font-bold"
                />
              </div>
              <button 
                type="button" 
                disabled={!formData.accountId}
                onClick={() => { setFolderSelectorMode('target'); setIsFolderSelectorOpen(true); }} 
                className="workbench-toolbar-button px-5 border-slate-200 disabled:opacity-30"
              >
                选择
              </button>
            </div>
          </div>

          {initialData && (
            <div className="workbench-form-item">
              <label className="workbench-label">当前资源位置 (原始待处理目录)</label>
              <div className="flex gap-2">
                <div className="relative flex-1 group">
                  <Files className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" size={16} />
                  <input 
                    type="text" value={formData.realFolderName || '根目录'} 
                    readOnly className="workbench-input pl-10 opacity-60 font-bold border-amber-100"
                  />
                </div>
                <button 
                  type="button" 
                  disabled={!formData.accountId}
                  onClick={() => { setFolderSelectorMode('real'); setIsFolderSelectorOpen(true); }} 
                  className="workbench-toolbar-button px-5 border-amber-200 text-amber-600"
                >
                  重选
                </button>
              </div>
              <p className="text-[9px] font-bold text-slate-400 mt-1">如果手动移动了文件或 ID 失效，请重新关联目录</p>
            </div>
          )}

          <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500 rounded-xl text-white shadow-sm"><Cpu size={18} /></div>
              <div><p className="text-xs font-black text-blue-900 dark:text-blue-100 uppercase tracking-tighter">自动整理归档</p><p className="text-[10px] font-bold text-blue-600/60 uppercase">Auto-Organizer</p></div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={formData.enableOrganizer} onChange={e => setFormData({...formData, enableOrganizer: e.target.checked})} />
              <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[2.5px] after:left-[2.5px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-blue-500" />
            </label>
          </div>
        </form>
      </Modal>

      <FolderSelector 
        isOpen={isFolderSelectorOpen} 
        onClose={() => setIsFolderSelectorOpen(false)}
        accountId={Number(formData.accountId)}
        title={folderSelectorMode === 'target' ? "选择存入目录" : "关联原始资源目录"}
        onSelect={(folder: SelectedFolder) => {
          if (folderSelectorMode === 'target') {
            setFormData({ ...formData, targetFolderId: folder.id, targetFolderName: folder.name });
          } else {
            setFormData({ ...formData, realFolderId: folder.id, realFolderName: folder.name });
          }
          setIsFolderSelectorOpen(false);
        }}
      />
    </>
  );
};

export default CreateTaskModal;
