module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    'no-console': 'off',
    'no-debugger': 'off',
    'no-prototype-builtins': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off'
  }
}
