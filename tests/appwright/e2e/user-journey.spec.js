// Example AppWright end-to-end test
describe('End-to-End Test Suite', () => {
  it('should complete full user journey', async () => {
    // 1. App Launch
    await device.relaunchApp();
    await expect(element(by.id('splash-screen'))).toBeVisible();
    await waitFor(element(by.id('login-screen'))).toBeVisible().withTimeout(5000);

    // 2. Login
    await element(by.id('username')).typeText('test@example.com');
    await element(by.id('password')).typeText('password123');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('dashboard'))).toBeVisible();

    // 3. Create New Item
    await element(by.id('add-item-button')).tap();
    await expect(element(by.id('create-item-form'))).toBeVisible();
    
    await element(by.id('item-title')).typeText('Test Item');
    await element(by.id('item-description')).typeText('This is a test item created during E2E testing');
    await element(by.id('save-item-button')).tap();

    // 4. Verify Item Creation
    await expect(element(by.text('Test Item'))).toBeVisible();
    await expect(element(by.text('Item created successfully'))).toBeVisible();

    // 5. Edit Item
    await element(by.text('Test Item')).tap();
    await element(by.id('edit-button')).tap();
    await element(by.id('item-title')).clearText();
    await element(by.id('item-title')).typeText('Updated Test Item');
    await element(by.id('save-item-button')).tap();

    // 6. Verify Item Update
    await expect(element(by.text('Updated Test Item'))).toBeVisible();
    await expect(element(by.text('Item updated successfully'))).toBeVisible();

    // 7. Search Functionality
    await element(by.id('search-input')).typeText('Updated');
    await element(by.id('search-button')).tap();
    await expect(element(by.text('Updated Test Item'))).toBeVisible();

    // 8. Delete Item
    await element(by.text('Updated Test Item')).longPress();
    await element(by.text('Delete')).tap();
    await element(by.text('Confirm')).tap();
    await expect(element(by.text('Updated Test Item'))).not.toBeVisible();

    // 9. Logout
    await element(by.id('profile-tab')).tap();
    await element(by.id('logout-button')).tap();
    await element(by.text('Confirm Logout')).tap();
    await expect(element(by.id('login-screen'))).toBeVisible();
  });

  it('should handle network failures gracefully', async () => {
    // Simulate network issues
    await device.relaunchApp();
    await device.setNetworkConnection('wifi', false);
    
    // Try to login without network
    await element(by.id('username')).typeText('test@example.com');
    await element(by.id('password')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Verify error handling
    await expect(element(by.text('Network error'))).toBeVisible();
    await expect(element(by.text('Please check your connection'))).toBeVisible();
    
    // Restore network and retry
    await device.setNetworkConnection('wifi', true);
    await element(by.id('retry-button')).tap();
    await expect(element(by.id('dashboard'))).toBeVisible();
  });

  it('should handle app backgrounding and foregrounding', async () => {
    // Login first
    await device.relaunchApp();
    await element(by.id('username')).typeText('test@example.com');
    await element(by.id('password')).typeText('password123');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('dashboard'))).toBeVisible();
    
    // Background the app
    await device.sendToHome();
    await device.launchApp();
    
    // Verify app state is preserved
    await expect(element(by.id('dashboard'))).toBeVisible();
  });
});
