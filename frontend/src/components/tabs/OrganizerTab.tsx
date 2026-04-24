import React, { useState, useEffect, useCallback } from 'react';
import { Play, Search, RefreshCw, Clock, AlertCircle, CheckCircle2, User } from 'lucide-react';
import { motion } from 'motion/react';
import { ToastType } from '../Toast';

interface Account {
  id: number;
  username: string;
  accountType: 'personal' | 'family';
}

interface OrganizerTask {
  id: number;
  resourceName: string;
  shareFolderName?: string;
  account: Account;
  enableOrganizer: boolean;
  lastOrganizedAt: string | null;
  lastOrganizeError: string | null;
}

interface OrganizerTabProps {
  onShowToast?: (message: string, type: ToastType) => void;
}

const stripRootSuffix = (value?: string | null) => String(value || '').replace(/\(根\)$/u, '').trim();
const getDisplayTaskName = (task: OrganizerTask) => {
  const resourceName = stripRootSuffix(task.resourceName) || '未知';
  return task.shareFolderName ? `${resourceName}/${task.shareFolderName}` : resourceName;
};

const OrganizerTab: React.FC<OrganizerTabProps> = ({ onShowToast }) => {
  const [tasks, setTasks] = useState<OrganizerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/organizer/tasks?search=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      if (data.success) {
        setTasks(data.data || []);
      }
    } catch (error) {
      console.error('获取整理任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleRunTask = async (taskId: number) => {
    try {
      const response = await fetch(`/api/organizer/tasks/${taskId}/run`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        onShowToast?.(data.data?.message || '整理任务已触发', 'success');
        fetchTasks();
      } else {
        onShowToast?.('执行失败: ' + data.error, 'error');
      }
    } catch (error) {
      onShowToast?.('执行失败', 'error');
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '从未执行';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="workbench-page">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">内容整理</p>
            <h1 className="text-[var(--text-primary)]">整理器控制台</h1>
            <p>监控已开启自动整理的任务。您可以手动触发整理流程，或检查最近一次归档的详细结果。</p>
          </div>
          <div className="workbench-hero-stats">
            <div className="workbench-hero-metric">
              <div className="workbench-hero-metric-value">{tasks.length}</div>
              <div className="workbench-hero-metric-label">活跃任务</div>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <h2 className="workbench-section-title">
          <RefreshCw size={20} className="text-[var(--app-accent)]" />
          整理任务列表
        </h2>
        <div className="flex items-center gap-3">
          <div className="relative group w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[var(--app-accent)] transition-colors" size={16} />
            <input type="text" placeholder="搜索任务..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchTasks()} className="workbench-input pl-11 py-2" />
          </div>
          <button onClick={fetchTasks} className="p-3 bg-[var(--bg-main)] border border-[var(--border-color)] rounded-2xl hover:bg-[var(--nav-hover-bg)] transition-all text-[var(--text-primary)]"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      <div className="workbench-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-[var(--border-color)] text-[10px] font-black uppercase text-[var(--text-secondary)]">
                <th className="px-6 py-5">操作</th>
                <th className="px-6 py-5">任务名称</th>
                <th className="px-6 py-5">执行账号</th>
                <th className="px-6 py-5">整理状态</th>
                <th className="px-6 py-5">上次执行</th>
                <th className="px-6 py-5">详情/异常</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {loading && tasks.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center animate-pulse font-bold text-slate-400">正在同步任务状态...</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center font-bold text-slate-300 italic">暂无整理任务数据</td></tr>
              ) : tasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4"><button onClick={() => handleRunTask(task.id)} className="workbench-primary-button py-2 px-4 text-xs">触发整理</button></td>
                  <td className="px-6 py-4 font-bold text-[var(--text-primary)]">{getDisplayTaskName(task)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-[var(--app-accent-soft)] flex items-center justify-center text-[var(--app-accent)] font-black text-[10px]">{(task.account.username || 'U')[0]}</div>
                      <span className="font-bold">{task.account.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {task.lastOrganizeError ? <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded-lg text-[10px] font-bold">整理失败</span> : (task.lastOrganizedAt ? <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-bold">整理完成</span> : <span className="px-2 py-1 bg-slate-200 text-slate-500 rounded-lg text-[10px] font-bold">待命</span>)}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-400">{formatDateTime(task.lastOrganizedAt)}</td>
                  <td className="px-6 py-4 max-w-[200px] truncate text-xs text-red-500" title={task.lastOrganizeError || ''}>{task.lastOrganizeError || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export default OrganizerTab;
