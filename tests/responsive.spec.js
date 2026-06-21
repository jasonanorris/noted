const { test, expect } = require('@playwright/test');

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectElementsDoNotOverlap(page, selectors) {
  const boxes = await page.evaluate((selectorList) => {
    return selectorList.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;

      const rect = element.getBoundingClientRect();
      return {
        selector,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    }).filter(Boolean);
  }, selectors);

  for (let index = 0; index < boxes.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < boxes.length; nextIndex += 1) {
      const first = boxes[index];
      const second = boxes[nextIndex];
      const overlaps = first.left < second.right
        && first.right > second.left
        && first.top < second.bottom
        && first.bottom > second.top;

      expect(overlaps, `${first.selector} overlaps ${second.selector}`).toBe(false);
    }
  }
}

async function seedSearchDocument(page, suffix) {
  await page.evaluate((documentSuffix) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('knowledge-app-db');

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' });
        }
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        const timestamp = Date.now();

        store.put({
          id: `search-note-${documentSuffix}`,
          title: `MVP Search Note ${documentSuffix}`,
          content: '**formatted note**',
          contentFormat: 'markdown',
          preview: 'formatted note',
          category: 'Projects',
          categoryName: 'Projects',
          tags: ['mvp'],
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, suffix);
}

test.describe('responsive MVP screens', () => {
  for (const viewport of viewports) {
    test(`${viewport.name} layout has stable core screens`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('http://localhost:3000');

      await expect(page.getByRole('heading', { name: 'Knowledge Storage' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectElementsDoNotOverlap(page, [
        '.home-hero',
        '[aria-labelledby="quick-actions-title"]',
        '[aria-labelledby="documents-title"]',
      ]);

      await page.getByRole('button', { name: 'New' }).click();
      await expect(page.getByRole('heading', { name: 'New Document' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByPlaceholder('Start writing...')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bold' })).toBeVisible();
      await page.getByPlaceholder('Start writing...').fill('formatted note');
      await page.getByPlaceholder('Start writing...').selectText();
      await page.getByRole('button', { name: 'Bold' }).click();
      await expect(page.getByPlaceholder('Start writing...')).toHaveValue('**formatted note**');

      await page.getByRole('button', { name: 'Back' }).click();
      await seedSearchDocument(page, viewport.name);
      await page.getByRole('button', { name: 'Search' }).click();
      await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByPlaceholder('Search title, content, tags, or category')).toBeVisible();
      await page.getByPlaceholder('Search title, content, tags, or category').fill('search');
      await page.locator('.search-filter-grid select').first().selectOption('Projects');
      await page.locator('.search-filter-grid select').nth(1).selectOption('mvp');
      await expect(page.locator('.search-highlight').first()).toContainText(/search/i);
      await expect(page.getByRole('button', { name: new RegExp(`MVP Search Note ${viewport.name}`, 'i') })).toBeVisible();

      await page.getByRole('button', { name: 'Back' }).click();
      await page.getByRole('button', { name: 'Import' }).click();
      await expect(page.getByRole('heading', { name: 'Import' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByText('Restore JSON Backup')).toBeVisible();

      await page.getByRole('button', { name: 'Back' }).click();
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
    });
  }
});
