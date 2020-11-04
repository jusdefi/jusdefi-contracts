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

  let json = JSON.stringify(Object.assign(deployments, { jusdefi: instance.address }), null, 2);

  fs.writeFileSync(`${ __dirname }/../data/deployments.json`, `${ json }\n`, { flag: 'w' });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
