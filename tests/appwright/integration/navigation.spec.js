// Example AppWright test for navigation functionality
describe('Navigation Test Suite', () => {
  beforeEach(async () => {
    await device.relaunchApp();
    // Login before each test
    await element(by.id('username')).typeText('test@example.com');
    await element(by.id('password')).typeText('password123');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('dashboard'))).toBeVisible();
  });

  it('should navigate to profile page', async () => {
    // Navigate to profile
    await element(by.id('profile-tab')).tap();
    
    // Verify profile page loaded
    await expect(element(by.id('profile-header'))).toBeVisible();
    await expect(element(by.text('Profile Information'))).toBeVisible();
  });

  it('should navigate to settings page', async () => {
    // Navigate to settings
    await element(by.id('settings-tab')).tap();
    
    // Verify settings page loaded
    await expect(element(by.id('settings-header'))).toBeVisible();
    await expect(element(by.text('App Settings'))).toBeVisible();
  });

  it('should handle back navigation correctly', async () => {
    // Navigate to profile then back
    await element(by.id('profile-tab')).tap();
    await expect(element(by.id('profile-header'))).toBeVisible();
    
    await element(by.id('back-button')).tap();
    await expect(element(by.id('dashboard'))).toBeVisible();
  });

  it('should show correct active tab indicator', async () => {
    // Check dashboard tab is active initially
    await expect(element(by.id('dashboard-tab').and(by.traits(['selected'])))).toBeVisible();
    
    // Navigate to profile and check active state
    await element(by.id('profile-tab')).tap();
    await expect(element(by.id('profile-tab').and(by.traits(['selected'])))).toBeVisible();
    await expect(element(by.id('dashboard-tab').and(by.traits(['selected'])))).not.toBeVisible();
  });
});
