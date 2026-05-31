const fs = require('fs');

let content = fs.readFileSync('src/views/AdminDashboard.jsx', 'utf8');

const startStr = 'function MentorOpsTab() {';
const startIndex = content.indexOf(startStr);
const endStr = '// ── TAB 9: ANOMALY SCANNER ──────────────────────────────────────────────────';
const endIndex = content.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find MentorOpsTab bounds');
  process.exit(1);
}

let mentorOpsContent = content.substring(startIndex, endIndex);

const replacePairs = [
  ['bg-white', 'glass-card'],
  ['border-gray-200', 'border-slate-700/50'],
  ['text-gray-900', 'text-white'],
  ['text-gray-800', 'text-slate-100'],
  ['text-gray-700', 'text-slate-200'],
  ['text-gray-600', 'text-slate-300'],
  ['text-gray-500', 'text-slate-400'],
  ['text-gray-400', 'text-slate-500'],
  ['text-gray-300', 'text-slate-600'],
  ['text-gray-200', 'text-slate-700'],
  ['bg-gray-50', 'bg-slate-800/40'],
  ['bg-gray-100', 'bg-slate-700/50'],
  ['border-gray-100', 'border-slate-700/30'],
  ['border-gray-300', 'border-slate-600'],
  
  // Inputs
  ['bg-slate-800/40 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300', 'bg-slate-900/50 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'],
  ['glass-card text-white rounded-lg px-3 py-2', 'bg-slate-900/50 text-white rounded-lg px-3 py-2'],
  
  // Buttons
  ['bg-indigo-600 text-white hover:bg-indigo-700', 'btn-primary'],
  ['bg-teal-600 text-white hover:bg-teal-700', 'btn-secondary'],
  ['bg-amber-500 text-white hover:bg-amber-600', 'btn-secondary text-amber-400'],
  ['bg-violet-600 text-white hover:bg-violet-700', 'btn-primary'],
  
  // Stat cards
  ['bg-${colour}-50 text-${colour}-700', 'bg-${colour}-900/30 text-${colour}-400 border border-${colour}-500/30'],
  
  // Risk badges
  ["low: 'bg-green-100 text-green-700'", "low: 'bg-green-900/30 text-green-400 border border-green-500/30'"],
  ["medium: 'bg-amber-100 text-amber-700'", "medium: 'bg-amber-900/30 text-amber-400 border border-amber-500/30'"],
  ["high: 'bg-red-100 text-red-700'", "high: 'bg-red-900/30 text-red-400 border border-red-500/30'"],
  ["critical: 'bg-red-200 text-red-800'", "critical: 'bg-red-900/50 text-red-300 border border-red-500/50 font-bold'"],
  
  // Generic badges
  ['bg-teal-50 text-teal-700', 'bg-teal-900/30 text-teal-300 border border-teal-500/30'],
  ['bg-teal-50 text-teal-600 hover:bg-teal-100 border border-teal-200', 'bg-teal-900/30 text-teal-400 hover:bg-teal-900/50 border border-teal-500/30'],
  
  // Actions
  ['text-red-600 hover:bg-red-50', 'text-red-400 hover:bg-red-900/30'],
  ['border-red-200', 'border-red-500/30'],
  ['border border-indigo-200 text-indigo-600 hover:bg-indigo-50', 'border border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/30'],
];

for (const [from, to] of replacePairs) {
  mentorOpsContent = mentorOpsContent.replaceAll(from, to);
}

content = content.substring(0, startIndex) + mentorOpsContent + content.substring(endIndex);
fs.writeFileSync('src/views/AdminDashboard.jsx', content);
console.log('Successfully updated MentorOpsTab in AdminDashboard.jsx');
