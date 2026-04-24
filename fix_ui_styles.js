const fs = require('fs');
const path = require('path');

const COMPONENT_DIR = path.join(__dirname, 'frontend/src/components/tabs');

const replacements = [
  // Panels/Cards
  { from: /className="bg-white rounded-3xl border p-4 shadow-sm hover:shadow-md transition-all/g, to: 'className="workbench-panel workbench-panel-hover p-5' },
  { from: /className="bg-white rounded-2xl border p-4 shadow-sm/g, to: 'className="workbench-panel p-5' },
  { from: /className="workbench-panel rounded-3xl/g, to: 'className="workbench-panel' },
  
  // Hero sections
  { from: /className="bg-white rounded-3xl border p-6 mb-6 shadow-sm/g, to: 'className="workbench-hero mb-8' },
  { from: /className="workbench-hero/g, to: 'className="workbench-hero' },

  // Buttons
  { from: /className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700/g, to: 'className="workbench-primary-button' },
  { from: /className="px-6 py-2\.5 rounded-full text-sm font-medium bg-\[#0b57d0\] text-white hover:bg-\[#0b57d0\]\/90/g, to: 'className="workbench-primary-button px-8' },
  { from: /className="px-4 py-2 border border-slate-300 rounded-xl hover:bg-slate-50/g, to: 'className="workbench-toolbar-button' },
  
  // Inputs
  { from: /className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500\/20 outline-none/g, to: 'className="workbench-input' },
  { from: /className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500\/20 outline-none/g, to: 'className="workbench-input' },

  // Selects
  { from: /className="px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500\/20 outline-none/g, to: 'className="workbench-select' }
];

function processFiles(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      processFiles(filePath);
    } else if (file.endsWith('.tsx')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;
      
      replacements.forEach(r => {
        content = content.replace(r.from, r.to);
      });

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated: ${file}`);
      }
    }
  });
}

console.log('Starting UI style normalization...');
processFiles(COMPONENT_DIR);
console.log('Done.');
