const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1920,1080'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:5174/auth/login');
  
  await page.waitForSelector('input[type="email"]');
  await page.type('input[type="email"]', 'school.bvb.1@gmail.com');
  await page.type('input[type="password"]', 'aman1234');
  await page.click('button[type="submit"]');
  
  await page.waitForNavigation();
  
  // click demo controls tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const demoBtn = btns.find(b => b.textContent.includes('Demo Controls'));
    if(demoBtn) demoBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  const result = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const deleteBtn = btns.find(b => b.textContent.includes('Delete Event'));
    if (!deleteBtn) return "Button not found";
    
    const rect = deleteBtn.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    const el = document.elementFromPoint(x, y);
    return {
      x, y,
      btnHtml: deleteBtn.outerHTML,
      topElementHtml: el ? el.outerHTML : "None",
      topElementTag: el ? el.tagName : "None",
      topElementClass: el ? el.className : "None"
    };
  });
  
  console.log("RESULT=" + JSON.stringify(result, null, 2));
  
  await browser.close();
})();
