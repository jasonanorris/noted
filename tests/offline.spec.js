const { test, expect } = require('@playwright/test');

const stores = ['documents', 'categories', 'tags', 'settings'];

async function seedOfflineData(page) {
  await page.evaluate((storeNames) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('knowledge-app-db');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(storeNames, 'readwrite');
        const timestamp = Date.now();
        const document = {
          id: 'offline-note',
          title: 'Offline Field Note',
          content: '## Offline Heading\nThis note survives offline.',
          contentFormat: 'markdown',
          preview: 'Offline Heading This note survives offline.',
          category: 'Field Work',
          categoryName: 'Field Work',
          tags: ['offline'],
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        storeNames.forEach((storeName) => transaction.objectStore(storeName).clear());
        transaction.objectStore('documents').put(document);
        transaction.objectStore('categories').put({
          id: 'field-work',
          name: 'Field Work',
          count: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        transaction.objectStore('tags').put({
          id: 'offline',
          name: 'offline',
          count: 1,
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
  }, stores);
}

async function waitForServiceWorker(page) {
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service worker is not available.');
    }

    await navigator.serviceWorker.ready;
  });
}

test.describe('offline PWA behavior', () => {
  test.afterEach(async ({ context }) => {
    await context.setOffline(false);
  });

  test('loads cached app shell and local documents while offline', async ({ page, context }) => {
    await page.goto('http://localhost:3000/noted/');
    await expect(page.getByRole('heading', { name: 'Knowledge Storage' })).toBeVisible();
    await seedOfflineData(page);
    await waitForServiceWorker(page);

    await page.reload();
    await expect(page.getByRole('button', { name: /Offline Field Note/ })).toBeVisible();

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Knowledge Storage' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Offline Field Note/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Field Work, 1 documents' })).toBeVisible();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search documents' }).fill('offline');
    await expect(page.getByRole('button', { name: /Offline Field Note/ })).toBeVisible();

    await page.getByRole('button', { name: /Offline Field Note/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Document' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Offline Field Note');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByRole('heading', { name: 'Offline Heading' })).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('1 documents, 6 categories, 1 tags')).toBeVisible();
  });
});
