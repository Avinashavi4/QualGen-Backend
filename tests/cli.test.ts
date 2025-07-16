import { SubmitJobCLIOptions } from '../src/shared/types';

describe('CLI Types Tests', () => {
  describe('SubmitJobCLIOptions', () => {
    test('should match CLI command structure', () => {
      const options: SubmitJobCLIOptions = {
        orgId: 'test-org',
        appVersionId: 'v1.0.0',
        testPath: 'suite-1',
        priority: 5,
        target: 'emulator'
      };

      expect(options.orgId).toBe('test-org');
      expect(options.appVersionId).toBe('v1.0.0');
      expect(options.testPath).toBe('suite-1');
      expect(options.priority).toBe(5);
      expect(options.target).toBe('emulator');
    });

    test('should have all required fields', () => {
      const options: SubmitJobCLIOptions = {
        orgId: 'required',
        appVersionId: 'required',
        testPath: 'required',
        priority: 1,
        target: 'device'
      };

      // All required fields should be present
      expect(typeof options.orgId).toBe('string');
      expect(typeof options.appVersionId).toBe('string');
      expect(typeof options.testPath).toBe('string');
      expect(typeof options.priority).toBe('number');
      expect(typeof options.target).toBe('string');
    });

    test('should support all target types', () => {
      const targets: Array<SubmitJobCLIOptions['target']> = ['emulator', 'device', 'browserstack'];
      
      targets.forEach(target => {
        const options: SubmitJobCLIOptions = {
          orgId: 'test',
          appVersionId: 'v1',
          testPath: 'test',
          priority: 1,
          target
        };
        expect(options.target).toBe(target);
      });
    });
  });
});
