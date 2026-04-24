const fs = require('fs');
const path = require('fs');
const content = require('fs').readFileSync('src/index.js', 'utf8');

const lines = content.split('\n');
let startLine = -1;
let endLine = -1;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("if (parsedAction?.mode === 'action' && parsedAction?.action) {") && i > 2800) {
        startLine = i;
        break;
    }
}

if (startLine !== -1) {
    let openBraces = 0;
    for (let i = startLine; i < lines.length; i++) {
        openBraces += (lines[i].match(/\{/g) || []).length;
        openBraces -= (lines[i].match(/\}/g) || []).length;
        if (openBraces === 0) {
            endLine = i;
            break;
        }
    }
}

if (startLine !== -1 && endLine !== -1) {
    const newBlock = `            if (parsedAction?.mode === 'action' && parsedAction?.action) {
                // 强制关闭任何确认逻辑，直接进入执行环节
                parsedAction.needsConfirmation = false;
                const reply = await executeChatAction(parsedAction.action, parsedAction.target || {});
                res.json({
                    success: true,
                    data: { reply }
                });
                return;
            }`;
    lines.splice(startLine, endLine - startLine + 1, newBlock);
    require('fs').writeFileSync('src/index.js', lines.join('\n'));
    console.log('Successfully patched src/index.js to disable confirmations.');
} else {
    console.log('Failed to find the action block.');
}
