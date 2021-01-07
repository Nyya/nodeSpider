const puppeteer = require('puppeteer');

async function launchWrapper(callbackAsync) {
  let launchOptions = { headless: true, 
    // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // because we are using puppeteer-core so we must define this option
    // slowMo: 200, 
    timeout: 0,
    devtools:false,
    args: ['--start-maximized', '--no-sandbox'] };
  const browser = await puppeteer.launch(launchOptions)
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1440, height: 722});
    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      const url = interceptedRequest.url()
      if (url.endsWith('analytics.js') || url.toLowerCase().indexOf("google")>=0 || url.endsWith('.png') || url.endsWith('.jpg')) {
        interceptedRequest.abort();
        // console.log(`intercepted ${url}`)
      } else {
        interceptedRequest.continue();
      }
    })
//     await page.evaluateOnNewDocument(`
// Object.defineProperty(navigator, "languages", {
//   get: function() {
//     return ["en-US", "en", "bn"];
//   }
// });
// Object.defineProperty(navigator, "language", {
//   get: function() {
//     return "en-US";
//   }
// });    
//     `)
    await callbackAsync(page, browser)
  } finally {
    await browser.close();
  }
}

exports.launchWrapper = launchWrapper