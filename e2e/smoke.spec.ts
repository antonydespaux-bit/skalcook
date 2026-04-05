import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Skalcook/i)
  })

  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    // Should have email and password inputs
    await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible()
  })

  test('API health — docs endpoint returns JSON', async ({ request }) => {
    const res = await request.get('/api/docs')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('openapi')
  })

  test('rate limiting headers present on API calls', async ({ request }) => {
    const res = await request.get('/api/docs')
    expect(res.headers()['x-ratelimit-limit']).toBe('60')
    expect(res.headers()['x-ratelimit-remaining']).toBeDefined()
  })

  test('security headers present', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers() ?? {}
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['strict-transport-security']).toContain('max-age=')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('unauthenticated API call returns 401', async ({ request }) => {
    const res = await request.get('/api/admin/list-users?client_id=00000000-0000-0000-0000-000000000000')
    expect(res.status()).toBe(401)
  })
})
