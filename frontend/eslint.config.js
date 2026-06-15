import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      // PRD mandates co-locating Context + Provider exports in one file.
      'react-refresh/only-export-components': 'warn',
      // On-mount data fetching that sets state is intentional throughout.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Node-run config files (vite/eslint configs) use Node globals.
    files: ['*.config.js', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
