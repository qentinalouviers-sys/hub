const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/snap/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://127.0.0.1:4000/', { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await page.click('#edit-btn');
  await page.waitForTimeout(300);

  const src = await page.locator('#grid .app[data-app-id="blockblast"]').boundingBox();
  const folderBox = await page.locator('#grid .app[data-folder]').first().boundingBox();
  console.log('SRC:', JSON.stringify(src));
  console.log('FOLDER_BOX:', JSON.stringify(folderBox));

  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(folderBox.x + folderBox.width / 2, folderBox.y + folderBox.height / 2, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(500);

  // inspecte l'état interne
  const s = await page.evaluate(() => ({
    appFolder: state.appFolder,
    order: state.order,
    dock: state.dock,
  }));
  console.log('APPFOLDER:', JSON.stringify(s.appFolder));
  console.log('ORDER:', JSON.stringify(s.order));

  console.log('ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
  await browser.close();
})();
