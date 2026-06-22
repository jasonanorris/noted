const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect } = require('@playwright/test');

const stores = ['documents', 'categories', 'tags', 'settings'];

async function openApp(page) {
  await page.goto('http://localhost:3000');
  await expect(page.getByRole('heading', { name: 'Knowledge Storage' })).toBeVisible();
}

async function clearDatabase(page) {
  await page.evaluate((storeNames) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('knowledge-app-db');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(storeNames, 'readwrite');

        storeNames.forEach((storeName) => transaction.objectStore(storeName).clear());

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

async function seedData(page, data) {
  await page.evaluate(({ storeNames, backup }) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('knowledge-app-db');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(storeNames, 'readwrite');

        storeNames.forEach((storeName) => {
          const store = transaction.objectStore(storeName);
          store.clear();
          (backup[storeName] || []).forEach((record) => store.put(record));
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
  }, { storeNames: stores, backup: data });
}

async function readStore(page, storeName) {
  return page.evaluate((name) => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('knowledge-app-db');

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction([name], 'readonly');
        const storeRequest = transaction.objectStore(name).getAll();

        storeRequest.onsuccess = () => {
          db.close();
          resolve(storeRequest.result);
        };
        storeRequest.onerror = () => {
          db.close();
          reject(storeRequest.error);
        };
      };
    });
  }, storeName);
}

function createDocument(overrides = {}) {
  const timestamp = overrides.updatedAt || Date.now();

  return {
    id: overrides.id || `doc-${timestamp}`,
    title: overrides.title || 'Workflow Note',
    content: overrides.content || 'Workflow content',
    contentFormat: 'markdown',
    preview: overrides.preview || overrides.content || 'Workflow content',
    category: overrides.category || 'Projects',
    categoryName: overrides.categoryName || overrides.category || 'Projects',
    tags: overrides.tags || ['workflow'],
    createdAt: overrides.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

async function mockStorageEstimate(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        estimate: async () => ({
          usage: 1572864,
          quota: 104857600,
        }),
      },
    });
  });
}

test.describe('main workflow regressions', () => {
  test('creates, edits, opens, and deletes a document', async ({ page }) => {
    await openApp(page);
    await clearDatabase(page);
    await page.reload();

    await page.getByRole('button', { name: 'Create new document' }).click();
    await page.getByLabel('Title').fill('Workflow Draft');
    await page.getByLabel('Category').fill('Projects');
    await page.getByLabel('Tags').fill('workflow, draft');
    await page.getByLabel('Content').fill('shortcut body');
    await page.getByLabel('Content').focus();
    await page.getByLabel('Content').selectText();
    await page.keyboard.press('Control+B');
    await expect(page.getByLabel('Content')).toHaveValue('**shortcut body**');
    await page.keyboard.press('Control+Z');
    await expect(page.getByLabel('Content')).toHaveValue('shortcut body');
    await page.keyboard.press('Control+Y');
    await expect(page.getByLabel('Content')).toHaveValue('**shortcut body**');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByLabel('Content')).toHaveValue('shortcut body');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(page.getByLabel('Content')).toHaveValue('**shortcut body**');
    await page.getByLabel('Content').fill('## Workflow Heading\nFirst **workflow** body\n- saved item');
    await page.keyboard.press('Control+Shift+P');
    await expect(page.getByRole('heading', { name: 'Workflow Heading' })).toBeVisible();
    await expect(page.getByLabel('Document preview')).toContainText('First workflow body');
    await expect(page.getByText('saved item')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Content')).toBeVisible();
    await page.keyboard.press('Control+S');

    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect.poll(async () => (await readStore(page, 'categories')).map((category) => category.name)).toContain('Projects');
    await expect.poll(async () => (await readStore(page, 'tags')).map((tag) => tag.name)).toEqual(expect.arrayContaining(['draft', 'workflow']));
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: /Workflow Draft/ })).toBeVisible();

    await page.getByRole('button', { name: /Workflow Draft/ }).click();
    await page.getByLabel('Title').fill('Workflow Draft Edited');
    await page.getByLabel('Content').fill('Edited workflow body');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Back' }).click();

    await expect(page.getByRole('button', { name: /Workflow Draft Edited/ })).toBeVisible();
    await page.getByRole('button', { name: /Workflow Draft Edited/ }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('heading', { name: 'Knowledge Storage' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Workflow Draft Edited/ })).toHaveCount(0);
  });

  test('loads recent documents from home and opens a selected card', async ({ page }) => {
    await openApp(page);
    await seedData(page, {
      documents: [
        createDocument({ id: 'older', title: 'Older Home Note', updatedAt: 1000 }),
        createDocument({ id: 'newer', title: 'Newer Home Note', updatedAt: 2000 }),
      ],
      categories: [{ id: 'projects', name: 'Projects', count: 2, createdAt: 1000, updatedAt: 2000 }],
      tags: [{ id: 'workflow', name: 'workflow', count: 2, createdAt: 1000, updatedAt: 2000 }],
      settings: [],
    });
    await page.reload();

    await expect(page.getByRole('button', { name: /Newer Home Note/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Older Home Note/ })).toBeVisible();

    const firstCardTitle = await page.locator('.document-card-title').first().textContent();
    expect(firstCardTitle).toBe('Newer Home Note');
    await expect(page.getByRole('button', { name: 'Projects, 2 documents' })).toBeVisible();

    await page.getByRole('button', { name: /Older Home Note/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Document' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Older Home Note');
  });

  test('filters search results and opens a matching document', async ({ page }) => {
    await openApp(page);
    await seedData(page, {
      documents: [
        createDocument({
          id: 'search-match',
          title: 'Searchable Workflow Note',
          content: 'The query target lives here.',
          category: 'Projects',
          categoryName: 'Projects',
          tags: ['mvp'],
        }),
        createDocument({
          id: 'search-miss',
          title: 'Archived Reference',
          content: 'Different content',
          category: 'Archive',
          categoryName: 'Archive',
          tags: ['reference'],
        }),
      ],
      categories: [],
      tags: [],
      settings: [],
    });
    await page.reload();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search documents' }).fill('workflow');
    await page.locator('.search-filter-grid select').first().selectOption('Projects');
    await page.locator('.search-filter-grid select').nth(1).selectOption('mvp');

    await expect(page.getByRole('button', { name: /Searchable Workflow Note/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Archived Reference/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Searchable Workflow Note/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit Document' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Searchable Workflow Note');
  });

  test('exports a backup and clears local data from settings', async ({ page }) => {
    await mockStorageEstimate(page);
    await openApp(page);
    await seedData(page, {
      documents: [createDocument({ id: 'exported', title: 'Exported Note' })],
      categories: [],
      tags: [],
      settings: [],
    });
    await page.reload();

    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('heading', { name: 'Storage Usage' })).toBeVisible();
    await expect(page.getByText('1.5 MB used')).toBeVisible();
    await expect(page.getByText('100 MB available to this browser profile')).toBeVisible();
    await expect(page.getByText('Back Up Local Notes')).toBeVisible();
    await expect(page.getByText('Notes are stored in this browser on this device.')).toBeVisible();
    await expect(page.getByText('Last Exported Never')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));

    expect(backup.documents).toHaveLength(1);
    expect(backup.documents[0].title).toBe('Exported Note');
    await expect(page.getByText('Backup downloaded.')).toBeVisible();
    await expect(page.getByText(/^Last Exported (?!Never)/)).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Clear Local Data' }).click();
    await expect(page.getByText('Local data cleared.')).toBeVisible();
    expect(await readStore(page, 'documents')).toHaveLength(0);
    await expect.poll(async () => (await readStore(page, 'categories')).map((category) => category.name).sort()).toEqual([
      'Media',
      'People',
      'Places',
      'Projects',
      'Things',
    ]);
  });

  test('explains when browser storage estimates are unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: undefined,
      });
    });

    await openApp(page);
    await clearDatabase(page);
    await page.reload();

    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByRole('heading', { name: 'Storage Usage' })).toBeVisible();
    await expect(page.getByText('Storage estimates are not available in this browser.')).toBeVisible();
  });

  test('keeps storage usage visible after refreshing the settings route', async ({ page }) => {
    await mockStorageEstimate(page);
    await page.goto('http://localhost:3000/#settings');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Storage Usage' })).toBeVisible();
    await expect(page.getByText('1.5 MB used')).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Storage Usage' })).toBeVisible();
    await expect(page.getByText('1.5 MB used')).toBeVisible();
  });

  test('renames categories and deletes tags from settings', async ({ page }) => {
    await openApp(page);
    await clearDatabase(page);
    await page.reload();

    await page.getByRole('button', { name: 'Create new document' }).click();
    await page.getByLabel('Title').fill('Managed Taxonomy Note');
    await page.getByLabel('Category').fill('Projects');
    await page.getByLabel('Tags').fill('workflow, managed');
    await page.getByLabel('Content').fill('Managed taxonomy body');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();

    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByText('1 documents, 5 categories, 2 tags')).toBeVisible();
    await expect(page.locator('.management-list').first()).toContainText('People');
    await expect(page.locator('.management-list').first()).toContainText('Places');
    await expect(page.locator('.management-list').first()).toContainText('Things');
    await expect(page.locator('.management-list').first()).toContainText('Projects');
    await expect(page.locator('.management-list').first()).toContainText('Media');

    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByLabel('Category name')).toBeVisible();
    await page.getByLabel('Category name').fill('Ideas');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Category added.')).toBeVisible();
    await expect(page.getByText('1 documents, 6 categories, 2 tags')).toBeVisible();
    await expect(page.locator('.management-list').first()).toContainText('Ideas');

    const projectRow = page.locator('.management-row').filter({ hasText: 'Projects' });
    page.once('dialog', (dialog) => dialog.accept('Renamed Projects'));
    await projectRow.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByText('Category renamed.')).toBeVisible();
    await expect(page.getByText('Renamed Projects')).toBeVisible();

    const managedTagRow = page.locator('.management-row').filter({ hasText: 'managed' });
    page.once('dialog', (dialog) => dialog.accept());
    await managedTagRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Tag deleted.')).toBeVisible();
    await expect(page.getByText('managed')).toHaveCount(0);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: 'Renamed Projects, 1 documents' })).toBeVisible();
    await page.getByRole('button', { name: /Managed Taxonomy Note/ }).click();
    await expect(page.getByLabel('Category')).toHaveValue('Renamed Projects');
    await expect(page.getByLabel('Tags')).toHaveValue('workflow');
  });

  test('imports a JSON backup and restores documents', async ({ page }) => {
    await openApp(page);
    await clearDatabase(page);

    const backupPath = path.join(os.tmpdir(), `noted-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      app: 'noted',
      version: 1,
      exportedAt: new Date().toISOString(),
      documents: [createDocument({ id: 'imported', title: 'Imported Workflow Note' })],
      categories: [],
      tags: [],
      settings: [],
    }));

    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByRole('button', { name: 'Import JSON' }).click();
    await page.getByLabel('Choose JSON File').setInputFiles(backupPath);
    await expect(page.getByText('Backup restored. Your documents have been refreshed.')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('button', { name: /Imported Workflow Note/ })).toBeVisible();

    fs.unlinkSync(backupPath);
  });
});
