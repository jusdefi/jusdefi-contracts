const fs = require('fs');

const AirdropToken = artifacts.require('AirdropToken');

async function main() {
  const instance = await AirdropToken.new();

  let deployments;

  try {
    deployments = require('../data/deployments.json');
  } catch (e) {
    deployments = {};
  }

  let json = JSON.stringify(Object.assign(deployments, { airdropToken: instance.address }), null, 2);

  fs.writeFileSync(`${ __dirname }/../data/deployments.json`, json, { flag: 'w' });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
