const terser = require('@rollup/plugin-terser');

module.exports = [
  {
    input: 'src/assets/js/index.js',
    output: {
      file: 'src/assets/js/index.min.js',
      format: 'iife',
    },
    plugins: [terser()],
  },
  {
    input: 'src/assets/js/report.js',
    output: {
      file: 'src/assets/js/report.min.js',
      format: 'iife',
    },
    plugins: [terser()],
  },
];
