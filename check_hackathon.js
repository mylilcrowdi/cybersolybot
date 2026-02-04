const puppeteer = require('puppeteer');
require('dotenv').config();

const searchDuckDuckGo = async (query) => {
    const browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/snap/bin/chromium',
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`Searching for: ${query}`);
    await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`, { waitUntil: 'networkidle2' });
    
    // Get first few results
    const results = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]'));
        return links.slice(0, 3).map(a => ({ title: a.innerText, href: a.href }));
    });
    
    await browser.close();
    return results;
};

(async () => {
    try {
        const queries = [
            "SIDEX Solana AI Agent twitter",
            "Clodds Solana AI Agent twitter",
            "SuperRouter Solana AI Agent twitter",
            "Solana AI Hackathon winning posts"
        ];

        const allResults = {};

        for (const q of queries) {
            allResults[q] = await searchDuckDuckGo(q);
            // polite delay
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log('--- SEARCH RESULTS ---');
        console.log(JSON.stringify(allResults, null, 2));

    } catch (error) {
        console.error('Error:', error);
    }
})();
