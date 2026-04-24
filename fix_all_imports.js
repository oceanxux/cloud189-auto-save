const fs = require('fs');
const path = require('path');

const files = [
  'frontend/src/components/tabs/AccountTab.tsx',
  'frontend/src/components/tabs/OrganizerTab.tsx',
  'frontend/src/components/tabs/SubscriptionTab.tsx',
  'frontend/src/components/tabs/TaskTab.tsx',
  'frontend/src/App.tsx',
  'frontend/src/components/FloatingActions.tsx',
  'frontend/src/components/Modal.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if ((content.includes('<motion') || content.includes('<AnimatePresence')) && !content.includes("from 'motion/react'")) {
      // Find the last import line
      const lines = content.split('\n');
      let lastImportIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
          lastImportIndex = i;
        }
      }
      if (lastImportIndex !== -1) {
        lines.splice(lastImportIndex + 1, 0, "import { motion, AnimatePresence } from 'motion/react';");
        fs.writeFileSync(file, lines.join('\n'));
        console.log(`Successfully added motion imports to ${file}`);
      }
    }
  }
});
