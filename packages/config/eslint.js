/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { project: true },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // No any without justification comment
    '@typescript-eslint/no-explicit-any': 'warn',
    // Enforce consistent returns
    '@typescript-eslint/explicit-function-return-type': 'off',
    // Allow unused vars when prefixed with _
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // No floating promises
    '@typescript-eslint/no-floating-promises': 'error',
    // No void returns as value
    '@typescript-eslint/no-misused-promises': 'error',
  },
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.js', '*.cjs'],
};
