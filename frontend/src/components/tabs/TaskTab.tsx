import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronRight, Filter, Search, RefreshCw, Files, PlayCircle, MoreVertical, CheckCircle2, AlertCircle, Clock, Trash2, ClipboardList, Edit3, Database, RotateCcw, X, ChevronDown, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import { ToastType } from '../Toast';

interface Account { id: number; username: string; accountType?: 'personal' | 'family'; driveLabel?: string; }
interface Task { id: number; resourceName: string; currentEpisodes: number; totalEpisodes: number; lastFileUpdateTime: string; account: Account; enableLazyStrm: boolean; lastOrganizeError?: string; realFolderName?: string; tmdbSeasonNumber?: number | null; tmdbSeasonName?: string | null; tmdbSeasonEpisodes?: number | null; }
interface ProcessedRecord { id: number; sourceFileName: string; sourceMd5?: string; status: string; updatedAt: string; lastError?: string | null; }

interface TaskTabProps {
  onCreateTask?: (data?: any) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
}

const TaskTab: React.FC<TaskTabProps> = ({ onCreateTask, onShowToast, onShowConfirm }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<number | null>(null);

  const [processedTasks, setProcessedTasks] = useState<Task[]>([]);
  const [processedRecords, setProcessedRecords] = useState<ProcessedRecord[]>([]);
  const [processedLoading, setProcessedLoading] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);

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

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?search=${encodeURIComponent(searchTerm)}&status=${statusFilter}`);
      const data = await res.json();
      if (data.success) setTasks(data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchTerm, statusFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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
               <div className="workbench-hero-metric-value text-emerald-500">{tasks.filter(t => t.totalEpisodes > 0 && t.currentEpisodes >= t.totalEpisodes).length}</div>
               <div className="workbench-hero-metric-label">已完结</div>
             </div>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => onCreateTask()} className="workbench-primary-button py-2 text-xs"><Plus size={14} /> 新建任务</button>
          <div className="relative">
            <button onClick={() => setIsTopMenuOpen(!isTopMenuOpen)} className="workbench-toolbar-button py-2 text-xs">批量操作 <ChevronDown size={14} /></button>
            <AnimatePresence>{isTopMenuOpen && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute left-0 top-full mt-1.5 w-44 glass-modal rounded-2xl py-1 z-[2000] shadow-2xl border border-[var(--border-color)] overflow-hidden">
                <button onClick={() => { setIsTopMenuOpen(false); handleOpenProcessedRecords(tasks.filter(t => selectedTaskIds.includes(t.id))); }} disabled={selectedTaskIds.length === 0} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold flex items-center gap-2 disabled:opacity-30"><Database size={14} /> 转存记录</button>
                <div className="h-px bg-[var(--border-color)] my-1" />
                <button onClick={() => { setIsTopMenuOpen(false); setSelectedTaskIds(tasks.map(t => t.id)); }} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold">全选任务</button>
                <button onClick={() => setSelectedTaskIds([])} className="w-full text-left px-4 py-2 hover:bg-[var(--nav-hover-bg)] text-xs font-bold text-red-500">取消选择</button>
              </motion.div>
            )}</AnimatePresence>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="workbench-select py-1.5 text-xs font-bold min-w-[80px]"><option value="all">全部</option><option value="processing">追更</option><option value="completed">完结</option></select>
          <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input type="text" placeholder="搜索..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="workbench-input pl-8 py-1.5 text-xs w-32" /></div>
          <button onClick={fetchTasks} className="p-2 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-2.5">
        {tasks.map(task => (
          <div key={task.id} className={`workbench-panel p-3.5 group relative transition-all ${openTaskMenuId === task.id ? 'z-20 overflow-visible' : 'overflow-hidden'} ${selectedTaskIds.includes(task.id) ? 'ring-1 ring-blue-500 bg-blue-50/5' : ''}`}>
            <div className={`absolute left-0 top-0 w-0.5 h-full ${task.lastOrganizeError ? 'bg-red-500' : (task.totalEpisodes > 0 && task.currentEpisodes >= task.totalEpisodes) ? 'bg-emerald-500' : 'bg-blue-500'}`} />
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div onClick={() => setSelectedTaskIds(prev => prev.includes(task.id) ? prev.filter(i => i !== task.id) : [...prev, task.id])} className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer ${selectedTaskIds.includes(task.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>{selectedTaskIds.includes(task.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}</div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm truncate max-w-[200px] md:max-w-md">{task.resourceName.replace(/\(根\)$/g, '')}</h3>
                  <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">
                    <span className="flex items-center gap-1"><User size={9} />{task.account.username}{task.account.accountType === 'family' ? ' [家庭云]' : ' [个人云]'}</span>
                    {task.tmdbSeasonNumber && (
                      <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-blue-500">
                        S{String(task.tmdbSeasonNumber).padStart(2, '0')}{task.tmdbSeasonEpisodes ? ` · ${task.tmdbSeasonEpisodes}集` : ''}
                      </span>
                    )}
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
                  <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">进度 {task.currentEpisodes}/{task.totalEpisodes || '?'}</div>
                  <div className="w-20 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${task.totalEpisodes > 0 ? Math.min(100, (task.currentEpisodes / task.totalEpisodes) * 100) : 0}%` }} /></div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleRunTask(task.id)} className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-500 rounded-lg transition-all"><RefreshCw size={15} /></button>
                  <div className="relative">
                    <button onClick={() => setOpenTaskMenuId(openTaskMenuId === task.id ? null : task.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"><MoreVertical size={16} /></button>
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
        ))}
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
