const fs = require('fs');
const path = require('path');

const TEAL_COLORS = {
  '#ef4444': '#14B8A6',
  '#dc2626': '#0F766E',
  '#b91c1c': '#115E59',
  '#f87171': '#2DD4BF',
  '#fca5a5': '#5EEAD4',
  '#fecaca': '#99F6E4',
  '#991b1b': '#134E4A',
  '#7f1d1d': '#042F2E',
  '#E11D48': '#14B8A6',
  '#BE123C': '#0F766E',
  'rgba(239,68,68,': 'rgba(20, 184, 166,',
  'rgba(239, 68, 68,': 'rgba(20, 184, 166,',
  'rgba(225,29,72,': 'rgba(20, 184, 166,',
  'rgba(249,115,22,': 'rgba(20, 184, 166,',
  '#f97316': '#14B8A6',
  '#ea580c': '#0F766E',
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

  // Replace Tailwind classes for red and rose
  content = content.replace(/\bred-(\d{2,3}(?:\/(?:\d+|\[.*?\]))?)\b/g, 'teal-$1');
  content = content.replace(/\brose-(\d{2,3}(?:\/(?:\d+|\[.*?\]))?)\b/g, 'teal-$1');
  content = content.replace(/\borange-(\d{2,3}(?:\/(?:\d+|\[.*?\]))?)\b/g, 'teal-$1');

  // Replace active card gradient string if hardcoded
  content = content.replace(/linear-gradient\(.*?#ef4444.*?\)/gi, 'linear-gradient(135deg, #14B8A6, #0F766E)');
  
  // Replace exact hex colors
  for (const [redHex, tealHex] of Object.entries(TEAL_COLORS)) {
    content = content.split(redHex).join(tealHex);
    content = content.split(redHex.toLowerCase()).join(tealHex);
    content = content.split(redHex.toUpperCase()).join(tealHex);
  }

  // Check for the string 'color="red"' or colour="red"
  content = content.replace(/colour=["']red["']/g, 'colour="teal"');
  content = content.replace(/color=["']red["']/g, 'color="teal"');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated: ' + filePath);
  }
});
