const fs = require('fs');
const content = fs.readFileSync('src/services/organizer.js', 'utf8');

const newCleanupLogic = `    async _cleanupStagingFolders(cloud189, originalFolderId, originalRootFolderId, targetFolderId) {
        const cleanupCandidates = Array.from(new Set(
            [originalFolderId, originalRootFolderId]
                .map(id => String(id || '').trim())
                .filter(Boolean)
                .filter(id => id !== String(targetFolderId || '').trim())
        ));

        for (const folderId of cleanupCandidates) {
            await this._cleanupEmptyFolderTree(cloud189, folderId);
        }
    }

    async _cleanupEmptyFolderTree(cloud189, folderId) {
        const normalizedFolderId = String(folderId || '').trim();
        if (!normalizedFolderId || normalizedFolderId === '0') {
            return false;
        }

        try {
            const folderInfo = await cloud189.listFiles(normalizedFolderId);
            const childFolders = Array.isArray(folderInfo?.fileListAO?.folderList) ? folderInfo.fileListAO.folderList : [];
            for (const folder of childFolders) {
                await this._cleanupEmptyFolderTree(cloud189, folder.id);
            }

            const refreshedInfo = await cloud189.listFiles(normalizedFolderId);
            const listAO = refreshedInfo?.fileListAO;
            if (!listAO) return false;

            const files = Array.isArray(listAO.fileList) ? listAO.fileList : [];
            const folders = Array.isArray(listAO.folderList) ? listAO.folderList : [];

            const METADATA_EXTS = new Set(['.nfo', '.jpg', '.jpeg', '.png', '.tbn', '.txt', '.url', '.pdf', '.docx', '.md', '.iso', '.cas']);
            const realFiles = files.filter(f => {
                const ext = (f.name || '').split('.').pop().toLowerCase();
                return !METADATA_EXTS.has('.' + ext);
            });

            if (realFiles.length === 0 && folders.length === 0) {
                if (files.length > 0) {
                    await this.taskService.deleteCloudFile(cloud189, files, 0);
                }
                await this.taskService.deleteCloudFile(cloud189, { id: normalizedFolderId, name: '' }, 1);
                return true;
            }
        } catch (error) {
            console.error(\`清理目录树 \${normalizedFolderId} 出错:\`, error.message);
        }
        return false;
    }`;

// 找到原有清理逻辑的起始点并替换
const startPattern = /async _cleanupStagingFolders/;
const endPattern = /_validateResponse/; // 假设之后是这个函数，或者直到类结束

const lines = content.split('\n');
let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async _cleanupStagingFolders')) {
        startIndex = i;
        break;
    }
}

if (startIndex !== -1) {
    // 找到当前函数的闭合点（通过简单的寻找下一个 async 或 类的结尾）
    for (let i = startIndex + 10; i < lines.length; i++) {
        if (lines[i].includes('async _') || lines[i].trim() === '}') {
            endIndex = i;
            break;
        }
    }
}

// 因为逻辑比较复杂，我们采用简单的正则替换整个块
const updatedContent = content.replace(/async _cleanupStagingFolders[\s\S]*?async _cleanupEmptyFolderTree[\s\S]*?\n\s+\}/, newCleanupLogic);

fs.writeFileSync('src/services/organizer.js', updatedContent);
console.log('Successfully updated cleanup logic in organizer.js');
