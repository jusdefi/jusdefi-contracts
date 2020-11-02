const fs = require('fs');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const JusDeFi = artifacts.require('JusDeFi');

async function main() {
  let deployments = require('../data/deployments.json');

  const instance = await JusDeFi.new(deployments.airdropToken, uniswapRouter);

  let json = JSON.stringify(Object.assign(deployments, { jusdefi: instance.address }), null, 2);

  fs.writeFileSync(`${ __dirname }/../data/deployments.json`, json, { flag: 'w' });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
