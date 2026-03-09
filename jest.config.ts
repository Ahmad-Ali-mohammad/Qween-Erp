import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts']
};

export default config;
