import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, ChevronRight, Filter, Search, RefreshCw, Files, PlayCircle, MoreVertical, CheckCircle2, AlertCircle, Clock, Trash2, ClipboardList, Edit3, Database, RotateCcw, X, ChevronDown, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import { ToastType } from '../Toast';
import { useClickOutside } from '../../utils/useClickOutside';

const TASK_REMARK_CACHE_KEY = 'task-tmdb-remarks';
const TMDB_REMARK_DETAIL_CACHE_KEY = 'task-tmdb-detail-cache';

interface Account { id: number; username: string; accountType?: 'personal' | 'family'; driveLabel?: string; }
interface Task { id: number; resourceName: string; status: string; currentEpisodes: number; totalEpisodes: number; lastFileUpdateTime: string; account: Account; enableLazyStrm: boolean; lastOrganizeError?: string; realFolderName?: string; tmdbSeasonNumber?: number | null; tmdbSeasonName?: string | null; tmdbSeasonEpisodes?: number | null; tmdbId?: string | null; remark?: string | null; tmdbContent?: string | null; }
interface ProcessedRecord { id: number; sourceFileName: string; sourceMd5?: string; status: string; updatedAt: string; lastError?: string | null; }

interface TaskTabProps {
  onCreateTask?: (data?: any) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
  refreshToken?: number;
}

const loadSessionMap = (key: string) => {
  if (typeof window === 'undefined') return {} as Record<string, any>;
  try {
    return JSON.parse(window.sessionStorage.getItem(key) || '{}');
  } catch {
    return {} as Record<string, any>;
  }
};

const saveSessionMap = (key: string, value: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore session storage quota/availability errors
  }
};

const tmdbRemarkCache = new Map<string, any>(Object.entries(loadSessionMap(TMDB_REMARK_DETAIL_CACHE_KEY)));

const TaskTab: React.FC<TaskTabProps> = ({ onCreateTask, onShowToast, onShowConfirm, refreshToken = 0 }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<number | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<number | null>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const [processedTasks, setProcessedTasks] = useState<Task[]>([]);
  const [processedRecords, setProcessedRecords] = useState<ProcessedRecord[]>([]);
  const [processedLoading, setProcessedLoading] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [resolvedRemarkMap, setResolvedRemarkMap] = useState<Record<number, string>>(() => loadSessionMap(TASK_REMARK_CACHE_KEY));

  const taskStatusOptions = [
    { value: 'processing', label: '追剧中' },
    { value: 'completed', label: '已完结' },
    { value: 'failed', label: '失败' },
    { value: 'pending', label: '等待中' }
  ];

  const getTaskStatusMeta = (status?: string) => {
    const normalized = String(status || 'pending').toLowerCase();
    const statusMap: Record<string, { label: string; badgeClass: string; accentClass: string; progressClass: string }> = {
      pending: {
        label: '等待中',
        badgeClass: 'bg-sky-500/10 text-sky-500',
        accentClass: 'bg-sky-500',
        progressClass: 'bg-sky-500'
      },
      processing: {
        label: '追剧中',
        badgeClass: 'bg-amber-500/10 text-amber-500',
        accentClass: 'bg-amber-500',
        progressClass: 'bg-blue-500'
      },
      completed: {
        label: '已完结',
        badgeClass: 'bg-emerald-500/10 text-emerald-500',
        accentClass: 'bg-emerald-500',
        progressClass: 'bg-emerald-500'
      },
      failed: {
        label: '失败',
        badgeClass: 'bg-red-500/10 text-red-500',
        accentClass: 'bg-red-500',
        progressClass: 'bg-red-500'
      }
    };
    return statusMap[normalized] || {
      label: normalized || '未知',
      badgeClass: 'bg-slate-500/10 text-slate-500',
      accentClass: 'bg-slate-400',
      progressClass: 'bg-slate-400'
    };
  };

  const getRecordStatusMeta = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    if (['success', 'done', 'completed'].includes(normalized)) {
      return { label: '成功', className: 'bg-emerald-500/10 text-emerald-500' };
    }
    if (['processing', 'pending'].includes(normalized)) {
      return { label: '处理中', className: 'bg-blue-500/10 text-blue-500' };
    }
    if (['failed', 'error'].includes(normalized)) {
      return { label: '失败', className: 'bg-red-500/10 text-red-500' };
    }
    return { label: normalized || '未知', className: 'bg-slate-500/10 text-slate-500' };
  };

  const getTaskEpisodeTotal = (task: Task) => {
    const seasonTotal = Number(task.tmdbSeasonNumber || 0) > 0 ? Number(task.tmdbSeasonEpisodes || 0) : 0;
    return seasonTotal > 0 ? seasonTotal : Number(task.totalEpisodes || 0);
  };

  const getTaskSeasonTag = (task: Task) => {
    const seasonNumber = Number(task.tmdbSeasonNumber || 0);
    if (!seasonNumber) return '';
    const total = getTaskEpisodeTotal(task);
    const current = Number(task.currentEpisodes || 0);
    const progressText = total > 0 ? ` · ${Math.min(current, total)}/${total}集` : '';
    return `S${String(seasonNumber).padStart(2, '0')}${progressText}`;
  };

  const getTaskRemarkTag = (task: Task) => {
    const manualRemark = String(task.remark || '').trim();
    if (manualRemark) return manualRemark;

    try {
      const tmdbContent = task.tmdbContent ? JSON.parse(task.tmdbContent) : null;
      const candidates = [
        tmdbContent?.title,
        tmdbContent?.name,
        tmdbContent?.zhTitle,
        tmdbContent?.chineseTitle,
        tmdbContent?.originalTitle,
        tmdbContent?.original_name
      ];
      const chineseTitle = candidates.find((value: unknown) => /[\u4e00-\u9fff]/.test(String(value || '').trim()));
      return String(chineseTitle || '').trim();
    } catch {
      return '';
    }
  };

  const buildTmdbDisplayTitle = (tmdbContentRaw: unknown) => {
    try {
      const tmdbContent = typeof tmdbContentRaw === 'string'
        ? JSON.parse(tmdbContentRaw)
        : tmdbContentRaw;
      const chineseTitleCandidates = [
        tmdbContent?.title,
        tmdbContent?.name,
        tmdbContent?.zhTitle,
        tmdbContent?.chineseTitle
      ].map((value: unknown) => String(value || '').trim()).filter(Boolean);
      const originalTitleCandidates = [
        tmdbContent?.originalTitle,
        tmdbContent?.original_name,
        tmdbContent?.originalName
      ].map((value: unknown) => String(value || '').trim()).filter(Boolean);

      const chineseTitle = chineseTitleCandidates.find(value => /[\u4e00-\u9fff]/.test(value)) || '';
      const originalTitle = originalTitleCandidates.find(value => !/[\u4e00-\u9fff]/.test(value)) || '';

      if (chineseTitle && originalTitle && chineseTitle !== originalTitle) {
        return `${chineseTitle} (${originalTitle})`;
      }
      return chineseTitle || originalTitle || '';
    } catch {
      return '';
    }
  };

  const resolveTaskRemarksFromTmdb = useCallback(async (taskList: Task[]) => {
    const currentResolved = resolvedRemarkMap;
    const targets = taskList.filter(task => {
      const localRemark = getTaskRemarkTag(task);
      return !localRemark && task.tmdbId && !currentResolved[task.id];
    });

    if (targets.length === 0) return;

    const resolvedEntries = await Promise.all(targets.map(async task => {
      const tmdbId = String(task.tmdbId || '').trim();
      if (!tmdbId) return null;

      const preferredType = Number(task.tmdbSeasonNumber || 0) > 0 || Number(task.tmdbSeasonEpisodes || 0) > 0 ? 'tv' : 'movie';
      const fallbackType = preferredType === 'tv' ? 'movie' : 'tv';

      const fetchDetail = async (type: 'tv' | 'movie') => {
        const cacheKey = `${type}:${tmdbId}`;
        if (tmdbRemarkCache.has(cacheKey)) {
          return tmdbRemarkCache.get(cacheKey);
        }
        const res = await fetch(`/api/tmdb/${type}/${tmdbId}`);
        const data = await res.json();
        const detail = data.success ? data.data : null;
        if (detail) {
          tmdbRemarkCache.set(cacheKey, detail);
          saveSessionMap(TMDB_REMARK_DETAIL_CACHE_KEY, Object.fromEntries(tmdbRemarkCache.entries()));
        }
        return detail;
      };

      try {
        const detail = await fetchDetail(preferredType) || await fetchDetail(fallbackType);
        const remark = buildTmdbDisplayTitle(detail);
        return remark ? [task.id, remark] as const : null;
      } catch {
        return null;
      }
    }));

    const nextEntries = Object.fromEntries(resolvedEntries.filter(Boolean) as Array<readonly [number, string]>);
    if (Object.keys(nextEntries).length > 0) {
      setResolvedRemarkMap(prev => {
        const changed = Object.entries(nextEntries).some(([key, value]) => prev[Number(key)] !== value);
        if (!changed) {
          return prev;
        }
        const nextMap = { ...prev, ...nextEntries };
        saveSessionMap(TASK_REMARK_CACHE_KEY, nextMap);
        return nextMap;
      });
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}`);
      const data = await res.json();
      if (data.success) {
        const nextTasks = data.data || [];
        setTasks(nextTasks);
        void resolveTaskRemarksFromTmdb(nextTasks);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [resolveTaskRemarksFromTmdb, searchTerm, statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { if (refreshToken > 0) fetchTasks(); }, [refreshToken]);
  useClickOutside(topMenuRef, () => setIsTopMenuOpen(false), isTopMenuOpen);
  useClickOutside(taskMenuRef, () => setOpenTaskMenuId(null), openTaskMenuId !== null);
  useClickOutside(statusMenuRef, () => setOpenStatusMenuId(null), openStatusMenuId !== null);

  const handleOpenProcessedRecords = async (targetTasks: Task[]) => {
    setProcessedTasks(targetTasks);
    setSelectedRecordIds([]);
    setProcessedLoading(true);
    try {
      const ids = targetTasks.map(t => t.id).join(',');
      const res = await fetch(`/api/tasks/processed-files?taskIds=${ids}`);
      const data = await res.json();
      if (data.success) setProcessedRecords(data.data || []);
    } finally { setProcessedLoading(false); }
  };

  const handleDeleteRecords = async (ids: number[]) => {
    if (ids.length === 0) return;
    const taskIds = processedTasks.map(t => t.id);
    
    onShowConfirm?.(
      '清理处理记录', 
      `确定要删除选中的 ${ids.length} 条处理记录吗？\n删除后系统将不再跳过这些文件的转存。`, 
      async () => {
        try {
          const res = await fetch('/api/tasks/processed-files', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordIds: ids, taskIds: taskIds })
          });
          const data = await res.json();
          if (data.success) {
            onShowToast?.('记录已清理', 'success');
            setProcessedRecords(prev => prev.filter(r => !ids.includes(r.id)));
            setSelectedRecordIds([]);
          } else {
            onShowToast?.('删除失败: ' + data.error, 'error');
          }
        } catch (e) { onShowToast?.('请求失败', 'error'); }
      },
      'danger'
    );
  };

  const handleRunTask = async (id: number) => {
    try {
      const res = await fetch(`/api/tasks/${id}/execute`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        onShowToast?.('任务已开始执行', 'success');
        fetchTasks();
      } else {
        onShowToast?.('执行失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('执行失败', 'error'); }
  };

  const handleDeleteTask = async (id: number) => {
    onShowConfirm?.('删除转存任务', '确定要删除此任务吗？已转存的文件不会被自动移除。', async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          onShowToast?.('任务已删除', 'success');
          fetchTasks();
        } else {
          onShowToast?.('删除失败: ' + data.error, 'error');
        }
      } catch (e) { onShowToast?.('删除失败', 'error'); }
    }, 'danger');
  };

  const handleDeleteSelectedTasks = async () => {
    const ids = [...selectedTaskIds];
    if (ids.length === 0) return;

    onShowConfirm?.('批量删除任务', `确定要删除选中的 ${ids.length} 个任务吗？已转存的文件不会被自动移除。`, async () => {
      try {
        const res = await fetch('/api/tasks/batch', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskIds: ids, deleteCloud: false })
        });
        const data = await res.json();
        if (data.success) {
          onShowToast?.('选中任务已删除', 'success');
          setSelectedTaskIds([]);
          fetchTasks();
        } else {
          onShowToast?.('批量删除失败: ' + data.error, 'error');
        }
      } catch (e) { onShowToast?.('批量删除失败', 'error'); }
    }, 'danger');
  };

  const handleSyncSeasonEpisodes = async (task: Task) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/sync-season-episodes`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const info = data.data || {};
        setTasks(prev => prev.map(item => item.id === task.id ? {
          ...item,
          totalEpisodes: info.totalEpisodes || item.totalEpisodes,
          tmdbSeasonNumber: info.seasonNumber || item.tmdbSeasonNumber,
          tmdbSeasonName: info.seasonName || item.tmdbSeasonName,
          tmdbSeasonEpisodes: info.seasonEpisodes || item.tmdbSeasonEpisodes
        } : item));
        const seasonText = info.seasonNumber ? `S${String(info.seasonNumber).padStart(2, '0')} ` : '';
        onShowToast?.(`已识别 ${seasonText}${info.totalEpisodes || 0} 集`, 'success');
      } else {
        onShowToast?.('识别失败: ' + data.error, 'error');
      }
    } catch (e) { onShowToast?.('识别失败', 'error'); }
  };

  const handleChangeTaskStatus = async (task: Task, status: string) => {
    if (String(task.status || 'pending').toLowerCase() === status) {
      setOpenStatusMenuId(null);
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setTasks(prev => prev.map(item => item.id === task.id ? { ...item, status: data.data?.status || status } : item));
        setOpenStatusMenuId(null);
        onShowToast?.('任务状态已更新', 'success');
      } else {
        onShowToast?.('状态更新失败: ' + data.error, 'error');
      }
    } catch (e) {
      onShowToast?.('状态更新失败', 'error');
    }
  };

  return (
    <div className="workbench-page">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">任务编排</p>
            <h1 className="text-[var(--text-primary)]">任务控制台</h1>
            <p>实时监控自动化转存、刮削与进度状态，集中处理执行与异常回看。</p>
          </div>
          <div className="workbench-hero-stats">
             <div className="workbench-hero-metric">
               <div className="workbench-hero-metric-value">{tasks.length}</div>
               <div className="workbench-hero-metric-label">总任务</div>
             </div>
             <div className="h-8 w-px bg-[var(--border-color)]" />
             <div className="workbench-hero-metric">
               <div className="workbench-hero-metric-value text-emerald-500">{tasks.filter(t => String(t.status || '').toLowerCase() === 'completed').length}</div>
               <div className="workbench-hero-metric-label">已完结</div>
             </div>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => onCreateTask()} className="workbench-primary-button py-2 text-xs"><Plus size={14} /> 新建任务</button>
          <div ref={topMenuRef} className="relative">
            <button onClick={() => { setOpenTaskMenuId(null); setIsTopMenuOpen(!isTopMenuOpen); }} className="workbench-toolbar-button py-2 text-xs">批量操作 <ChevronDown size={14} /></button>
            <AnimatePresence>{isTopMenuOpen && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 top-full mt-1.5 w-44 glass-modal rounded-2xl py-1 z-[2000] shadow-2xl border border-[var(--border-color)] overflow-hidden">
                <button onClick={() => { setIsTopMenuOpen(false); handleOpenProcessedRecords(tasks.filter(t => selectedTaskIds.includes(t.id))); }} disabled={selectedTaskIds.length === 0} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold flex items-center gap-2 disabled:opacity-30"><Database size={14} /> 转存记录</button>
                <button onClick={() => { setIsTopMenuOpen(false); handleDeleteSelectedTasks(); }} disabled={selectedTaskIds.length === 0} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold text-red-500 flex items-center gap-2 disabled:opacity-30"><Trash2 size={14} /> 删除选中任务</button>
                <div className="h-px bg-[var(--border-color)] my-1" />
                <button onClick={() => { setIsTopMenuOpen(false); setSelectedTaskIds(tasks.map(t => t.id)); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold">全选任务</button>
                <button onClick={() => setSelectedTaskIds([])} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold text-red-500">取消选择</button>
              </motion.div>
            )}</AnimatePresence>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="workbench-select py-1.5 text-xs font-bold sm:min-w-[92px]"><option value="all">全部</option>{taskStatusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          <div className="relative min-w-0 flex-1 md:flex-none"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="workbench-input w-full pl-8 py-1.5 text-xs md:w-32" /></div>
          <button onClick={fetchTasks} className="p-2 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-2.5">
        {tasks.map(task => {
          const statusMeta = getTaskStatusMeta(task.status);
          const episodeTotal = getTaskEpisodeTotal(task);
          const episodeCurrent = episodeTotal > 0
            ? Math.min(Number(task.currentEpisodes || 0), episodeTotal)
            : Number(task.currentEpisodes || 0);
          const seasonTag = getTaskSeasonTag(task);
          const remarkTag = getTaskRemarkTag(task) || resolvedRemarkMap[task.id] || '';
          const rawTaskName = task.resourceName.replace(/\(根\)$/g, '').trim();
          const displayTaskName = remarkTag || rawTaskName;
          const isTaskLayerOpen = openTaskMenuId === task.id || openStatusMenuId === task.id;
          return (
            <div key={task.id} className={`workbench-panel p-3.5 group relative transition-all ${isTaskLayerOpen ? 'z-20 overflow-visible' : 'overflow-hidden'} ${selectedTaskIds.includes(task.id) ? 'ring-1 ring-blue-500 bg-blue-50/5' : ''}`}>
              <div className={`absolute left-0 top-0 w-0.5 h-full ${task.lastOrganizeError ? 'bg-red-500' : statusMeta.accentClass}`} />
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div onClick={() => setSelectedTaskIds(prev => prev.includes(task.id) ? prev.filter(i => i !== task.id) : [...prev, task.id])} className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${selectedTaskIds.includes(task.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{selectedTaskIds.includes(task.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div>
                  <div className="min-w-0">
                    <h3 className="font-black text-sm truncate max-w-[200px] md:max-w-md" title={displayTaskName}>{displayTaskName}</h3>
                    {remarkTag && rawTaskName && rawTaskName !== remarkTag && (
                      <p className="mt-0.5 max-w-[200px] truncate text-[10px] font-bold text-slate-400 md:max-w-md" title={rawTaskName}>
                        转存任务: {rawTaskName}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                      <span className="flex items-center gap-1"><User size={9} />{task.account.username}{task.account.accountType === 'family' ? ' [家庭云]' : ' [个人云]'}</span>
                      {seasonTag && (
                        <span className={`rounded-md px-1.5 py-0.5 ${episodeTotal > 0 && task.currentEpisodes >= episodeTotal ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                          {seasonTag}
                        </span>
                      )}
                      <div ref={openStatusMenuId === task.id ? statusMenuRef : undefined} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            setIsTopMenuOpen(false);
                            setOpenTaskMenuId(null);
                            setOpenStatusMenuId(openStatusMenuId === task.id ? null : task.id);
                          }}
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                          <ChevronDown size={10} />
                        </button>
                        <AnimatePresence>
                          {openStatusMenuId === task.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.96, y: 4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.96, y: 4 }}
                              className="absolute left-0 top-full mt-1 min-w-[112px] glass-modal rounded-2xl py-1 z-[2200] shadow-2xl border border-[var(--border-color)] overflow-hidden"
                            >
                              {taskStatusOptions.map(option => {
                                const optionMeta = getTaskStatusMeta(option.value);
                                const isActive = String(task.status || 'pending').toLowerCase() === option.value;
                                return (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleChangeTaskStatus(task, option.value)}
                                    className={`w-full text-left px-3 py-2 text-xs font-bold hover:bg-[var(--nav-hover-bg)] flex items-center justify-between gap-3 ${isActive ? 'bg-[var(--nav-hover-bg)]' : ''}`}
                                  >
                                    <span>{option.label}</span>
                                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] ${optionMeta.badgeClass}`}>{optionMeta.label}</span>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <span className="truncate flex items-center gap-1"><Files size={9} />{task.realFolderName || '根'}</span>
                    </div>
                    {task.lastOrganizeError && (
                      <div className="mt-1.5 flex items-start gap-1.5 p-1.5 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100/50 dark:border-red-900/20">
                        <AlertCircle size={10} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-[9px] font-bold text-red-600 line-clamp-1">{task.lastOrganizeError}</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">进度 {episodeCurrent}/{episodeTotal || '?'}</div>
                    <div className="w-20 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${statusMeta.progressClass}`} style={{ width: `${episodeTotal > 0 ? Math.min(100, (episodeCurrent / episodeTotal) * 100) : 0}%` }} /></div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleRunTask(task.id)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-lg transition-all"><RefreshCw size={15} /></button>
                    <div ref={openTaskMenuId === task.id ? taskMenuRef : undefined} className="relative">
                      <button onClick={() => { setIsTopMenuOpen(false); setOpenTaskMenuId(openTaskMenuId === task.id ? null : task.id); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"><MoreVertical size={16} /></button>
                      <AnimatePresence>{openTaskMenuId === task.id && (
                        <motion.div initial={{ opacity: 0, scale: 0.95, x: 5 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute right-0 top-full mt-1 w-36 glass-modal rounded-2xl py-1 z-[2100] shadow-2xl border border-[var(--border-color)] overflow-hidden">
                          <button onClick={() => { setOpenTaskMenuId(null); handleOpenProcessedRecords([task]); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold flex items-center gap-2"><Database size={13} /> 转存记录</button>
                          <button onClick={() => { setOpenTaskMenuId(null); handleSyncSeasonEpisodes(task); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold flex items-center gap-2"><RotateCcw size={13} /> 识别季集数</button>
                          <button onClick={() => { setOpenTaskMenuId(null); onCreateTask(task); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold flex items-center gap-2"><Edit3 size={13} /> 修改任务</button>
                          <div className="h-px bg-[var(--border-color)] my-1" />
                          <button onClick={() => { setOpenTaskMenuId(null); handleDeleteTask(task.id); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold text-red-500 flex items-center gap-2"><Trash2 size={13} /> 删除任务</button>
                        </motion.div>
                      )}</AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal - z-[1000] */}
      <Modal
        isOpen={processedTasks.length > 0}
        onClose={() => setProcessedTasks([])}
        title="转存记录详情"
        className="max-w-4xl"
        footer={
          <div className="px-8 py-6 border-t border-[var(--border-color)] bg-[var(--bg-main)]/40 flex justify-between items-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase">已选择 {selectedRecordIds.length} 条记录</div>
            <div className="flex gap-3">
              <button onClick={() => setProcessedTasks([])} className="workbench-toolbar-button px-8 border-none">取消</button>
              <button 
                onClick={() => handleDeleteRecords(selectedRecordIds)} 
                disabled={selectedRecordIds.length === 0}
                className="workbench-primary-button px-10 bg-red-500 hover:bg-red-600 disabled:opacity-30"
              >
                批量删除记录
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2 px-1">
             <div className="flex gap-2">
                <button onClick={() => setSelectedRecordIds(processedRecords.map(r => r.id))} className="text-[10px] font-bold text-blue-500 hover:underline">全选</button>
                <button onClick={() => setSelectedRecordIds([])} className="text-[10px] font-bold text-red-400 hover:underline">取消全选</button>
             </div>
             <span className="text-[10px] font-bold text-slate-400 uppercase">共 {processedRecords.length} 条记录</span>
          </div>

          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
            {processedLoading ? <div className="py-12 text-center animate-pulse text-slate-400 font-bold">载入中...</div> : processedRecords.length === 0 ? <div className="py-12 text-center text-slate-300 font-bold italic">暂无记录</div> : processedRecords.map(record => {
              const statusMeta = getRecordStatusMeta(record.status);
              return (
                <div key={record.id} className={`p-3 bg-[var(--bg-main)] rounded-xl border transition-all ${selectedRecordIds.includes(record.id) ? 'border-blue-500 ring-1 ring-blue-500/20 bg-blue-50/5' : 'border-[var(--border-color)]'}`}>
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div 
                        onClick={() => setSelectedRecordIds(prev => prev.includes(record.id) ? prev.filter(id => id !== record.id) : [...prev, record.id])} 
                        className={`mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${selectedRecordIds.includes(record.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}
                      >
                        {selectedRecordIds.includes(record.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-xs truncate text-[var(--text-primary)]">{record.sourceFileName}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                          <p className="text-[9px] font-mono text-slate-400 truncate uppercase">MD5: {record.sourceMd5 || '未知'}</p>
                          <span className="text-[9px] text-slate-400 font-bold flex items-center gap-1"><Clock size={10} /> {new Date(record.updatedAt).toLocaleString()}</span>
                        </div>
                        {record.lastError && (
                          <p className="mt-1.5 text-[9px] font-bold text-red-500 line-clamp-1">{record.lastError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-black ${statusMeta.className}`}>{statusMeta.label}</span>
                      <button onClick={() => handleDeleteRecords([record.id])} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TaskTab;
