const fs = require('fs');
const path = require('path');

const config = {
    'src/services/task.js': 'transfer',
    'src/services/organizer.js': 'organizer',
    'src/services/ai.js': 'ai',
    'src/services/tmdb.js': 'tmdb',
    'src/services/strm.js': 'strm'
};

function upgradeFile(filePath, moduleName) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const newLines = [];
    
    let inCatchBlock = false;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Simple heuristic for catch blocks
        if (line.includes('catch') && line.includes('{')) {
            inCatchBlock = true;
            braceCount = 0;
        }
        
        if (inCatchBlock) {
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            if (braceCount <= 0 && line.includes('}')) {
                // We might have exited the catch block
                // This is a simple heuristic and might not be perfect for nested blocks
                // but usually logTaskEvent is right at the start of catch
            }
        }

        if (line.includes('logTaskEvent(') && !line.includes('require')) {
            // Determine level
            let level = 'info';
            if (inCatchBlock || line.toLowerCase().includes('error') || line.toLowerCase().includes('失败')) {
                level = 'error';
            } else if (line.toLowerCase().includes('warn') || line.toLowerCase().includes('警告') || line.toLowerCase().includes('跳过') || line.toLowerCase().includes('不存在') || line.toLowerCase().includes('无效')) {
                level = 'warn';
            }
            
            // Special cases based on content
            if (line.includes('成功') || line.includes('完成') || line.includes('开始')) {
                level = 'info';
            }

            // Replace logTaskEvent(msg) with logTaskEvent(msg, 'level', 'module')
            // Handling the closing parenthesis of logTaskEvent
            // This regex tries to find the match and append parameters before the closing paren
            line = line.replace(/logTaskEvent\((.*)\)/, (match, p1) => {
                // If it already has 3 arguments, skip
                const args = p1.split(',');
                if (args.length >= 3) return match;
                
                return `logTaskEvent(${p1.trim()}, '${level}', '${moduleName}')`;
            });
        }
        
        if (inCatchBlock && braceCount <= 0) {
            inCatchBlock = false;
        }

        newLines.push(line);
    }

    fs.writeFileSync(filePath, newLines.join('\n'));
    console.log(`Upgraded ${filePath}`);
}

for (const [file, moduleName] of Object.entries(config)) {
    if (fs.existsSync(file)) {
        upgradeFile(file, moduleName);
    } else {
        console.warn(`File not found: ${file}`);
    }
}
