const path = require('path');

module.exports = {
  webpack: {
    alias: {
      assert: path.resolve(__dirname, './node_modules/assert'),
      stream: path.resolve(__dirname, './node_modules/readable-stream'),
      buffer: path.resolve(__dirname, './node_modules/buffer'),
      util: path.resolve(__dirname, './node_modules/util'),
    },
  },
  devServer: {
    allowedHosts: [
      'localhost',
    ],
    proxy: {
      '/algod': {
        target: 'http://localhost:4180',
        pathRewrite: {'^/algod': ''}
      },
      '/indexer': {
        target: 'http://localhost:8980',
        pathRewrite: {'^/indexer': ''}
      },
    },
  },
};
