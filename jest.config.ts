import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/.tmp/'],
  moduleNameMapper: {
    '^@erp-qween/app-config$': '<rootDir>/packages/app-config/src/index.ts',
    '^@erp-qween/domain-types$': '<rootDir>/packages/domain-types/src/index.ts'
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: {
          baseUrl: '.',
          paths: {
            '@erp-qween/app-config': ['packages/app-config/src/index.ts'],
            '@erp-qween/domain-types': ['packages/domain-types/src/index.ts']
          }
        }
      }
    ]
  },
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts']
};

export default config;
