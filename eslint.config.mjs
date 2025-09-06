import next from 'eslint-config-next'

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  ...next,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@next/next/no-img-element': 'off',
    },
  },
]
