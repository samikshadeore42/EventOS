import fs from 'fs';

const file = 'src/views/AdminDashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div key={([^}]+)} className="glass-card ([^"]+)">/g;

content = content.replace(regex, (match, key, classes) => {
  if (classes.includes('relative overflow-hidden group')) {
    return match; // Already glowing
  }
  
  const modifiedClasses = classes 
    + ' border-t-4 border-t-teal-500 relative overflow-hidden group transition-all hover:-translate-y-1 hover:scale-[1.01]';
  
  return `<div key={${key}} className="glass-card ${modifiedClasses}">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none z-0" />`;
});

const regex2 = /<div className="glass-card ([^"]+)">/g;
content = content.replace(regex2, (match, classes) => {
  if (classes.includes('relative overflow-hidden group')) {
    return match; // Already glowing
  }
  
  const modifiedClasses = classes 
    + ' border-t-4 border-t-teal-500 relative overflow-hidden group transition-all hover:-translate-y-1 hover:scale-[1.01]';
  
  return `<div className="glass-card ${modifiedClasses}">
      <div className="absolute -right-8 -top-8 w-40 h-40 bg-gradient-to-br from-teal-500/20 to-transparent rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700 pointer-events-none z-0" />`;
});


fs.writeFileSync(file, content);
console.log('Done replacing in AdminDashboard.jsx');
