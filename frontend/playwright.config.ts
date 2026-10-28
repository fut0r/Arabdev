import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: `${process.platform === 'win32' ? '..\\backend\\.venv\\Scripts\\python.exe' : 'python'} scripts/e2e_backend.py`,
      url: 'http://127.0.0.1:8014/api/v1/health',
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174',
      env: { VITE_API_PROXY: 'http://127.0.0.1:8014' },
      url: 'http://127.0.0.1:5174',
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
});
