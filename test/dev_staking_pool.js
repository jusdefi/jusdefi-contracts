const {
  BN,
  constants,
  time,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const AirdropToken = artifacts.require('AirdropToken');
const JusDeFi = artifacts.require('JusDeFiMock');
const DevStakingPool = artifacts.require('DevStakingPool');
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02');
const IERC20 = artifacts.require('IERC20');
const IWETH = artifacts.require('IWETH');

contract('DevStakingPool', function (accounts) {
  const [NOBODY, DEPLOYER, ...RECIPIENTS] = accounts;

  let airdropToken;
  let jusdefi;
  let instance;
  let weth;

  before(async function () {
    let router = await IUniswapV2Router02.at(uniswapRouter);
    await (
      await IWETH.at(await router.WETH.call())
    ).deposit({ from: NOBODY, value: new BN(web3.utils.toWei('1000')) });
  });

  beforeEach(async function () {
    airdropToken = await AirdropToken.new({ from: DEPLOYER });
    jusdefi = await JusDeFi.new(airdropToken.address, uniswapRouter, { from: DEPLOYER });
    instance = await DevStakingPool.at(await jusdefi._devStakingPool.call());
    await airdropToken.setJDFIStakingPool(await jusdefi._jdfiStakingPool.call(), { from: DEPLOYER });

    let router = await IUniswapV2Router02.at(uniswapRouter);
    weth = await IERC20.at(await router.WETH.call());

    await weth.approve(instance.address, constants.MAX_UINT256, { from: NOBODY });

    // close liquidity event

    await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
    await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
    await jusdefi.liquidityEventClose();
  });

  describe('constructor', function () {
    it('mints 10000 initial supply', async function () {
      assert((await instance.totalSupply.call()).eq(new BN(web3.utils.toWei('10000'))));
    });
  });

  describe('#withdraw', function () {
    it('transfers earned rewards to sender', async function () {
      for (let i = 0; i < RECIPIENTS.length; i++) {
        let recipient = RECIPIENTS[i];
        let amount = new BN(web3.utils.toWei((i + 1).toString()));
        await instance.transfer(recipient, amount, { from: DEPLOYER });
      }

      let amount = new BN((await instance.totalSupply.call()).div(new BN(1000)));
      await instance.distributeRewards(amount, { from: NOBODY });

      for (let recipient of [...RECIPIENTS, DEPLOYER]) {
        let initialWethBalance = await weth.balanceOf.call(recipient);
        await instance.withdraw({ from: recipient });
        let finalWethBalance = await weth.balanceOf.call(recipient);

        let deltaWethBalance = finalWethBalance.sub(initialWethBalance);
        let tokenBalance = await instance.balanceOf.call(recipient);
        assert(deltaWethBalance.eq(tokenBalance.div(new BN(1000))));
      }
    });

    it('removes pending rewards associated with sender', async function () {
      let account = DEPLOYER;
      let amount = new BN(web3.utils.toWei('1'));
      await instance.distributeRewards(amount, { from: NOBODY });

      assert(!(await instance.rewardsOf.call(account)).isZero());
      await instance.withdraw({ from: account });
      assert((await instance.rewardsOf.call(account)).isZero());
    });
  });

  describe('#distributeRewards', function () {
    it('transfers given amount of JDFI from sender and increases rewards for stakers', async function () {
      for (let i = 0; i < RECIPIENTS.length; i++) {
        let recipient = RECIPIENTS[i];
        let amount = new BN(web3.utils.toWei((i + 1).toString()));
        await instance.transfer(recipient, amount, { from: DEPLOYER });
      }

      let amount = new BN(web3.utils.toWei('10'));
      await instance.distributeRewards(amount, { from: NOBODY });

      for (let recipient of [...RECIPIENTS, DEPLOYER]) {
        let rewards = await instance.rewardsOf.call(recipient);
        let tokenBalance = await instance.balanceOf.call(recipient);
        assert(rewards.eq(tokenBalance.div(new BN(1000))));
      }
    });
  });
});
