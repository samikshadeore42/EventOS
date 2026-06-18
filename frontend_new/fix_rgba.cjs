const fs = require('fs');
const path = require('path');

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

  content = content.replace(/rgba\(20, 184, 166,/g, 'rgba(20,184,166,');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed space in rgba: ' + filePath);
  }
});
