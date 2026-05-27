const fs = require('fs');
const path = require('path');

const filesToUpdate = [
  'src/views/AdminDashboard.jsx',
  'src/views/JudgePortal.jsx',
  'src/views/ParticipantPortal.jsx',
  'src/components/PipelineStepper.jsx'
];

const replacements = [
  { regex: /bg-white/g, replacement: 'glass-card' },
  { regex: /bg-gray-50/g, replacement: 'bg-slate-800/40' },
  { regex: /bg-gray-100/g, replacement: 'bg-slate-700/50' },
  { regex: /border-gray-100/g, replacement: 'border-slate-700/30' },
  { regex: /border-gray-200/g, replacement: 'border-slate-700/50' },
  { regex: /text-gray-900/g, replacement: 'text-white' },
  { regex: /text-gray-800/g, replacement: 'text-slate-100' },
  { regex: /text-gray-700/g, replacement: 'text-slate-200' },
  { regex: /text-gray-600/g, replacement: 'text-slate-300' },
  { regex: /text-gray-500/g, replacement: 'text-slate-400' },
  { regex: /text-gray-400/g, replacement: 'text-slate-500' },
  { regex: /bg-indigo-600/g, replacement: 'btn-primary' },
  { regex: /text-indigo-600/g, replacement: 'text-indigo-400' },
  { regex: /text-teal-600/g, replacement: 'text-teal-400' },
  { regex: /bg-indigo-50/g, replacement: 'bg-indigo-900/30' },
  { regex: /text-indigo-700/g, replacement: 'text-indigo-300' },
  { regex: /bg-teal-50/g, replacement: 'bg-teal-900/30' },
  { regex: /text-teal-700/g, replacement: 'text-teal-300' },
  { regex: /bg-amber-50/g, replacement: 'bg-amber-900/30' },
  { regex: /text-amber-700/g, replacement: 'text-amber-300' },
  { regex: /bg-red-50/g, replacement: 'bg-red-900/30' },
  { regex: /text-red-700/g, replacement: 'text-red-300' },
  { regex: /bg-green-100/g, replacement: 'bg-green-900/30 border border-green-500/30' },
  { regex: /text-green-700/g, replacement: 'text-green-300' },
  { regex: /bg-red-100/g, replacement: 'bg-red-900/30 border border-red-500/30' },
  { regex: /bg-amber-100/g, replacement: 'bg-amber-900/30 border border-amber-500/30' },
  { regex: /bg-indigo-100/g, replacement: 'bg-indigo-900/30 border border-indigo-500/30' },
];

for (const file of filesToUpdate) {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Apply standard replacements
    for (const { regex, replacement } of replacements) {
      content = content.replace(regex, replacement);
    }
    
    // Enhance main headers and section titles with a vibrant text gradient
    content = content.replace(/className="text-lg font-bold text-white"/g, 'className="text-2xl font-extrabold text-gradient"');
    content = content.replace(/<h2 className="text-base font-semibold text-white mb-4">/g, '<h2 className="text-lg font-bold text-gradient mb-4">');

    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Successfully updated ${file} with futuristic dark mode theme.`);
  } else {
    console.log(`⚠️ Skipped ${file} - File not found.`);
  }
}

console.log('🎉 Futuristic dark mode application complete!');
