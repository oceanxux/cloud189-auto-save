import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Database,
  Edit3,
  Film,
  Folder,
  Link2,
  LoaderCircle,
  MoreVertical,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Tv,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Modal from '../Modal';
import { ToastType } from '../Toast';
import { useClickOutside } from '../../utils/useClickOutside';

const TASK_REMARK_CACHE_KEY = 'task-tmdb-remarks';
const TMDB_REMARK_DETAIL_CACHE_KEY = 'task-tmdb-detail-cache';
const TMDB_MEDIA_CACHE_KEY = 'task-tmdb-media-cache-v2';

interface Account {
  id: number;
  username: string;
  accountType?: 'personal' | 'family';
  driveLabel?: string;
}

interface Task {
  id: number;
  resourceName: string;
  status: string;
  currentEpisodes: number;
  totalEpisodes: number;
  lastFileUpdateTime?: string;
  updatedAt?: string;
  createdAt?: string;
  account: Account;
  enableLazyStrm: boolean;
  lastOrganizeError?: string;
  lastError?: string;
  realFolderName?: string;
  taskGroup?: string | null;
  videoType?: string | null;
  tmdbSeasonNumber?: number | null;
  tmdbSeasonName?: string | null;
  tmdbSeasonEpisodes?: number | null;
  tmdbId?: string | null;
  remark?: string | null;
  tmdbContent?: string | null;
}

interface ProcessedRecord {
  id: number;
  sourceFileName: string;
  sourceMd5?: string;
  status: string;
  updatedAt: string;
  lastError?: string | null;
}

interface CachedTmdbMedia {
  posterUrl?: string;
  mediaType?: 'movie' | 'tv';
  title?: string;
  originalTitle?: string;
  releaseDate?: string;
  overview?: string;
  voteAverage?: number;
  genreIds?: number[];
  originCountry?: string[];
  originalLanguage?: string;
  subCategory?: string;
}

interface TaskTabProps {
  onCreateTask?: (data?: any) => void;
  onShowToast?: (message: string, type: ToastType) => void;
  onShowConfirm?: (title: string, message: string, onConfirm: () => void, type?: 'danger' | 'warning' | 'info') => void;
  refreshToken?: number;
}

const loadPersistentMap = <T extends Record<string, any>>(key: string): T => {
  if (typeof window === 'undefined') return {} as T;
  try {
    return JSON.parse(window.localStorage.getItem(key) || '{}');
  } catch {
    return {} as T;
  }
};

const savePersistentMap = (key: string, value: Record<string, any>) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota/availability errors
  }
};

const tmdbRemarkCache = new Map<string, any>(Object.entries(loadPersistentMap(TMDB_REMARK_DETAIL_CACHE_KEY)));

const parseTaskTmdbContent = (task: Task) => {
  try {
    return task.tmdbContent ? JSON.parse(task.tmdbContent) : null;
  } catch {
    return null;
  }
};

const hasTaskSeasonHint = (task: Task) => {
  const titleSources = [
    task.resourceName,
    task.realFolderName
  ]
    .map(value => String(value || '').replace(/\(根\)$/g, '').trim())
    .filter(Boolean);

  return titleSources.some(title => /(?:^|[\s._-])S\d{1,2}(?:E\d{1,3})?(?=[\s._-]|$)|(?:^|[\s._-])\d{1,2}x\d{1,3}(?=[\s._-]|$)|第\s*[零一二两三四五六七八九十百\d]{1,4}\s*季/i.test(title));
};

const getTaskMediaType = (task: Task) => {
  const tmdbContent = parseTaskTmdbContent(task);
  const explicitType = [tmdbContent?.type, tmdbContent?.media_type, task.videoType]
    .map(value => String(value || '').trim().toLowerCase())
    .find(value => value === 'movie' || value === 'tv');
  if (explicitType) {
    return explicitType as 'movie' | 'tv';
  }
  if (hasTaskSeasonHint(task)) {
    return 'tv';
  }
  return Number(task.tmdbSeasonNumber || 0) > 0 || Number(task.totalEpisodes || 0) > 1 ? 'tv' : 'movie';
};

const getAlternateTaskMediaType = (task: Task) => (getTaskMediaType(task) === 'tv' ? 'movie' : 'tv');

const getTaskMediaCacheKey = (task: Task, overrideType?: 'movie' | 'tv') => {
  const tmdbId = String(task.tmdbId || '').trim();
  if (!tmdbId) return '';
  return `${overrideType || getTaskMediaType(task)}:${tmdbId}`;
};

const getTaskEpisodeTotal = (task: Task) => {
  const seasonTotal = Number(task.tmdbSeasonNumber || 0) > 0 ? Number(task.tmdbSeasonEpisodes || 0) : 0;
  return seasonTotal > 0 ? seasonTotal : Number(task.totalEpisodes || 0);
};

const getTaskProgressPercent = (task: Task) => {
  const total = getTaskEpisodeTotal(task);
  const current = Number(task.currentEpisodes || 0);
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((Math.min(current, total) / total) * 100));
};

const getTaskSeasonTag = (task: Task) => {
  const seasonNumber = Number(task.tmdbSeasonNumber || 0);
  if (!seasonNumber) return '';
  const total = getTaskEpisodeTotal(task);
  const current = Number(task.currentEpisodes || 0);
  const progressText = total > 0 ? ` · ${Math.min(current, total)}/${total}集` : '';
  return `S${String(seasonNumber).padStart(2, '0')}${progressText}`;
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

const getTaskRemarkTag = (task: Task) => {
  const manualRemark = String(task.remark || '').trim();
  if (manualRemark) return manualRemark;
  return buildTmdbDisplayTitle(task.tmdbContent);
};

const getTaskGroupLabel = (task: Task, mediaType?: 'movie' | 'tv', subCategory?: string) => {
  const group = String(task.taskGroup || '').trim();
  if (group) return group;
  if (subCategory) return subCategory;
  return (mediaType || getTaskMediaType(task)) === 'tv' ? '电视剧' : '电影';
};

const formatDateTime = (value?: string) => {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN');
};

const extractYear = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
};

const TaskTab: React.FC<TaskTabProps> = ({ onCreateTask, onShowToast, onShowConfirm, refreshToken = 0 }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [accountFilter, setAccountFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<number[]>([]);
  const [openTaskMenuId, setOpenTaskMenuId] = useState<number | null>(null);
  const [openStatusMenuId, setOpenStatusMenuId] = useState<number | null>(null);
  const [showToolbar, setShowToolbar] = useState(true);
  const taskMenuRef = useRef<HTMLDivElement>(null);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const [processedTasks, setProcessedTasks] = useState<Task[]>([]);
  const [processedRecords, setProcessedRecords] = useState<ProcessedRecord[]>([]);
  const [processedLoading, setProcessedLoading] = useState(false);
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [resolvedRemarkMap, setResolvedRemarkMap] = useState<Record<string, string>>(() => loadPersistentMap(TASK_REMARK_CACHE_KEY));
  const [mediaAssetMap, setMediaAssetMap] = useState<Record<string, CachedTmdbMedia>>(() => loadPersistentMap(TMDB_MEDIA_CACHE_KEY));

  const resolvedRemarkMapRef = useRef(resolvedRemarkMap);
  const mediaAssetMapRef = useRef(mediaAssetMap);

  useEffect(() => { resolvedRemarkMapRef.current = resolvedRemarkMap; }, [resolvedRemarkMap]);
  useEffect(() => { mediaAssetMapRef.current = mediaAssetMap; }, [mediaAssetMap]);

  const taskStatusOptions = [
    { value: 'processing', label: '追剧中' },
    { value: 'completed', label: '已完结' },
    { value: 'failed', label: '失败' },
    { value: 'pending', label: '等待中' },
    { value: 'link_abnormal', label: '链接异常' }
  ];

  const getTaskStatusMeta = (status?: string) => {
    const normalized = String(status || 'pending').toLowerCase();
    const statusMap: Record<string, { label: string; badgeClass: string; accentClass: string; progressClass: string }> = {
      pending: {
        label: '等待中',
        badgeClass: 'bg-sky-500/10 text-sky-600',
        accentClass: 'bg-sky-500',
        progressClass: 'bg-sky-500'
      },
      processing: {
        label: '追剧中',
        badgeClass: 'bg-amber-500/10 text-amber-600',
        accentClass: 'bg-amber-500',
        progressClass: 'bg-blue-500'
      },
      completed: {
        label: '已完结',
        badgeClass: 'bg-emerald-500/10 text-emerald-600',
        accentClass: 'bg-emerald-500',
        progressClass: 'bg-emerald-500'
      },
      failed: {
        label: '失败',
        badgeClass: 'bg-red-500/10 text-red-600',
        accentClass: 'bg-red-500',
        progressClass: 'bg-red-500'
      },
      link_abnormal: {
        label: '链接异常',
        badgeClass: 'bg-rose-500/10 text-rose-600',
        accentClass: 'bg-rose-500',
        progressClass: 'bg-rose-500'
      }
    };
    return statusMap[normalized] || {
      label: normalized || '未知',
      badgeClass: 'bg-slate-500/10 text-slate-500',
      accentClass: 'bg-slate-400',
      progressClass: 'bg-slate-400'
    };
  };

  const getCardStatusMeta = (task: Task) => {
    return getTaskStatusMeta(task.status);
  };

  const getRecordStatusMeta = (status?: string) => {
    const normalized = String(status || '').toLowerCase();
    if (['success', 'done', 'completed'].includes(normalized)) {
      return { label: '成功', className: 'bg-emerald-500/10 text-emerald-600' };
    }
    if (['processing', 'pending'].includes(normalized)) {
      return { label: '处理中', className: 'bg-blue-500/10 text-blue-600' };
    }
    if (['failed', 'error'].includes(normalized)) {
      return { label: '失败', className: 'bg-red-500/10 text-red-600' };
    }
    return { label: normalized || '未知', className: 'bg-slate-500/10 text-slate-500' };
  };

  const getTaskMediaAsset = (task: Task) => {
    const preferredKey = getTaskMediaCacheKey(task);
    const alternateKey = getTaskMediaCacheKey(task, getAlternateTaskMediaType(task));
    const preferredAsset = mediaAssetMap[preferredKey] || null;
    if (preferredAsset) {
      return preferredAsset;
    }

    const alternateAsset = mediaAssetMap[alternateKey] || null;
    if (!alternateAsset?.posterUrl) {
      return null;
    }

    return alternateAsset;
  };

  const resolveTaskRemarksFromTmdb = useCallback(async (taskList: Task[]) => {
    const currentResolved = resolvedRemarkMapRef.current;
    const targets = taskList.filter(task => {
      const localRemark = getTaskRemarkTag(task);
      return !localRemark && task.tmdbId && !currentResolved[String(task.id)];
    });

    if (targets.length === 0) return;

    const resolvedEntries = await Promise.all(targets.map(async task => {
      const tmdbId = String(task.tmdbId || '').trim();
      if (!tmdbId) return null;

      const preferredType = getTaskMediaType(task);
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
          savePersistentMap(TMDB_REMARK_DETAIL_CACHE_KEY, Object.fromEntries(tmdbRemarkCache.entries()));
        }
        return detail;
      };

      try {
        const detail = await fetchDetail(preferredType) || await fetchDetail(fallbackType);
        const remark = buildTmdbDisplayTitle(detail);
        return remark ? [String(task.id), remark] as const : null;
      } catch {
        return null;
      }
    }));

    const nextEntries = Object.fromEntries(resolvedEntries.filter(Boolean) as Array<readonly [string, string]>);
    if (Object.keys(nextEntries).length === 0) return;

    setResolvedRemarkMap(prev => {
      const changed = Object.entries(nextEntries).some(([key, value]) => prev[key] !== value);
      if (!changed) return prev;
      const nextMap = { ...prev, ...nextEntries };
      savePersistentMap(TASK_REMARK_CACHE_KEY, nextMap);
      return nextMap;
    });
  }, []);

  const resolveTaskMediaAssetsFromTmdb = useCallback(async (taskList: Task[]) => {
    const currentAssets = mediaAssetMapRef.current;
    const targets = taskList.filter(task => {
      const preferredKey = getTaskMediaCacheKey(task);
      const alternateKey = getTaskMediaCacheKey(task, getAlternateTaskMediaType(task));
      const preferredAsset = preferredKey ? currentAssets[preferredKey] : null;
      const alternateAsset = alternateKey ? currentAssets[alternateKey] : null;
      return Boolean(preferredKey) && (!preferredAsset || (!preferredAsset.posterUrl && !alternateAsset?.posterUrl));
    });

    if (targets.length === 0) return;

    const resolvedEntries = await Promise.all(targets.map(async task => {
      const tmdbId = String(task.tmdbId || '').trim();
      if (!tmdbId) return null;

      const preferredType = getTaskMediaType(task);
      const fallbackType = preferredType === 'tv' ? 'movie' : 'tv';

      const fetchMedia = async (type: 'tv' | 'movie') => {
        const res = await fetch(`/api/tmdb/${type}/${tmdbId}/poster`);
        const data = await res.json();
        return data.success ? data.data : null;
      };

      try {
        const media = await fetchMedia(preferredType) || await fetchMedia(fallbackType);
        if (!media) return null;
        const resolvedType = String(media.mediaType || preferredType).toLowerCase() === 'movie' ? 'movie' : 'tv';
        return [`${resolvedType}:${tmdbId}`, media] as const;
      } catch {
        return null;
      }
    }));

    const nextEntries = Object.fromEntries(resolvedEntries.filter(Boolean) as Array<readonly [string, CachedTmdbMedia]>);
    if (Object.keys(nextEntries).length === 0) return;

    setMediaAssetMap(prev => {
      const changed = Object.entries(nextEntries).some(([key, value]) => JSON.stringify(prev[key]) !== JSON.stringify(value));
      if (!changed) return prev;
      const nextMap = { ...prev, ...nextEntries };
      savePersistentMap(TMDB_MEDIA_CACHE_KEY, nextMap);
      return nextMap;
    });
  }, []);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      if (data.success) {
        const nextTasks = data.data || [];
        setTasks(nextTasks);
        void resolveTaskRemarksFromTmdb(nextTasks);
        void resolveTaskMediaAssetsFromTmdb(nextTasks);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [resolveTaskMediaAssetsFromTmdb, resolveTaskRemarksFromTmdb]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);
  useEffect(() => { if (refreshToken > 0) fetchTasks(); }, [fetchTasks, refreshToken]);
  useClickOutside(taskMenuRef, () => setOpenTaskMenuId(null), openTaskMenuId !== null);
  useClickOutside(statusMenuRef, () => setOpenStatusMenuId(null), openStatusMenuId !== null);

  const handleOpenProcessedRecords = async (targetTasks: Task[]) => {
    if (targetTasks.length === 0) return;
    setProcessedTasks(targetTasks);
    setSelectedRecordIds([]);
    setProcessedLoading(true);
    try {
      const ids = targetTasks.map(task => task.id).join(',');
      const res = await fetch(`/api/tasks/processed-files?taskIds=${ids}`);
      const data = await res.json();
      if (data.success) setProcessedRecords(data.data || []);
    } finally {
      setProcessedLoading(false);
    }
  };

  const handleDeleteRecords = async (ids: number[]) => {
    if (ids.length === 0) return;
    const taskIds = processedTasks.map(task => task.id);

    onShowConfirm?.(
      '清理处理记录',
      `确定要删除选中的 ${ids.length} 条处理记录吗？\n删除后系统将不再跳过这些文件的转存。`,
      async () => {
        try {
          const res = await fetch('/api/tasks/processed-files', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordIds: ids, taskIds })
          });
          const data = await res.json();
          if (data.success) {
            onShowToast?.('记录已清理', 'success');
            setProcessedRecords(prev => prev.filter(record => !ids.includes(record.id)));
            setSelectedRecordIds([]);
          } else {
            onShowToast?.('删除失败: ' + data.error, 'error');
          }
        } catch {
          onShowToast?.('请求失败', 'error');
        }
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
    } catch {
      onShowToast?.('执行失败', 'error');
    }
  };

  const handleDeleteTask = async (id: number) => {
    onShowConfirm?.('删除转存任务', '确定要删除此任务吗？已转存的文件不会被自动移除。', async () => {
      try {
        const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          onShowToast?.('任务已删除', 'success');
          setSelectedTaskIds(prev => prev.filter(taskId => taskId !== id));
          fetchTasks();
        } else {
          onShowToast?.('删除失败: ' + data.error, 'error');
        }
      } catch {
        onShowToast?.('删除失败', 'error');
      }
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
      } catch {
        onShowToast?.('批量删除失败', 'error');
      }
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
    } catch {
      onShowToast?.('识别失败', 'error');
    }
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
    } catch {
      onShowToast?.('状态更新失败', 'error');
    }
  };

  const categoryTabs = [
    { value: 'all', label: '全部任务', count: tasks.length },
    { value: 'processing', label: '追剧中', count: tasks.filter(task => String(task.status || '').toLowerCase() === 'processing').length },
    { value: 'completed', label: '已完结', count: tasks.filter(task => String(task.status || '').toLowerCase() === 'completed').length },
    { value: 'failed', label: '失败', count: tasks.filter(task => String(task.status || '').toLowerCase() === 'failed').length },
    { value: 'pending', label: '等待中', count: tasks.filter(task => String(task.status || '').toLowerCase() === 'pending').length },
    { value: 'link_abnormal', label: '链接异常', count: tasks.filter(task => String(task.status || '').toLowerCase() === 'link_abnormal').length }
  ];

  const accountOptions = Array.from(new Map(
    tasks
      .filter(task => task.account?.id)
      .map(task => [String(task.account.id), task.account.username])
  ).entries()).map(([value, label]) => ({ value, label }));

  const groupOptions = Array.from(new Set(
    tasks.map(task => getTaskGroupLabel(task, getTaskMediaAsset(task)?.mediaType, getTaskMediaAsset(task)?.subCategory))
  ))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(value => ({ value, label: value }));

  const visibleTasks = tasks.filter(task => {
    if (activeCategory !== 'all') {
      if (String(task.status || '').toLowerCase() !== activeCategory) {
        return false;
      }
    }

    const mediaAsset = getTaskMediaAsset(task);
    const mediaType = mediaAsset?.mediaType || getTaskMediaType(task);
    const groupLabel = getTaskGroupLabel(task, mediaType, mediaAsset?.subCategory);
    const remarkTag = getTaskRemarkTag(task) || resolvedRemarkMap[String(task.id)] || '';
    const rawTaskName = String(task.resourceName || '').replace(/\(根\)$/g, '').trim();
    const searchTarget = [
      remarkTag,
      rawTaskName,
      task.account?.username,
      task.realFolderName,
      groupLabel,
      mediaAsset?.subCategory || (mediaType === 'tv' ? '电视剧' : '电影'),
      task.lastError,
      task.lastOrganizeError
    ].join(' ').toLowerCase();

    if (accountFilter !== 'all' && String(task.account?.id || '') !== accountFilter) {
      return false;
    }
    if (groupFilter !== 'all' && groupLabel !== groupFilter) {
      return false;
    }
    if (typeFilter !== 'all' && mediaType !== typeFilter) {
      return false;
    }
    if (searchTerm.trim() && !searchTarget.includes(searchTerm.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  const selectedTasks = tasks.filter(task => selectedTaskIds.includes(task.id));
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every(task => selectedTaskIds.includes(task.id));

  return (
    <div className="workbench-page pb-10">
      <section className="workbench-hero">
        <div className="workbench-hero-header">
          <div className="workbench-hero-copy">
            <p className="workbench-kicker mb-2">任务中心</p>
            <h1 className="text-[var(--text-primary)]">任务列表</h1>
          </div>
          <div className="workbench-hero-stats w-full justify-between md:w-auto md:justify-start">
            <div className="workbench-hero-metric">
              <div className="workbench-hero-metric-value">{tasks.length}</div>
              <div className="workbench-hero-metric-label">总任务</div>
            </div>
            <div className="h-8 w-px bg-[var(--border-color)]" />
            <div className="workbench-hero-metric">
              <div className="workbench-hero-metric-value text-emerald-500">{tasks.filter(task => String(task.status || '').toLowerCase() === 'completed').length}</div>
              <div className="workbench-hero-metric-label">已完结</div>
            </div>
          </div>
        </div>
      </section>

      <div className="workbench-panel overflow-hidden">
        <div className="custom-scrollbar-hidden overflow-x-auto border-b border-[var(--border-color)] px-4 pt-4 sm:px-5 sm:pt-5">
          <div className="flex min-w-max gap-5 sm:gap-6">
            {categoryTabs.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveCategory(tab.value)}
                className={`relative pb-4 text-sm font-bold transition-colors ${activeCategory === tab.value ? 'text-blue-600' : 'text-[var(--text-primary)]/80 hover:text-[var(--text-primary)]'}`}
              >
                {tab.label}
                <span className="ml-2 text-xs text-slate-400">{tab.count}</span>
                {activeCategory === tab.value && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowToolbar(prev => !prev)}
              className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              title={showToolbar ? '收起工具栏' : '展开工具栏'}
            >
              <ChevronDown size={16} className={`transition-transform ${showToolbar ? '' : '-rotate-90'}`} />
            </button>
            {showToolbar && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => onCreateTask?.()} className="workbench-toolbar-button bg-[var(--bg-main)] px-5 py-2.5 text-sm font-bold">
                  <Plus size={16} />
                  创建任务
                </button>
                <button
                  onClick={handleDeleteSelectedTasks}
                  disabled={selectedTaskIds.length === 0}
                  className="workbench-toolbar-button px-5 py-2.5 text-sm font-bold text-rose-600 disabled:opacity-40"
                >
                  <Trash2 size={16} />
                  删除选中
                </button>
                <button
                  onClick={() => handleOpenProcessedRecords(selectedTasks)}
                  disabled={selectedTasks.length === 0}
                  className="workbench-toolbar-button px-5 py-2.5 text-sm font-bold disabled:opacity-40"
                >
                  <Database size={16} />
                  转存记录
                </button>
                <button
                  onClick={() => setSelectedTaskIds(prev => {
                    if (allVisibleSelected) {
                      return prev.filter(id => !visibleTasks.some(task => task.id === id));
                    }
                    return Array.from(new Set([...prev, ...visibleTasks.map(task => task.id)]));
                  })}
                  className="workbench-toolbar-button px-5 py-2.5 text-sm font-bold"
                >
                  <CheckCircle2 size={16} />
                  {allVisibleSelected ? '取消当前全选' : '全选当前'}
                </button>
                <button onClick={fetchTasks} className="workbench-toolbar-button px-4 py-2.5 text-sm font-bold">
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  刷新
                </button>
              </div>
            )}
          </div>

          <div className="hidden md:block">
            
            <div className="grid grid-cols-1 gap-3 md:grid lg:grid-cols-[1fr_1fr_1fr_1.35fr]">
              <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)} className="workbench-select">
                <option value="all">全部账号</option>
                {accountOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select value={groupFilter} onChange={event => setGroupFilter(event.target.value)} className="workbench-select">
                <option value="all">全部分组</option>
                {groupOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>

              <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="workbench-select">
                <option value="all">全部类型</option>
                <option value="movie">电影</option>
                <option value="tv">电视剧</option>
              </select>

              <div className="relative min-w-0">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="搜索资源名称/账号/目录/备注"
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  className="workbench-input pl-11"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-400">
            <span>当前显示 {visibleTasks.length} 项</span>
            <span>已选择 {selectedTaskIds.length} 项</span>
            {(searchTerm || accountFilter !== 'all' || groupFilter !== 'all' || typeFilter !== 'all' || activeCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setAccountFilter('all');
                  setGroupFilter('all');
                  setTypeFilter('all');
                  setActiveCategory('all');
                }}
                className="text-blue-600 hover:underline"
              >
                清空筛选
              </button>
            )}
          </div>
        </div>
      </div>

      {loading && tasks.length === 0 ? (
        <div className="workbench-panel flex min-h-[280px] items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-400">
            <LoaderCircle size={18} className="animate-spin" />
            正在加载任务中心...
          </div>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="workbench-panel flex min-h-[280px] items-center justify-center p-8 text-center">
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
              <Search size={24} />
            </div>
            <h3 className="text-base font-black text-[var(--text-primary)]">当前筛选下没有任务</h3>
            <p className="mt-2 text-sm font-medium text-slate-400">可以试试切换分类，或者清空搜索与筛选条件。</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {visibleTasks.map(task => {
            const mediaAsset = getTaskMediaAsset(task);
            const mediaType = mediaAsset?.mediaType || getTaskMediaType(task);
            const statusMeta = getCardStatusMeta(task);
            const episodeTotal = getTaskEpisodeTotal(task);
            const episodeCurrent = episodeTotal > 0
              ? Math.min(Number(task.currentEpisodes || 0), episodeTotal)
              : Number(task.currentEpisodes || 0);
            const progressPercent = getTaskProgressPercent(task);
            const seasonTag = getTaskSeasonTag(task);
            const remarkTag = getTaskRemarkTag(task) || resolvedRemarkMap[String(task.id)] || '';
            const rawTaskName = String(task.resourceName || '').replace(/\(根\)$/g, '').trim();
            const displayTaskName = remarkTag || rawTaskName || '未命名任务';
            const posterUrl = String(mediaAsset?.posterUrl || '').trim();
            const overview = String(mediaAsset?.overview || parseTaskTmdbContent(task)?.overview || '').trim();
            const rating = Number(mediaAsset?.voteAverage || parseTaskTmdbContent(task)?.voteAverage || parseTaskTmdbContent(task)?.vote_average || 0);
            const groupLabel = getTaskGroupLabel(task, mediaType, mediaAsset?.subCategory);
            const typeLabel = mediaAsset?.subCategory || (mediaType === 'tv' ? '电视剧' : '电影');
            const lastUpdated = formatDateTime(task.lastFileUpdateTime || task.updatedAt || task.createdAt);
            const isTaskLayerOpen = openTaskMenuId === task.id || openStatusMenuId === task.id;
            const isSelected = selectedTaskIds.includes(task.id);
            const pathLabel = task.realFolderName || '根目录';
            const errorText = task.lastOrganizeError || task.lastError || '';
            const yearLabel = extractYear(mediaAsset?.releaseDate || parseTaskTmdbContent(task)?.releaseDate || parseTaskTmdbContent(task)?.release_date || '');
            const originalTitle = String(mediaAsset?.originalTitle || parseTaskTmdbContent(task)?.originalTitle || parseTaskTmdbContent(task)?.original_name || '').trim();
            const secondaryTitle = [rawTaskName, originalTitle]
              .map(value => String(value || '').trim())
              .find(value => value && value !== displayTaskName);

            return (
              <div
                key={task.id}
                className={`workbench-panel group relative transition-all ${isTaskLayerOpen ? 'z-20 overflow-visible' : 'overflow-hidden'} ${isSelected ? 'ring-2 ring-blue-500/40' : ''}`}
              >
                <div className={`absolute inset-y-0 left-0 w-1 ${statusMeta.accentClass}`} />

                {/* 顶栏: 移动端两行布局, 桌面端一行 */}
                <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                  {/* 第一行: 选择框 + 状态 + 标题 + 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedTaskIds(prev => prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id])}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${isSelected ? 'border-blue-500 bg-blue-500 text-white' : 'border-slate-200 text-transparent hover:border-blue-300'}`}
                    >
                      <CheckCircle2 size={12} />
                    </button>

                    <div ref={openStatusMenuId === task.id ? statusMenuRef : undefined} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenTaskMenuId(null);
                          setOpenStatusMenuId(openStatusMenuId === task.id ? null : task.id);
                        }}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusMeta.badgeClass}`}
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
                            className="absolute left-0 top-full z-[2200] mt-2 min-w-[128px] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-2xl"
                          >
                            {taskStatusOptions.map(option => {
                              const optionMeta = getTaskStatusMeta(option.value);
                              const isActive = String(task.status || 'pending').toLowerCase() === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleChangeTaskStatus(task, option.value)}
                                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-bold hover:bg-[var(--nav-hover-bg)] ${isActive ? 'bg-[var(--nav-hover-bg)]' : ''}`}
                                >
                                  <span>{option.label}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${optionMeta.badgeClass}`}>{optionMeta.label}</span>
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black leading-snug text-[var(--text-primary)] sm:text-base" title={displayTaskName}>{displayTaskName}</h3>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 sm:inline-flex dark:bg-slate-800">{typeLabel}</span>
                      {seasonTag && <span className="hidden rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600 sm:inline-flex">{seasonTag}</span>}

                      <button onClick={() => handleRunTask(task.id)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950" title="执行任务">
                        <PlayCircle size={16} />
                      </button>

                      <div ref={openTaskMenuId === task.id ? taskMenuRef : undefined} className="relative">
                        <button
                        type="button"
                        onClick={() => {
                          setOpenStatusMenuId(null);
                          setOpenTaskMenuId(openTaskMenuId === task.id ? null : task.id);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                      >
                        <MoreVertical size={16} />
                      </button>

                      <AnimatePresence>
                        {openTaskMenuId === task.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 4 }}
                            className="absolute right-0 top-full z-[2100] mt-2 min-w-[136px] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-main)] shadow-2xl"
                          >
                            <button
                              onClick={() => {
                                setOpenTaskMenuId(null);
                                handleSyncSeasonEpisodes(task);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-bold hover:bg-[var(--nav-hover-bg)]"
                            >
                              <RotateCcw size={14} />
                              识别季集
                            </button>
                            <button
                              onClick={() => {
                                setOpenTaskMenuId(null);
                                handleOpenProcessedRecords([task]);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-bold hover:bg-[var(--nav-hover-bg)]"
                            >
                              <Database size={14} />
                              转存记录
                            </button>
                            <button
                              onClick={() => {
                                setOpenTaskMenuId(null);
                                onCreateTask?.(task);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-bold hover:bg-[var(--nav-hover-bg)]"
                            >
                              <Edit3 size={14} />
                              修改任务
                            </button>
                            <div className="mx-3 my-1 h-px bg-[var(--border-color)]" />
                            <button
                              onClick={() => {
                                setOpenTaskMenuId(null);
                                handleDeleteTask(task.id);
                              }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                            >
                              <Trash2 size={14} />
                              删除任务
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

                {/* 详情区: 始终显示 */}
                <div className="flex gap-3 border-t border-[var(--border-color)] px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
                  <div className="relative h-32 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 shadow-sm dark:bg-slate-800 sm:h-36 sm:w-[5.5rem]">
                    {posterUrl ? (
                      <img
                        src={posterUrl}
                        alt={displayTaskName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('[data-fallback]');
                            if (fallback) (fallback as HTMLElement).style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div data-fallback className={`${posterUrl ? 'hidden' : 'flex'} h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 text-white`}>
                      {mediaType === 'tv' ? <Tv size={24} /> : <Film size={24} />}
                      <span className="mt-1.5 px-2 text-center text-[10px] font-bold opacity-80 line-clamp-2">{displayTaskName.slice(0, 8) || 'TMDB'}</span>
                    </div>

                    {rating > 0 && (
                      <div className="absolute right-1.5 top-1.5 rounded-lg bg-black/70 px-1.5 py-0.5 text-[11px] font-black text-amber-400 backdrop-blur">
                        {rating.toFixed(1)}
                      </div>
                    )}

                    {episodeTotal > 0 && (
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-4 text-white">
                        <div className="flex items-center justify-between text-[10px] font-black">
                          <span>{episodeCurrent}</span>
                          <span>{episodeTotal}</span>
                        </div>
                        <div className="mt-0.5 h-0.5 rounded-full bg-white/20">
                          <div className={`h-full rounded-full ${statusMeta.progressClass}`} style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {secondaryTitle && (
                      <p className="line-clamp-1 text-[11px] font-medium text-slate-400">{secondaryTitle}</p>
                    )}

                    <div className="mt-1.5 space-y-1 text-[11px] text-[var(--text-primary)]/70">
                      <p className="flex items-center gap-1.5">
                        <User size={12} className="shrink-0 text-slate-400" />
                        <span>{task.account.username}</span>
                        <span className="text-slate-400">{task.account.accountType === 'family' ? '家庭云' : '个人云'}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Folder size={12} className="shrink-0 text-slate-400" />
                        <span className="truncate text-blue-500">{pathLabel}</span>
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Clock3 size={12} className="shrink-0 text-slate-400" />
                        <span>{lastUpdated}</span>
                      </p>
                    </div>

                    {errorText && (
                      <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-600 dark:border-rose-900/30 dark:bg-rose-950/20">
                        <div className="flex items-start gap-1.5">
                          <AlertCircle size={12} className="mt-0.5 shrink-0" />
                          <span className="line-clamp-1 font-medium">{errorText}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={processedTasks.length > 0}
        onClose={() => setProcessedTasks([])}
        title="转存记录详情"
        className="max-w-4xl"
        footer={
          <div className="flex flex-col gap-4 border-t border-[var(--border-color)] bg-[var(--bg-main)]/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
            <div className="text-[10px] font-bold uppercase text-slate-400">已选择 {selectedRecordIds.length} 条记录</div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <button onClick={() => setProcessedTasks([])} className="workbench-toolbar-button justify-center border-none px-6 sm:px-8">取消</button>
              <button
                onClick={() => handleDeleteRecords(selectedRecordIds)}
                disabled={selectedRecordIds.length === 0}
                className="workbench-primary-button justify-center bg-red-500 px-6 hover:bg-red-600 disabled:opacity-30 sm:px-10"
              >
                批量删除记录
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <div className="flex gap-2">
              <button onClick={() => setSelectedRecordIds(processedRecords.map(record => record.id))} className="text-[10px] font-bold text-blue-500 hover:underline">全选</button>
              <button onClick={() => setSelectedRecordIds([])} className="text-[10px] font-bold text-red-400 hover:underline">取消全选</button>
            </div>
            <span className="text-[10px] font-bold uppercase text-slate-400">共 {processedRecords.length} 条记录</span>
          </div>

          <div className="custom-scrollbar max-h-[55vh] space-y-2 overflow-y-auto pr-2">
            {processedLoading ? (
              <div className="py-12 text-center font-bold text-slate-400">
                载入中...
              </div>
            ) : processedRecords.length === 0 ? (
              <div className="py-12 text-center font-bold italic text-slate-300">
                暂无记录
              </div>
            ) : processedRecords.map(record => {
              const statusMeta = getRecordStatusMeta(record.status);
              return (
                <div
                  key={record.id}
                  className={`rounded-xl border bg-[var(--bg-main)] p-3 transition-all ${selectedRecordIds.includes(record.id) ? 'border-blue-500 bg-blue-50/5 ring-1 ring-blue-500/20' : 'border-[var(--border-color)]'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        onClick={() => setSelectedRecordIds(prev => prev.includes(record.id) ? prev.filter(id => id !== record.id) : [...prev, record.id])}
                        className={`mt-1 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded border ${selectedRecordIds.includes(record.id) ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}
                      >
                        {selectedRecordIds.includes(record.id) && <div className="h-1.5 w-1.5 rounded-sm bg-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-xs font-bold text-[var(--text-primary)]">{record.sourceFileName}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <p className="break-all font-mono text-[9px] uppercase text-slate-400">MD5: {record.sourceMd5 || '未知'}</p>
                          <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400">
                            <Clock3 size={10} />
                            {formatDateTime(record.updatedAt)}
                          </span>
                        </div>
                        {record.lastError && (
                          <p className="mt-1.5 line-clamp-1 text-[9px] font-bold text-red-500">{record.lastError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                      <span className={`rounded px-2 py-0.5 text-[9px] font-black ${statusMeta.className}`}>{statusMeta.label}</span>
                      <button onClick={() => handleDeleteRecords([record.id])} className="p-1.5 text-slate-300 transition-colors hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
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
