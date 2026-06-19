import fs from 'fs';
import path from 'path';

const authFiles = [
  'AuthAcceptInvitation.jsx',
  'AuthForgotPassword.jsx',
  'AuthLogin.jsx',
  'AuthRegister.jsx',
  'AuthResetPassword.jsx',
  'AuthResetPasswordConfirm.jsx',
  'AuthVerifyEmail.jsx'
];

const dir = 'src/views';

authFiles.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace button gradient classes with solid amber classes
  content = content.replace(/bg-gradient-to-r from-teal-600 to-teal-600 hover:from-teal-500 hover:to-teal-500/g, 'bg-amber-600 hover:bg-amber-500');
  
  // Replace disabled button states
  content = content.replace(/disabled:bg-teal-100 dark:disabled:bg-teal-900\/50 disabled:text-teal-400 dark:disabled:text-teal-600/g, 'disabled:bg-amber-100 dark:disabled:bg-amber-900/50 disabled:text-amber-400 dark:disabled:text-amber-600');
  
  // Replace button shadow colors
  content = content.replace(/shadow-teal-500\/25/g, 'shadow-amber-500/25');
  content = content.replace(/border-teal-400\/20/g, 'border-amber-400/20');

  // Replace text gradients for headings
  content = content.replace(/text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-sky-600/g, 'text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-500');
  
  // Replace links
  content = content.replace(/text-teal-600 hover:text-teal-500/g, 'text-amber-600 hover:text-amber-500');

  // Replace input focus rings and borders
  content = content.replace(/focus:ring-teal-500/g, 'focus:ring-amber-500');
  content = content.replace(/focus:border-teal-500/g, 'focus:border-amber-500');
  
  // Replace any remaining teal text or borders
  content = content.replace(/text-teal-600/g, 'text-amber-600');
  content = content.replace(/text-teal-500/g, 'text-amber-500');
  content = content.replace(/border-teal-500/g, 'border-amber-500');
  content = content.replace(/bg-teal-50/g, 'bg-amber-50');
  content = content.replace(/bg-teal-100/g, 'bg-amber-100');

  fs.writeFileSync(filePath, content);
  console.log(`Updated ${file}`);
});
