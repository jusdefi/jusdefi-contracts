const {
  BN,
  constants,
  time,
  expectEvent,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const AirdropToken = artifacts.require('AirdropToken');
const JusDeFi = artifacts.require('JusDeFiMock');
const JDFIStakingPool = artifacts.require('JDFIStakingPool');

contract('AirdropToken', function (accounts) {
  const [NOBODY, DEPLOYER, ...RECIPIENTS] = accounts;

  let instance;
  let jusdefi;

  beforeEach(async function () {
    instance = await AirdropToken.new({ from: DEPLOYER });
    jusdefi = await JusDeFi.new(instance.address, uniswapRouter, { from: DEPLOYER });
  });

  describe('constructor', function () {
    it('mints quanity corresponding to justice reserve for sender', async function () {
      let balance = await instance.balanceOf.call(DEPLOYER);
      assert(balance.eq(new BN(web3.utils.toWei('10000'))));
    });
  });

  describe('#setJDFIStakingPool', function () {
    describe('reverts if', function () {
      it('sender is not deployer', async function () {
        await expectRevert(
          instance.setJDFIStakingPool(await jusdefi._jdfiStakingPool.call(), { from: NOBODY }),
          'JusDeFi: sender must be deployer'
        );
      });

      it('JDFI Staking Pool has already been set', async function () {
        await instance.setJDFIStakingPool(await jusdefi._jdfiStakingPool.call(),  { from: DEPLOYER });

        await expectRevert(
          instance.setJDFIStakingPool(await jusdefi._jdfiStakingPool.call(), { from: DEPLOYER }),
          'JusDeFi: JDFI Staking Pool contract has already been set'
        );
      });
    });
  });

  describe('#airdrop', function () {
    let amounts;
    let sum;

    before(async function () {
      amounts = RECIPIENTS.map((el, i) => new BN(web3.utils.toWei((i + 1).toString())));
      sum = amounts.reduce((acc, cur) => acc.add(cur), new BN(0));
    });

    it('emits Transfer events', async function () {
      let tx = await instance.airdrop(RECIPIENTS, amounts, { from: DEPLOYER });

      for (let i = 0; i < RECIPIENTS.length; i++) {
        expectEvent(tx, 'Transfer', { from: constants.ZERO_ADDRESS, to: RECIPIENTS[i], value: amounts[i] });
      }

      expectEvent(tx, 'Transfer', { from: DEPLOYER, to: constants.ZERO_ADDRESS, value: sum });
    });

    it('decreases sender balance by total airdrop amount', async function () {
      let initialBalance = await instance.balanceOf(DEPLOYER);
      await instance.airdrop(RECIPIENTS, amounts, { from: DEPLOYER });
      let finalBalance = await instance.balanceOf(DEPLOYER);

      assert(initialBalance.sub(sum).eq(finalBalance));
    });

    it('increases recipient balances and locked balances by individual airdrop amounts', async function () {
      for (let recipient of RECIPIENTS) {
        assert((await instance.balanceOf.call(recipient)).isZero());
      }

      await instance.airdrop(RECIPIENTS, amounts, { from: DEPLOYER });

      for (let i = 0; i < RECIPIENTS.length; i++) {
        assert((await instance.balanceOf.call(RECIPIENTS[i])).eq(amounts[i]));
      }
    });

    describe('reverts if', function () {
      it('input array lengths do not match', async function () {
        await expectRevert(
          instance.airdrop([NOBODY, NOBODY], [new BN(0)], { from: DEPLOYER }),
          'JusDeFi: array lengths do not match'
        );
      });
    });
  });

  describe('#exchange', function () {
    it('burns tokens held by given account', async function () {
      let jdfiStakingPool = await JDFIStakingPool.at(await jusdefi._jdfiStakingPool.call());
      await instance.setJDFIStakingPool(jdfiStakingPool.address, { from: DEPLOYER });

      await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
      await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
      await jusdefi.liquidityEventClose();

      let amount = new BN(web3.utils.toWei('1'));
      let account = RECIPIENTS[0];
      await instance.transfer(account, amount, { from: DEPLOYER });

      assert((await instance.balanceOf.call(account)).eq(amount));
      await instance.exchange(account, { from: NOBODY });
      assert((await instance.balanceOf.call(account)).isZero());
    });

    it('stakes quantity of JDFI corresponding to balance of given account and transfers locked JDFI/S to given account', async function () {
      let jdfiStakingPool = await JDFIStakingPool.at(await jusdefi._jdfiStakingPool.call());
      await instance.setJDFIStakingPool(jdfiStakingPool.address, { from: DEPLOYER });

      await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
      await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
      await jusdefi.liquidityEventClose();

      let amount = new BN(web3.utils.toWei('1'));
      let account = RECIPIENTS[0];
      await instance.transfer(account, amount, { from: DEPLOYER });

      assert((await jdfiStakingPool.balanceOf.call(account)).isZero());
      await instance.exchange(account, { from: NOBODY });
      assert((await jdfiStakingPool.balanceOf.call(account)).eq(amount));
      assert((await jdfiStakingPool.lockedBalanceOf.call(account)).eq(amount));
    });
  });
});
