require('@nomiclabs/hardhat-etherscan');
require('@nomiclabs/hardhat-truffle5');
require('hardhat-abi-exporter');
require('hardhat-contract-sizer');
require('hardhat-gas-reporter');
require('hardhat-spdx-license-identifier');
require('solidity-coverage');

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
      'IUniswapV2Router02',
      'IUniswapV2Pair',
      'IERC20',
    ],
  },

  contractSizer: {
    runOnCompile: true,
  },

  etherscan: {
    apiKey: `${ process.env.ETHERSCAN_KEY }`,
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
