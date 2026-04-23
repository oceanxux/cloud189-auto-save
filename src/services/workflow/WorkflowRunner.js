const crypto = require('crypto');
const { WORKFLOW_DEFS } = require('./workflowDefinitions');

const createId = () => crypto.randomUUID();

class WorkflowRunner {
    constructor(workflowRunRepo, executors = {}, notifiers = {}) {
        this.workflowRunRepo = workflowRunRepo;
        this.executors = executors;
        this.notifiers = {
            sendConfirmCard: async () => {},
            sendResult: async () => {},
            sendError: async () => {},
            sendCancelled: async () => {},
            ...notifiers
        };
    }

    async start(type, params = {}, source = {}) {
        const baseSteps = type === 'multi_step'
            ? (Array.isArray(params.steps) ? params.steps : [])
            : (WORKFLOW_DEFS[type] || []);
        if (!baseSteps.length) {
            throw new Error(`未定义工作流: ${type}`);
        }

        const run = await this.workflowRunRepo.save({
            id: createId(),
            type,
            status: 'pending',
            steps: baseSteps,
            current: 0,
            context: params,
            confirmKey: null,
            source: source.source || 'web',
            chatId: source.chatId ? String(source.chatId) : null
        });

        await this.advance(run.id);
        return run.id;
    }

    async getRun(runId) {
        return await this.workflowRunRepo.findOneBy({ id: runId });
    }

    async getPendingConfirm(chatId, source = 'bot') {
        if (!chatId) {
            return null;
        }
        return await this.workflowRunRepo.findOne({
            where: {
                status: 'awaiting_confirm',
                source,
                chatId: String(chatId)
            },
            order: {
                updatedAt: 'DESC'
            }
        });
    }

    async advance(runId) {
        const run = await this.getRun(runId);
        if (!run || ['done', 'failed'].includes(run.status)) {
            return;
        }

        const step = Array.isArray(run.steps) ? run.steps[run.current] : null;
        if (!step) {
            const doneRun = await this._updateRun(runId, { status: 'done' });
            await this.notifiers.sendResult(doneRun);
            return;
        }

        await this._updateRun(runId, { status: 'running' });

        try {
            const executor = this.executors[step.executor];
            if (!executor || typeof executor.run !== 'function') {
                throw new Error(`未找到执行器: ${step.executor}`);
            }

            const freshRun = await this.getRun(runId);
            const result = await executor.run(freshRun.context || {}, freshRun);

            if (result?.type === 'AWAIT_CONFIRM') {
                const confirmKey = createId();
                const waitingRun = await this._updateRun(runId, {
                    status: 'awaiting_confirm',
                    confirmKey,
                    context: {
                        ...(freshRun.context || {}),
                        preview: result.preview || ''
                    }
                });
                await this.notifiers.sendConfirmCard(waitingRun, result.preview || '', confirmKey);
                return;
            }

            await this._updateRun(runId, {
                current: Number(freshRun.current || 0) + 1,
                context: {
                    ...(freshRun.context || {}),
                    ...((result && result.context) || {})
                }
            });
            await this.advance(runId);
        } catch (error) {
            const failedRun = await this._updateRun(runId, {
                status: 'failed',
                context: {
                    ...(run.context || {}),
                    error: error.message
                }
            });
            await this.notifiers.sendError(failedRun, error);
        }
    }

    async confirm(runId, key, approved) {
        const run = await this.getRun(runId);
        if (!run || run.status !== 'awaiting_confirm' || run.confirmKey !== key) {
            return null;
        }

        if (!approved) {
            const cancelledRun = await this._updateRun(runId, {
                status: 'failed',
                confirmKey: null,
                context: {
                    ...(run.context || {}),
                    cancelled: true
                }
            });
            await this.notifiers.sendCancelled(cancelledRun);
            return cancelledRun;
        }

        await this._updateRun(runId, {
            status: 'running',
            current: Number(run.current || 0) + 1,
            confirmKey: null
        });
        await this.advance(runId);
        return await this.getRun(runId);
    }

    async _updateRun(runId, patch = {}) {
        await this.workflowRunRepo.update(runId, patch);
        return await this.getRun(runId);
    }
}

module.exports = { WorkflowRunner };
