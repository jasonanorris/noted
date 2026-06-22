const { test, expect } = require('@playwright/test');

async function expectFocusedHeading(page, name) {
  const heading = page.getByRole('heading', { name });

  await expect(heading).toBeFocused();
}

async function expectVisibleFocus(page) {
  const outline = await page.evaluate(() => {
    const element = document.activeElement;
    const styles = window.getComputedStyle(element);

    return {
      outlineColor: styles.outlineColor,
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
    };
  });

  expect(outline.outlineStyle).not.toBe('none');
  expect(outline.outlineWidth).not.toBe('0px');
}

async function expectNoProgrammaticFocusOutline(page) {
  const outline = await page.evaluate(() => {
    const element = document.activeElement;
    const styles = window.getComputedStyle(element);

    return {
      outlineStyle: styles.outlineStyle,
      outlineWidth: styles.outlineWidth,
    };
  });

  expect(outline.outlineStyle).toBe('none');
}

test.describe('screen accessibility', () => {
  test('supports keyboard navigation and labeled editor fields', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await expectFocusedHeading(page, 'Knowledge Storage');
    await expectNoProgrammaticFocusOutline(page);
    await page.getByRole('link', { name: 'Skip to content' }).focus();
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Open settings' })).toBeFocused();
    await expectVisibleFocus(page);

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Create new document' })).toBeFocused();
    await page.keyboard.press('Enter');

    await expectFocusedHeading(page, 'New Document');
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect(page.getByLabel('Tags')).toBeVisible();
    await expect(page.getByLabel('Content')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveAttribute('aria-keyshortcuts', 'Control+S Meta+S');
    await expect(page.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-keyshortcuts', 'Control+B Meta+B');

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Title')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Back' })).toBeFocused();
  });

  test('focuses secondary screens and exposes labeled controls', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.getByRole('button', { name: 'Search' }).click();
    await expectFocusedHeading(page, 'Search');
    await expect(page.getByRole('textbox', { name: 'Search documents' })).toBeVisible();
    await expect(page.locator('.search-filter-grid').getByLabel('Category')).toBeVisible();
    await expect(page.locator('.search-filter-grid').getByLabel('Tag')).toBeVisible();

    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expectFocusedHeading(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import JSON' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Clear Local Data' })).toBeVisible();

    await page.getByRole('button', { name: 'Import JSON' }).click();
    await expectFocusedHeading(page, 'Import');
    await expect(page.getByLabel('Choose JSON File')).toBeVisible();
  });
});
