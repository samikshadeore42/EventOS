const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'src/index.css');
const newCss = `@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');
@import "tailwindcss";

@layer base {
  html {
    font-family: 'Outfit', system-ui, -apple-system, sans-serif;
    background-color: #050505;
    color: #e2e8f0;
  }
  
  body {
    background-color: #050505;
    background-image: 
      radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
      radial-gradient(at 100% 0%, rgba(168, 85, 247, 0.15) 0px, transparent 50%),
      radial-gradient(at 100% 100%, rgba(14, 165, 233, 0.15) 0px, transparent 50%),
      radial-gradient(at 0% 100%, rgba(236, 72, 153, 0.15) 0px, transparent 50%);
    background-attachment: fixed;
    min-height: 100vh;
    color: #f8fafc;
  }
}

@layer utilities {
  .glass-panel {
    @apply bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)];
  }
  
  .glass-card {
    @apply bg-black/30 backdrop-blur-xl border border-white/5 hover:bg-black/50 hover:border-white/20 hover:shadow-[0_0_20px_rgba(99,102,241,0.25)] transition-all duration-300;
  }

  .glow-text {
    @apply text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.4)];
  }

  .glow-border {
    @apply relative;
  }
  
  .glow-border::before {
    content: "";
    @apply absolute inset-0 -z-10 p-[1px] rounded-[inherit] bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50 opacity-0 transition-opacity duration-300;
  }

  .glow-border:hover::before {
    @apply opacity-100;
  }
  
  input[type='range'] {
    -webkit-appearance: none;
    appearance: none;
    height: 0.375rem;
    border-radius: 9999px;
    background: rgba(255,255,255,0.1);
    cursor: pointer;
    outline: none;
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    background: #000;
    border: 2px solid #a855f7;
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.6);
    transition: all 0.2s;
    cursor: pointer;
  }

  input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.15);
    box-shadow: 0 0 20px rgba(168, 85, 247, 0.9);
    background: #a855f7;
  }
}
`;
fs.writeFileSync(cssPath, newCss, 'utf-8');
console.log('Updated index.css');

const replaceRules = [
  // Layout and Backgrounds
  [/bg-white/g, 'glass-panel'],
  [/min-h-screen bg-gray-50/g, 'min-h-screen text-gray-100'],
  [/bg-gray-50/g, 'bg-white/5'],
  [/bg-gray-100/g, 'bg-white/10'],
  
  // Borders
  [/border-gray-200/g, 'border-white/10'],
  [/border-gray-100/g, 'border-white/5'],
  [/border-gray-50/g, 'border-white/5'],
  
  // Text Colors
  [/text-gray-900/g, 'text-white'],
  [/text-gray-800/g, 'text-gray-200'],
  [/text-gray-700/g, 'text-gray-300'],
  [/text-gray-600/g, 'text-gray-400'],
  [/text-gray-500/g, 'text-gray-400'],
  [/text-gray-400/g, 'text-gray-500'],
  [/text-gray-300/g, 'text-gray-600'],
  
  // Hover states
  [/hover:bg-gray-50/g, 'hover:bg-white/10 hover:shadow-lg hover:shadow-indigo-500/10'],
  [/hover:bg-gray-100/g, 'hover:bg-white/20'],
  
  // Indigo (Primary) Theme
  [/bg-indigo-50/g, 'bg-indigo-500/10 border border-indigo-500/20'],
  [/text-indigo-700/g, 'text-indigo-300'],
  [/text-indigo-600/g, 'text-indigo-400'],
  [/text-indigo-800/g, 'text-indigo-200'],
  [/border-indigo-100/g, 'border-indigo-500/20'],
  [/border-indigo-200/g, 'border-indigo-500/30'],
  [/bg-indigo-600/g, 'bg-indigo-600 shadow-[0_0_15px_rgba(79,70,229,0.4)] hover:shadow-[0_0_25px_rgba(79,70,229,0.6)]'],
  
  // Teal (Success/Secondary) Theme
  [/bg-teal-50/g, 'bg-teal-500/10 border border-teal-500/20'],
  [/text-teal-700/g, 'text-teal-300'],
  [/text-teal-600/g, 'text-teal-400'],
  [/bg-teal-600/g, 'bg-teal-600 shadow-[0_0_15px_rgba(13,148,136,0.4)] hover:shadow-[0_0_25px_rgba(13,148,136,0.6)]'],
  [/bg-teal-500/g, 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.5)]'],
  
  // Amber (Warning) Theme
  [/bg-amber-50/g, 'bg-amber-500/10 border border-amber-500/20'],
  [/text-amber-700/g, 'text-amber-300'],
  [/text-amber-600/g, 'text-amber-400'],
  
  // Red (Danger) Theme
  [/bg-red-50/g, 'bg-red-500/10 border border-red-500/20'],
  [/border-red-200/g, 'border-red-500/20'],
  [/text-red-700/g, 'text-red-300'],
  [/text-red-600/g, 'text-red-400'],
  [/bg-red-500/g, 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'],
  
  // Green Theme
  [/bg-green-100/g, 'bg-emerald-500/10 border border-emerald-500/20'],
  [/text-green-700/g, 'text-emerald-300'],
  
  // Specific Overrides for futuristic feel
  [/EventOS/g, 'EventOS <span className="glow-text font-black tracking-tight">NEXUS</span>'],
  [/rounded-xl/g, 'rounded-2xl'],
  [/AI Rationale/g, 'AI Analysis Engine'],
];

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      for (const [regex, replacement] of replaceRules) {
        content = content.replace(regex, replacement);
      }
      
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log('Processed', fullPath);
    }
  }
}

processDir(path.join(__dirname, 'src/views'));
processDir(path.join(__dirname, 'src/components'));

console.log('Futuristic theme applied!');
