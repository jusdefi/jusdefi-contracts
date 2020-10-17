usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('buidler-gas-reporter');
usePlugin('buidler-spdx-license-identifier');
usePlugin('solidity-coverage');

module.exports = {
  solc: {
    version: '0.7.3',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },

  networks: {
    generic: {
      // set URL for external network, such as Infura
      url: `${ process.env.URL }`,
      accounts: {
        mnemonic: `${ process.env.MNEMONIC }`,
      },
    },
  },

  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    gasPrice: 1,
  },

  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },
};
