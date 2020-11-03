const {
  airdropToken,
} = require('../data/deployments.json');

const airdrops = require('airdrop-ledger/airdrops.json');

const AirdropToken = artifacts.require('AirdropToken');

async function main() {
  const instance = await AirdropToken.at(airdropToken);

  const accounts = airdrops.map(d => d[0]);
  const amounts = airdrops.map(d => d[1]);

  await instance.airdrop(accounts, amounts);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
