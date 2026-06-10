import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/**/*.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  alias: {
    '@': './src',
  },
})
