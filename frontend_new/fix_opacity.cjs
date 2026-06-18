const fs = require('fs');
const path = require('path');

const OPACITY_FIXES = {
  'bg-background/90': 'bg-white/90 dark:bg-slate-900/90',
  'bg-background/80': 'bg-white/80 dark:bg-slate-900/80',
  'bg-background/40': 'bg-white/40 dark:bg-slate-900/40',
  'bg-background/30': 'bg-white/30 dark:bg-slate-900/30',
  'bg-background/10': 'bg-white/10 dark:bg-slate-900/10',
  'bg-surface/80': 'bg-slate-50/80 dark:bg-slate-800/80',
  'bg-surface/50': 'bg-slate-50/50 dark:bg-slate-800/50',
  'border-border/50': 'border-slate-200/50 dark:border-slate-700/50',
};

function walkSync(currentDirPath, callback) {
  fs.readdirSync(currentDirPath).forEach((name) => {
    const filePath = path.join(currentDirPath, name);
    const stat = fs.statSync(filePath);
    if (stat.isFile()) {
      callback(filePath, stat);
    } else if (stat.isDirectory()) {
      walkSync(filePath, callback);
    }
  });
}

walkSync(path.join(__dirname, 'src'), (filePath) => {
  if (!filePath.endsWith('.jsx') && !filePath.endsWith('.js') && !filePath.endsWith('.css')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  for (const [oldClass, newClass] of Object.entries(OPACITY_FIXES)) {
    content = content.split(oldClass).join(newClass);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed opacity in: ' + filePath);
  }
});
