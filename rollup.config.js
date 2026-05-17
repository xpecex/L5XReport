const terser = require('@rollup/plugin-terser');

module.exports = [
  {
    input: 'src/assets/js/i18n.js',
    output: {
      file: 'src/assets/js/i18n.min.js',
      format: 'iife',
      name: 'window',
      extend: true,
    },
    plugins: [terser()],
  },
  {
    input: 'src/assets/js/index.js',
    external: ['./i18n.js'],
    output: {
      file: 'src/assets/js/index.min.js',
      format: 'iife',
      globals: { './i18n.js': 'window' },
    },
    plugins: [terser()],
  },
  {
    input: 'src/assets/js/report.js',
    external: ['./i18n.js'],
    output: {
      file: 'src/assets/js/report.min.js',
      format: 'iife',
      globals: { './i18n.js': 'window' },
    },
    plugins: [terser()],
  },
];
