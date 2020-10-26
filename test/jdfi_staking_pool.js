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

const JusDeFi = artifacts.require('JusDeFiMock');
const FeePool = artifacts.require('FeePool');
const JDFIStakingPool = artifacts.require('JDFIStakingPool');

contract('JDFIStakingPool', function (accounts) {
  const [NOBODY, DEPLOYER, ...RECIPIENTS] = accounts;

  const BP_DIVISOR = new BN(10000);

  let jusdefi;
  let instance;

  beforeEach(async function () {
    jusdefi = await JusDeFi.new(uniswapRouter, { from: DEPLOYER });
    instance = await JDFIStakingPool.at(await jusdefi._jdfiStakingPool.call());

    // close liquidity event

    await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
    await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
    await jusdefi.liquidityEventClose();
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
      it('transfer amount exceeds unlocked balance', async function () {
        let amount = new BN(1);
        await instance.airdropLocked([NOBODY], [amount], { from: DEPLOYER });

        await expectRevert(
          instance.transfer(NOBODY, amount, { from: NOBODY }),
          'JusDeFi: amount exceeds unlocked balance'
        );
      });
    });
  });

  describe('#transferFrom', function () {
    describe('reverts if', function () {
      it('transfer amount exceeds unlocked balance', async function () {
        let amount = new BN(web3.utils.toWei('1'));
        await instance.airdropLocked([NOBODY], [amount], { from: DEPLOYER });

        await expectRevert(
          instance.transferFrom(NOBODY, NOBODY, amount, { from: NOBODY }),
          'JusDeFi: amount exceeds unlocked balance'
        );
      });
    });
  });

  describe('#lockedBalanceOf', function () {
    it('returns locked balance of given account', async function () {
      let amount = new BN(web3.utils.toWei('1'));
      await instance.airdropLocked([NOBODY], [amount], { from: DEPLOYER });

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
      await instance.airdropLocked([NOBODY], [value.mul(new BN(4))], { from: DEPLOYER });

      await instance.unlock({ from: NOBODY, value });

      assert((await instance.lockedBalanceOf.call(NOBODY)).isZero());
    });

    it('distributes ETH to team');

    describe('reverts if', function () {
      it('sender has insufficient locked balance', async function () {
        await expectRevert(
          instance.unlock({ from: NOBODY, value: new BN(1) }),
          'JusDeFi: insufficient locked balance'
        );

        await instance.airdropLocked([NOBODY], [new BN(7)], { from: DEPLOYER });

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

  describe('#airdropLocked', function () {
    let amounts;
    let sum;

    before(async function () {
      amounts = RECIPIENTS.map((el, i) => new BN(web3.utils.toWei((i + 1).toString())));
      sum = amounts.reduce((acc, cur) => acc.add(cur), new BN(0));
    });

    it('emits Transfer events', async function () {
      let tx = await instance.airdropLocked(RECIPIENTS, amounts, { from: DEPLOYER });

      for (let i = 0; i < RECIPIENTS.length; i++) {
        expectEvent(tx, 'Transfer', { from: constants.ZERO_ADDRESS, to: RECIPIENTS[i], value: amounts[i] });
      }

      expectEvent(tx, 'Transfer', { from: DEPLOYER, to: constants.ZERO_ADDRESS, value: sum });
    });

    it('decreases sender balance by transfer amount', async function () {
      let initialBalance = await instance.balanceOf(DEPLOYER);
      await instance.airdropLocked(RECIPIENTS, amounts, { from: DEPLOYER });
      let finalBalance = await instance.balanceOf(DEPLOYER);

      assert(initialBalance.sub(sum).eq(finalBalance));
    });

    it('increases recipient balances and locked balances by individual transfer amounts', async function () {
      let initialBalances = [];

      for (let recipient of RECIPIENTS) {
        initialBalances.push(await instance.balanceOf.call(recipient));
        assert((await instance.lockedBalanceOf.call(recipient)).isZero());
      }

      await instance.airdropLocked(RECIPIENTS, amounts, { from: DEPLOYER });

      for (let i = 0; i < RECIPIENTS.length; i++) {
        let finalBalance = await instance.balanceOf.call(RECIPIENTS[i]);
        let delta = finalBalance.sub(initialBalances[i]);
        assert(delta.eq(amounts[i]));
        assert((await instance.lockedBalanceOf.call(RECIPIENTS[i])).eq(delta));
      }
    });

    describe('reverts if', function () {
      it('input array lengths do not match', async function () {
        await expectRevert(
          instance.airdropLocked([NOBODY, NOBODY], [new BN(0)], { from: DEPLOYER }),
          'JusDeFi: array lengths do not match'
        );
      });
    });
  });
});
