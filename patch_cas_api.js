const fs = require('fs');
const content = fs.readFileSync('src/index.js', 'utf8');

const casApi = `    // 批量转换 .cas 存根
    app.post('/api/file-manager/batch-convert-cas', async (req, res) => {
        try {
            const { accountId, fileIds } = req.body || {};
            const account = await accountRepo.findOneBy({ id: Number(accountId) });
            if (!account) throw new Error('账号不存在');
            const cloud189 = Cloud189Service.getInstance(account);
            const MEDIA_EXTS = ['.mkv', '.iso', '.ts', '.mp4', '.avi', '.rmvb', '.wmv', '.m2ts', '.mpg', '.flv', '.rm', '.mov'];
            let count = 0;
            for (const fileId of fileIds) {
                const fileInfo = await cloud189.getFileInfo(fileId);
                if (fileInfo && !fileInfo.isFolder) {
                    const ext = (fileInfo.name || '').split('.').pop().toLowerCase();
                    if (MEDIA_EXTS.includes('.' + ext)) {
                        await cloud189.renameFile(fileId, \`\${fileInfo.name}.cas\`);
                        count++;
                    }
                }
            }
            res.json({ success: true, data: { count } });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    });

    app.post('/api/file-manager/move'`;

if (!content.includes('/api/file-manager/batch-convert-cas')) {
    const updated = content.replace(/app\.post\('\/api\/file-manager\/move'/, casApi);
    fs.writeFileSync('src/index.js', updated);
    console.log('Successfully added .cas conversion API to src/index.js');
} else {
    console.log('API already exists.');
}
