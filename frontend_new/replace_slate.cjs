const fs = require('fs');
const path = require('path');

const CLASS_MAPPINGS = {
  'bg-white': 'bg-background',
  'bg-slate-50': 'bg-surface',
  'bg-slate-100': 'bg-surface',
  'text-slate-900': 'text-foreground',
  'text-slate-800': 'text-foreground',
  'text-slate-700': 'text-foreground',
  'text-slate-600': 'text-muted',
  'text-slate-500': 'text-muted',
  'text-slate-400': 'text-muted',
  'border-slate-100': 'border-border',
  'border-slate-200': 'border-border',
  'border-slate-300': 'border-border',
  'divide-slate-200': 'divide-border',
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

  // Replace Tailwind classes using regex word boundaries to avoid partial matches
  for (const [oldClass, newClass] of Object.entries(CLASS_MAPPINGS)) {
    const regex = new RegExp(`\\b${oldClass}\\b`, 'g');
    content = content.replace(regex, newClass);
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + filePath);
  }
});
