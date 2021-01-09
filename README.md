# JusDeFi

Transparent re-implementation of AMPLYFI.

Professionally audited by [Callisto Network](https://callisto.network/jusdefi-token-jdfi-security-audit/).

## Deployments

| Contract | Address (mainnet) | Notes |
|-|-|-|
| `JusDeFi` | [`0x75cdc4F6be18Dc003dC2Ae424f85D1243f0fB781`](https://etherscan.io/address/0x75cdc4F6be18Dc003dC2Ae424f85D1243f0fB781) | JDFI Token |
| `JDFIStakingPool` | [`0x7ec638eE0Ca9591D74b338FCc3aC80ed19B1E6bf`](https://etherscan.io/address/0x7ec638eE0Ca9591D74b338FCc3aC80ed19B1E6bf) | JDFI/S Token |
| `UNIV2StakingPool` | [`0x199092dA8DE9168C6DDCA6eD83c6B72dE3B49978`](https://etherscan.io/address/0x199092dA8DE9168C6DDCA6eD83c6B72dE3B49978) | JDFI-WETH-UNI-V2/S Token |
| `FeePool` | [`0x4a04BB4C3e9Bb8295d1D71e5e4c591b29AC79A1D`](https://etherscan.io/address/0x4a04BB4C3e9Bb8295d1D71e5e4c591b29AC79A1D) | |
| `UniswapV2Pair` | [`0xaA53Df90b6ce10FEd75D76415Db10ccd35A599D2`](https://etherscan.io/address/0xaA53Df90b6ce10FEd75D76415Db10ccd35A599D2) | Uniswap Pair / UNI-V2 Token
| `AirdropToken` | [`0x1F89ABfc1A80EAe67b8036a49204823e8861eAF6`](https://etherscan.io/address/0x1F89ABfc1A80EAe67b8036a49204823e8861eAF6) | JDFI/A Token |

## Development

Install dependencies via Yarn:

```bash
yarn install
```

Compile contracts via Hardhat:

```bash
yarn run hardhat compile
```

### Networks

By default, Hardhat uses the Hardhat Network in-process.

To use an external network via URL, set the `URL` environment variable and append commands with `--network generic`:

```bash
URL="[NODE_URL]" yarn run hardhat test --network generic
```

### Testing

To test the contracts via Hardhat, specify a URL from which to fork the mainnet by setting the `FORK_URL` environment variable:

```bash
FORK_URL="[NODE_URL]" yarn run hardhat test
```

Activate gas usage reporting by setting the `REPORT_GAS` environment variable to `"true"`:

```bash
REPORT_GAS=true yarn run hardhat test
```

Generate a code coverage report using `solidity-coverage`:

```bash
yarn run hardhat coverage
```
