import fs from 'fs';

const file = 'src/views/AdminDashboard.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add 'white' to Badge
content = content.replace(
  "slate: 'bg-surface border border-border text-foreground',\n  }[colour]",
  "slate: 'bg-surface border border-border text-foreground',\n    white: 'bg-white/20 border border-white/40 text-white shadow-sm drop-shadow-md',\n  }[colour]"
);
// Handle CRLF just in case
content = content.replace(
  "slate: 'bg-surface border border-border text-foreground',\r\n  }[colour]",
  "slate: 'bg-surface border border-border text-foreground',\r\n    white: 'bg-white/20 border border-white/40 text-white shadow-sm drop-shadow-md',\r\n  }[colour]"
);

// 2. Fix the banner gradient and image, and Registration Open badge
// Old code:
//           <div className="absolute inset-0 bg-gradient-to-r from-teal-950 via-teal-700 to-teal-500 opacity-80 mix-blend-multiply group-hover:opacity-100 transition-opacity duration-700"></div>
//           <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-40"></div>

content = content.replace(
  /bg-gradient-to-r from-teal-950 via-teal-700 to-teal-500 opacity-80 mix-blend-multiply group-hover:opacity-100/g,
  "bg-gradient-to-r from-amber-950 via-amber-700 to-amber-500 opacity-80 mix-blend-multiply group-hover:opacity-100"
);

content = content.replace(
  /bg-\[url\('https:\/\/images\.unsplash\.com\/photo-1540575467063-178a50c2df87\?auto=format&fit=crop&q=80'\)\] bg-cover bg-center mix-blend-overlay opacity-40/g,
  "bg-[url('https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&q=80')] bg-cover bg-center mix-blend-overlay opacity-50"
);

content = content.replace(
  /<Badge colour="slate">Registration Open<\/Badge>/g,
  '<Badge colour="white">Registration Open</Badge>'
);

fs.writeFileSync(file, content);
console.log('Fixed AdminDashboard.jsx banner and badge');
