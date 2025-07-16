// Example AppWright test for login functionality
describe('Login Test Suite', () => {
  beforeEach(async () => {
    // Setup before each test
    await device.relaunchApp();
  });

  it('should login with valid credentials', async () => {
    // Test login with valid credentials
    await element(by.id('username')).typeText('test@example.com');
    await element(by.id('password')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    // Verify login success
    await expect(element(by.id('dashboard'))).toBeVisible();
    await expect(element(by.text('Welcome back!'))).toBeVisible();
  });

  it('should show error for invalid credentials', async () => {
    // Test login with invalid credentials
    await element(by.id('username')).typeText('invalid@example.com');
    await element(by.id('password')).typeText('wrongpassword');
    await element(by.id('login-button')).tap();
    
    // Verify error message
    await expect(element(by.text('Invalid credentials'))).toBeVisible();
    await expect(element(by.id('dashboard'))).not.toBeVisible();
  });

  it('should validate required fields', async () => {
    // Test empty form validation
    await element(by.id('login-button')).tap();
    
    // Verify validation errors
    await expect(element(by.text('Username is required'))).toBeVisible();
    await expect(element(by.text('Password is required'))).toBeVisible();
  });
});
