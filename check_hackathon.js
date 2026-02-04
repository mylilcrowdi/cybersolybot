const puppeteer = require('puppeteer');
require('dotenv').config();

(async () => {
  try {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/snap/bin/chromium',
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    // Fake user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('Navigating...');
    await page.goto('https://colosseum.com/agent-hackathon/', { waitUntil: 'networkidle2' });
    
    console.log('Page Title:', await page.title());
    
    // Get full text
    const text = await page.evaluate(() => document.body.innerText);
    console.log('\n--- PAGE CONTENT ---\n');
    console.log(text.substring(0, 5000)); // Limit output
    
    // Look for "I'm an agent" specific elements
    // The user mentioned interacting with it. I'll search for buttons/links.
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button')).map(el => ({
        text: el.innerText,
        href: el.href || null
      })).filter(l => l.text.toLowerCase().includes('agent') || l.text.toLowerCase().includes('register'));
    });
    
    console.log('\n--- RELEVANT LINKS ---\n', links);

    await browser.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
