// Minimal flat config: catches real bugs (undefined vars, unused, hooks), not style.
const tseslint = require('typescript-eslint');
const hooks = require('eslint-plugin-react-hooks');
module.exports = tseslint.config(
  { ignores: ['node_modules', 'android', 'ios', '.expo', 'dist', 'tests', '*.config.js'] },
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
