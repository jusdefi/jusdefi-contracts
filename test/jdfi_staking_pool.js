const {
  BN,
  balance,
  constants,
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
  weth,
} = require('../data/deployments.json');

const AirdropToken = artifacts.require('AirdropToken');
const JusDeFi = artifacts.require('JusDeFiMock');
const FeePool = artifacts.require('FeePool');
const JDFIStakingPool = artifacts.require('JDFIStakingPool');
const IERC20 = artifacts.require('IERC20');

contract('JDFIStakingPool', function (accounts) {
  const [NOBODY, DEPLOYER, ...RECIPIENTS] = accounts;

  const BP_DIVISOR = new BN(10000);

  let airdropToken;
  let jusdefi;
  let instance;

  beforeEach(async function () {
    airdropToken = await AirdropToken.new({ from: DEPLOYER });
    jusdefi = await JusDeFi.new(airdropToken.address, uniswapRouter, { from: DEPLOYER });
    instance = await JDFIStakingPool.at(await jusdefi._jdfiStakingPool.call());
    await airdropToken.setJDFIStakingPool(instance.address, { from: DEPLOYER });

    // close liquidity event

    await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
    await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
    await jusdefi.liquidityEventClose();
  });

  describe('constructor', function () {
    it('approves Dev Staking Pool to spend WETH', async function () {
      let wethContract = await IERC20.at(weth);
      assert((await wethContract.allowance.call(instance.address, await jusdefi._devStakingPool.call())).eq(constants.MAX_UINT256));
    });
  });

  describe('#name', function () {
    it('returns "Staked JDFI"', async function () {
      assert.equal(await instance.name.call(), 'Staked JDFI');
    });
  });

  describe('#symbol', function () {
    it('returns "JDFI/S"', async function () {
      assert.equal(await instance.symbol.call(), 'JDFI/S');
    });
  });

  describe('#transfer', function () {
    describe('reverts if', function () {
      it('sender is not JusDeFi or AirdropToken contract', async function () {
        await expectRevert(
          instance.transfer(NOBODY, new BN(0), { from: NOBODY }),
          'JusDeFi: staked tokens are non-transferrable'
        );
      });
    });
  });

  describe('#transferFrom', function () {
    describe('reverts if', function () {
      it('sender is not JusDeFi or AirdropToken contract', async function () {
        await expectRevert(
          instance.transferFrom(NOBODY, NOBODY, new BN(0), { from: NOBODY }),
          'JusDeFi: staked tokens are non-transferrable'
        );
      });
    });
  });

  describe('#lockedBalanceOf', function () {
    it('returns locked balance of given account', async function () {
      let amount = new BN(web3.utils.toWei('1'));
      await airdropToken.transfer(NOBODY, amount, { from: DEPLOYER });
      await airdropToken.exchange({ from: NOBODY });

      assert((await instance.lockedBalanceOf.call(NOBODY)).eq(amount));
    });
  });

  describe('#compound', function () {
    it('stakes earned rewards without applying fees', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));

      await jusdefi.mint(account, amount);
      await instance.stake(amount, { from: account });

      await jusdefi.distributeJDFIStakingPoolRewards(amount);

      let rewards = await instance.rewardsOf.call(account);
      assert(!rewards.isZero());

      let initialBalance = await instance.balanceOf.call(account);
      await instance.compound({ from: account });
      let finalBalance = await instance.balanceOf.call(account);

      assert(initialBalance.add(rewards).eq(finalBalance));
    });

    it('removes pending rewards associated with sender', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));

      await jusdefi.mint(account, amount);
      await instance.stake(amount, { from: account });

      await jusdefi.distributeJDFIStakingPoolRewards(amount);

      assert(!(await instance.rewardsOf.call(account)).isZero());
      await instance.compound({ from: account });
      assert((await instance.rewardsOf.call(account)).isZero());
    });
  });

  describe('#stake', function () {
    it('mints JDFI/S in exchange for given quantity of JDFI at a 1:1 ratio', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amount);

      await instance.stake(amount, { from: account });

      assert((await instance.balanceOf.call(account)).eq(amount));
      assert((await jusdefi.balanceOf.call(account)).isZero());
    });

    it('does not require approval', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amount);

      assert((await jusdefi.allowance.call(account, instance.address)).isZero());

      // no revert
      await instance.stake(amount, { from: account });
    });
  });

  describe('#unstake', function () {
    it('burns given quantity of JDFI/S in exchange for JDFI after applying fees', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amount);
      await instance.stake(amount, { from: account });

      let feePool = await FeePool.at(await jusdefi._feePool.call());
      let fee = await feePool._fee.call();

      let initialBalance = await jusdefi.balanceOf.call(account);
      await instance.unstake(amount, { from: account });
      let finalBalance = await jusdefi.balanceOf.call(account);

      let burned = amount.mul(fee).div(BP_DIVISOR);
      assert(initialBalance.add(amount).sub(burned).eq(finalBalance));
    });

    describe('reverts if', function () {
      it('amount exceeds unlocked balance', async function () {
        let amount = new BN(web3.utils.toWei('1'));
        await airdropToken.transfer(NOBODY, amount, { from: DEPLOYER });
        await airdropToken.exchange({ from: NOBODY });

        await expectRevert(
          instance.unstake(await instance.balanceOf.call(NOBODY), { from: NOBODY }),
          'JusDeFi: amount exceeds unlocked balance'
        );
      });
    });
  });

  describe('#withdraw', function () {
    it('applies fees and transfers earned rewards to sender', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amount);
      await instance.stake(amount, { from: account });

      await jusdefi.distributeJDFIStakingPoolRewards(amount);
      let feePool = await FeePool.at(await jusdefi._feePool.call());
      let fee = await feePool._fee.call();

      let rewards = await instance.rewardsOf.call(account);
      assert(!rewards.isZero());

      let initialBalance = await jusdefi.balanceOf.call(account);
      await instance.withdraw({ from: account });
      let finalBalance = await jusdefi.balanceOf.call(account);

      let burned = rewards.mul(fee).div(BP_DIVISOR);
      assert(initialBalance.add(rewards).sub(burned).eq(finalBalance));
    });

    it('removes pending rewards associated with sender', async function () {
      let [account] = RECIPIENTS;
      let amount = new BN(web3.utils.toWei('1'));

      await jusdefi.mint(account, amount);
      await instance.stake(amount, { from: account });

      await jusdefi.distributeJDFIStakingPoolRewards(amount);

      assert(!(await instance.rewardsOf.call(account)).isZero());
      await instance.withdraw({ from: account });
      assert((await instance.rewardsOf.call(account)).isZero());
    });
  });

  describe('#unlock', function () {
    it('unlocks tokens in exchange for ETH at a ratio of 4:1', async function () {
      let value = new BN(web3.utils.toWei('1'));
      await airdropToken.transfer(NOBODY, value.mul(new BN(4)), { from: DEPLOYER });
      await airdropToken.exchange({ from: NOBODY });

      await instance.unlock({ from: NOBODY, value });

      assert((await instance.lockedBalanceOf.call(NOBODY)).isZero());
    });

    it('distributes ETH in equal parts to Fee Pool and Dev Staking Pool', async function () {
      let value = new BN(web3.utils.toWei('1'));
      await airdropToken.transfer(NOBODY, value.mul(new BN(4)), { from: DEPLOYER });
      await airdropToken.exchange({ from: NOBODY });

      await instance.unlock({ from: NOBODY, value });

      assert((await balance.current(await jusdefi._feePool.call())).eq(value.div(new BN(2))));
      // Dev Staking Pool value stored as WETH
      let wethContract = await IERC20.at(weth);
      assert((await wethContract.balanceOf.call(await jusdefi._devStakingPool.call())).eq(value.div(new BN(2))));
    });

    describe('reverts if', function () {
      it('liquidity event is still in progress', async function () {
        let airdropToken = await AirdropToken.new({ from: DEPLOYER });
        let jusdefi = await JusDeFi.new(airdropToken.address, uniswapRouter, { from: DEPLOYER });
        let instance = await JDFIStakingPool.at(await jusdefi._jdfiStakingPool.call());
        await airdropToken.setJDFIStakingPool(instance.address, { from: DEPLOYER });

        await expectRevert(
          instance.unlock(),
          'JusDeFi: liquidity event still in progress'
        );
      });

      it('sender has insufficient locked balance', async function () {
        await expectRevert(
          instance.unlock({ from: NOBODY, value: new BN(1) }),
          'JusDeFi: insufficient locked balance'
        );

        await airdropToken.transfer(NOBODY, new BN(7), { from: DEPLOYER });
        await airdropToken.exchange({ from: NOBODY });

        await expectRevert(
          instance.unlock({ from: NOBODY, value: new BN(2) }),
          'JusDeFi: insufficient locked balance'
        );
      });
    });
  });

  describe('#distributeRewards', function () {
    it('transfers given amount of JDFI from sender and increases rewards for stakers', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amountJDFI.mul(new BN(2)));

      await instance.stake(amountJDFI, { from: account });

      assert((await instance.rewardsOf.call(account)).isZero());
      await instance.distributeRewards(amountJDFI, { from: account });
      assert(!(await instance.rewardsOf.call(account)).isZero());

      assert((await jusdefi.balanceOf.call(account)).isZero());
    });
  });
});
