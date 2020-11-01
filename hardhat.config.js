require('@nomiclabs/hardhat-truffle5');
require('hardhat-abi-exporter');
require('hardhat-gas-reporter');
require('hardhat-spdx-license-identifier');

module.exports = {
  solidity: {
    version: '0.7.4',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    hardhat: {
      forking: {
        url: `${ process.env.FORK_URL }`,
      },
    },

    generic: {
      // set URL for external network, such as Infura
      url: `${ process.env.URL }`,
      accounts: {
        mnemonic: `${ process.env.MNEMONIC }`,
      },
    },
  },

  abiExporter: {
    clear: true,
    flat: true,
    only: [
      'AirdropToken',
      'JusDeFi',
      'FeePool',
      'JDFIStakingPool',
      'UNIV2StakingPool',
    ],
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS === 'true',
  },

  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },

  mocha: {
    timeout: 60 * 60 * 1000,
  },
};
