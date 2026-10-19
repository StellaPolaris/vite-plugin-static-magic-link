import { expect, test } from '@playwright/test'
import { TEST_KEY } from './playwright.config'

test('the link opens the site, and a sub-route reload still works', async ({ page }) => {
  await page.goto(`/#key=${TEST_KEY}`)
  await expect(page.getByRole('heading', { name: 'Happy birthday!' })).toBeVisible()

  await page.getByRole('link', { name: 'See the gallery' }).click()
  await expect(page).toHaveURL(/\/gallery$/) // the router dropped the fragment
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Gallery' })).toBeVisible()
  await expect(page.getByAltText('Large picture')).toBeVisible()
})
