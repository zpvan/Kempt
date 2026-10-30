import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // shadcn/ui and providers intentionally co-locate components and hooks.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/components/ui/sidebar.tsx', 'src/components/AssistantPanel.tsx'],
    rules: {
      // Existing skeleton uses a stable-once random width for visual variety.
      'react-hooks/purity': 'off',
      // Query data is synchronized into local chat drafts and selection state.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
