module.exports = {
  skipFiles: ['test', 'interfaces', 'external', 'mocks'],
  mocha: {
    forbidOnly: true,
    grep: '@skip-on-coverage',
    invert: true,
  },
};
