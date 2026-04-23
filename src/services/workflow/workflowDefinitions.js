const WORKFLOW_DEFS = {
    organize_dir: [
        { id: 'scan', name: '扫描目录', executor: 'scanDir' },
        { id: 'tmdb', name: 'TMDB 识别', executor: 'tmdbMatch' },
        { id: 'naming', name: '生成命名', executor: 'generateNames' },
        { id: 'confirm', name: '等待确认', executor: 'awaitConfirm' },
        { id: 'move', name: '移动文件', executor: 'moveFiles' },
        { id: 'notify', name: '通知 Emby', executor: 'notifyEmby' }
    ],
    task_execute: [
        { id: 'execute', name: '执行任务', executor: 'executeTask' },
        { id: 'notify', name: '通知 Emby', executor: 'notifyEmby' }
    ],
    multi_step: []
};

module.exports = { WORKFLOW_DEFS };
