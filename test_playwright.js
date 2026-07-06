const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
  });
  
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('[BROWSER LOG]', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('[BROWSER EXCEPTION]', err.stack));

  console.log('Navigating to http://127.0.0.1:8085 ...');
  try {
    await page.goto('http://127.0.0.1:8085', { waitUntil: 'networkidle', timeout: 8000 });
  } catch (e) {
    console.error('Initial navigation timed out, retrying...');
    await page.goto('http://127.0.0.1:8085', { waitUntil: 'load', timeout: 10000 });
  }

  console.log('Lobby screen loaded. Clicking start button...');
  await page.click('.btn-start');

  console.log('Waiting for 3D Canvas initialization...');
  await page.waitForTimeout(3000);

  console.log('Simulating WASD movement directly (8-way controls)...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyA');

  console.log('Taking screenshot and saving...');
  const screenshotPath = path.join(__dirname, 'screenshot.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  // グローバルなアーティファクト保存先にもコピー
  const globalScreenshotPath = '/Users/user/.gemini/antigravity-cli/brain/ddf032ee-c073-49b0-9ddb-9994f11af016/screenshot.png';
  try {
    const fs = require('fs');
    fs.copyFileSync(screenshotPath, globalScreenshotPath);
    console.log('Global screenshot updated for UI preview.');
  } catch (e) {
    console.error('Failed to copy to global screenshot path:', e.message);
  }

  console.log('Test complete. Closing browser.');
  await browser.close();
})();
