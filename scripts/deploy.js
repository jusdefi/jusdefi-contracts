const fs = require('fs');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const JusDeFi = artifacts.require('JusDeFi');

async function main() {
  const instance = await JusDeFi.new(uniswapRouter);

  let json = JSON.stringify({ address: instance.address });

  fs.writeFileSync(`${ __dirname }/../data/deployment.json`, json, { flag: 'w' }, function (error) {
    console.log(error || 'contract address written to data/ directory');
  });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
