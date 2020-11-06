const fs = require('fs');

const {
  uniswapRouter,
} = require('../data/addresses.js');

let deployments = require('../data/deployments.json');

const JusDeFi = artifacts.require('JusDeFi');
const AirdropToken = artifacts.require('AirdropToken');

async function main() {
  const instance = await JusDeFi.new(deployments.airdropToken, uniswapRouter);
  const airdropToken = await AirdropToken.at(deployments.airdropToken);

  await airdropToken.setJDFIStakingPool(await instance._jdfiStakingPool.call());

  deployments.jusdefi = instance.address;
  deployments.jdfiStakingPool = await instance._jdfiStakingPool.call();
  deployments.univ2StakingPool = await instance._univ2StakingPool.call();
  deployments.devStakingPool = await instance._devStakingPool.call();

  let json = JSON.stringify(deployments, null, 2);

  fs.writeFileSync(`${ __dirname }/../data/deployments.json`, `${ json }\n`, { flag: 'w' });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
