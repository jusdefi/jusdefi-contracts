usePlugin('@nomiclabs/buidler-truffle5');
usePlugin('buidler-abi-exporter');
usePlugin('buidler-gas-reporter');
usePlugin('buidler-spdx-license-identifier');
usePlugin('solidity-coverage');

// increased timeout required for ganache --fork mode
const TIMEOUT = 60 * 60 * 1000;

module.exports = {
  solc: {
    version: '0.7.3',
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },

  networks: {
    localhost: {
      timeout: TIMEOUT,
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
    only: [
      'JusDeFi',
      'FeePool',
      'JDFIStakingPool',
      'UNIV2StakingPool',
    ],
  },

  gasReporter: {
    enabled: !!process.env.REPORT_GAS,
    gasPrice: 1,
  },

  spdxLicenseIdentifier: {
    overwrite: false,
    runOnCompile: true,
  },

  mocha: {
    timeout: TIMEOUT,
  },
};
