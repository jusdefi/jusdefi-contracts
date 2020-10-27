const {
  BN,
  balance,
  constants,
  send,
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const JusDeFi = artifacts.require('JusDeFiMock');
const FeePool = artifacts.require('FeePool');
const UNIV2StakingPool = artifacts.require('UNIV2StakingPool');
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair');
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02');

contract('UNIV2StakingPool', function (accounts) {
  const [NOBODY, DEPLOYER, ...RECIPIENTS] = accounts;

  const BP_DIVISOR = new BN(10000);

  let jusdefi;
  let instance;

  let addUniswapLiquidity = async function (account, amountJDFI) {
    let router = await IUniswapV2Router02.at(uniswapRouter);

    await router.addLiquidityETH(
      jusdefi.address,
      amountJDFI,
      amountJDFI,
      amountJDFI.div(new BN(4)),
      account,
      constants.MAX_UINT256,
      { from: account, value: amountJDFI.div(new BN(4)) }
    );
  };

  beforeEach(async function () {
    jusdefi = await JusDeFi.new(uniswapRouter, { from: DEPLOYER });
    instance = await UNIV2StakingPool.at(await jusdefi._univ2StakingPool.call());

    // close liquidity event

    await time.increaseTo(await jusdefi._liquidityEventClosedAt.call());
    await jusdefi.liquidityEventDeposit({ from: DEPLOYER, value: new BN(web3.utils.toWei('1')) });
    await jusdefi.liquidityEventClose();
  });

  describe('constructor', function () {
    it('approves Uniswap Router to spend UNI-V2', async function () {
      let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
      assert((await pair.allowance.call(instance.address, uniswapRouter)).eq(constants.MAX_UINT256));
    });
  });

  describe('receive', function () {
    describe('reverts if', function () {
      it('sender is not Uniswap Router', async function () {
        await expectRevert(
          send.ether(NOBODY, instance.address, new BN(1)),
          'JusDeFi: invalid ETH deposit'
        );
      });
    });
  });

  describe('#name', function () {
    it('returns "Staked JDFI/WETH UNI-V2"', async function () {
      assert.equal(await instance.name.call(), 'Staked JDFI/WETH UNI-V2');
    });
  });

  describe('#symbol', function () {
    it('returns "JDFI-WETH-UNI-V2/S"', async function () {
      assert.equal(await instance.symbol.call(), 'JDFI-WETH-UNI-V2/S');
    });
  });

  describe('#compound', function () {
    it('stakes earned rewards without applying fees', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      let amountETH = amountJDFI.div(new BN(4));
      await jusdefi.mint(account, amountJDFI);

      await instance.methods['stake(uint256,uint256,uint256)'](
        amountJDFI,
        amountJDFI,
        amountJDFI.div(new BN(4)),
        { from: account, value: amountJDFI.div(new BN(4)) }
      );

      await jusdefi.distributeUNIV2StakingPoolRewards(amountJDFI);

      let initialBalanceJDFIWETHUNIV2S = await instance.balanceOf.call(account);
      await instance.compound(amountETH, { from: account, value: amountETH });
      let finalBalanceJDFIWETHUNIV2S = await instance.balanceOf.call(account);

      assert(initialBalanceJDFIWETHUNIV2S.mul(new BN(2)).eq(finalBalanceJDFIWETHUNIV2S));
    });

    it('removes pending rewards associated with sender', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      let amountETH = amountJDFI.div(new BN(4));
      await jusdefi.mint(account, amountJDFI);

      await instance.methods['stake(uint256,uint256,uint256)'](
        amountJDFI,
        amountJDFI,
        amountJDFI.div(new BN(4)),
        { from: account, value: amountJDFI.div(new BN(4)) }
      );

      await jusdefi.distributeUNIV2StakingPoolRewards(amountJDFI);

      assert((await instance.rewardsOf.call(account)).eq(amountJDFI));
      await instance.compound(amountETH, { from: account, value: amountETH });
      assert((await instance.rewardsOf.call(account)).isZero());
    });

    it('returns unspent ETH to sender', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      let amountETH = amountJDFI.div(new BN(4));
      await jusdefi.mint(account, amountJDFI);

      await instance.methods['stake(uint256,uint256,uint256)'](
        amountJDFI,
        amountJDFI,
        amountJDFI.div(new BN(4)),
        { from: account, value: amountJDFI.div(new BN(4)) }
      );

      await jusdefi.distributeUNIV2StakingPoolRewards(amountJDFI);

      let initialBalance = await balance.current(account);
      let tx = await instance.compound(amountETH, { from: account, value: amountETH.mul(new BN(2)), gasPrice: new BN(1) });
      let finalBalance = await balance.current(account);

      let gasUsed = new BN(tx.receipt.gasUsed);

      assert(initialBalance.sub(amountETH).sub(gasUsed).eq(finalBalance));
    });

    describe('reverts if', function () {
      it('insufficient ETH is deposited', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        let amountETH = amountJDFI.div(new BN(4));
        await jusdefi.mint(account, amountJDFI);

        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );

        await expectRevert(
          instance.compound(amountETH, { from: account, value: amountETH.sub(new BN(1)) }),
          'UniswapV2Library: INSUFFICIENT_AMOUNT'
        );
      });

      it('minimum ETH amount exceeds actual Uniswap input', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        let amountETH = amountJDFI.div(new BN(4));
        await jusdefi.mint(account, amountJDFI);

        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );

        await expectRevert(
          instance.compound(amountETH.add(new BN(1)), { from: account, value: amountETH }),
          'UniswapV2Library: INSUFFICIENT_AMOUNT'
        );
      });
    });
  });

  describe('#stake', function () {
    describe('(uint256)', function () {
      it('mints JDFI-WETH-UNI-V2/S in exchange for given quantity of UNI-V2 at a 1:1 ratio', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        await jusdefi.mint(account, amountJDFI);

        let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
        await addUniswapLiquidity(account, amountJDFI);
        let amount = await pair.balanceOf.call(account);
        await pair.approve(instance.address, amount, { from: account });

        await instance.methods['stake(uint256)'](amount, { from: account });

        assert((await instance.balanceOf.call(account)).eq(amount));
        assert((await pair.balanceOf.call(account)).isZero());
      });
    });

    describe('(uint256,uint256,uint256)', function () {
      it('mints JDFI-WETH-UNI-V2/S corresponding to UNI-V2 tokens minted using deposited JDFI and ETH, in 1:1 ratio', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        await jusdefi.mint(account, amountJDFI);

        let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());

        let initialBalance = await instance.balanceOf.call(account);
        let initialBalanceUNIV2 = await pair.balanceOf.call(instance.address);
        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );
        let finalBalance = await instance.balanceOf.call(account);
        let finalBalanceUNIV2 = await pair.balanceOf.call(instance.address);

        assert(finalBalance.sub(initialBalance).eq(finalBalanceUNIV2.sub(initialBalanceUNIV2)));
      });

      it('does not require approval', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        await jusdefi.mint(account, amountJDFI);

        assert((await jusdefi.allowance.call(account, instance.address)).isZero());

        // no revert
        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );
      });

      it('returns unspent ETH to sender', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        await jusdefi.mint(account, amountJDFI);

        let initialBalance = await balance.current(account);
        let tx = await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)).mul(new BN(10)), gasPrice: new BN(1) }
        );
        let finalBalance = await balance.current(account);
        let gasUsed = new BN(tx.receipt.gasUsed);

        assert(initialBalance.sub(amountJDFI.div(new BN(4))).sub(gasUsed).eq(finalBalance));
      });

      it('returns unspent JDFI to sender', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        await jusdefi.mint(account, amountJDFI.mul(new BN(10)));

        let initialBalance = await jusdefi.balanceOf.call(account);
        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI.mul(new BN(10)),
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );
        let finalBalance = await jusdefi.balanceOf.call(account);

        assert(initialBalance.sub(amountJDFI).eq(finalBalance));
      });

      describe('reverts if', function () {
        it('minimum JDFI amount exceeds actual Uniswap input', async function () {
          let [account] = RECIPIENTS;
          let amountJDFI = new BN(web3.utils.toWei('1'));
          let amountETH = amountJDFI.div(new BN(4));
          await jusdefi.mint(account, amountJDFI.add(new BN(4)));

          // excess of 4 JDFI wei needed to trigger revert

          await expectRevert(
            instance.methods['stake(uint256,uint256,uint256)'](
              amountJDFI.add(new BN(4)),
              amountJDFI.add(new BN(4)),
              amountETH,
              { from: account, value: amountETH }
            ),
            'UniswapV2Router: INSUFFICIENT_A_AMOUNT'
          );
        });

        it('minimum ETH amount exceeds actual Uniswap input', async function () {
          let [account] = RECIPIENTS;
          let amountJDFI = new BN(web3.utils.toWei('1'));
          let amountETH = amountJDFI.div(new BN(4));
          await jusdefi.mint(account, amountJDFI);

          await expectRevert(
            instance.methods['stake(uint256,uint256,uint256)'](
              amountJDFI,
              amountJDFI,
              amountETH.add(new BN(1)),
              { from: account, value: amountETH.add(new BN(1)) }
            ),
            'UniswapV2Router: INSUFFICIENT_B_AMOUNT'
          );
        });

        it('minimum JDFI must not exceed desired JDFI', async function () {
          let [account] = RECIPIENTS;
          let amountJDFI = new BN(web3.utils.toWei('1'));
          let amountETH = amountJDFI.div(new BN(4));
          await jusdefi.mint(account, amountJDFI);

          await expectRevert(
            instance.methods['stake(uint256,uint256,uint256)'](
              amountJDFI,
              amountJDFI.add(new BN(1)),
              amountETH,
              { from: account, value: amountETH }
            ),
            'JusDeFi: minimum JDFI must not exceed desired JDFI'
          );
        });

        it('minimum ETH must not exceed message value', async function () {
          let [account] = RECIPIENTS;
          let amountJDFI = new BN(web3.utils.toWei('1'));
          let amountETH = amountJDFI.div(new BN(4));
          await jusdefi.mint(account, amountJDFI);

          await expectRevert(
            instance.methods['stake(uint256,uint256,uint256)'](
              amountJDFI,
              amountJDFI,
              amountETH.add(new BN(1)),
              { from: account, value: amountETH }
            ),
            'JusDeFi: minimum ETH must not exceed message value'
          );
        });
      });
    });
  });

  describe('#unstake', function () {
    it('burns given quantity of JDFI-WETH-UNI-V2/S in exchange for underlying ETH and JDFI after applying fees', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amountJDFI);

      await instance.methods['stake(uint256,uint256,uint256)'](
        amountJDFI,
        amountJDFI,
        amountJDFI.div(new BN(4)),
        { from: account, value: amountJDFI.div(new BN(4)) }
      );

      let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
      let { reserve0, reserve1 } = await pair.getReserves();

      let reserveJDFI, reserveETH;

      if (reserve0.gt(reserve1)) {
        reserveJDFI = reserve0;
        reserveETH = reserve1;
      } else {
        reserveJDFI = reserve1;
        reserveETH = reserve0;
      }

      let uniTotalSupply = await pair.totalSupply.call();

      let initialBalanceJDFIWETHUNIV2S = await instance.balanceOf.call(account);
      let initialBalanceETH = await balance.current(account);
      let initialBalanceJDFI = await jusdefi.balanceOf.call(account);

      // JDFI-WETH-UNI-V2/S balance corresponds to UNI-V2 balance in ratio of 1:1

      let valueETH = reserveETH.mul(initialBalanceJDFIWETHUNIV2S).div(uniTotalSupply);
      let valueJDFI = reserveJDFI.mul(initialBalanceJDFIWETHUNIV2S).div(uniTotalSupply);

      let tx = await instance.unstake(initialBalanceJDFIWETHUNIV2S, valueJDFI, valueETH, { from: account, gasPrice: new BN(1) });

      let finalBalanceJDFIWETHUNIV2S = await instance.balanceOf.call(account);
      let finalBalanceETH = await balance.current(account);
      let finalBalanceJDFI = await jusdefi.balanceOf.call(account);

      let gasUsed = new BN(tx.receipt.gasUsed);

      assert(finalBalanceJDFIWETHUNIV2S.isZero());
      assert(initialBalanceETH.add(valueETH).sub(gasUsed).eq(finalBalanceETH));

      let feePool = await FeePool.at(await jusdefi._feePool.call());
      let fee = await feePool._fee.call();
      let burned = valueJDFI.mul(fee).div(BP_DIVISOR);
      assert(initialBalanceJDFI.add(valueJDFI).sub(burned).eq(finalBalanceJDFI));
    });

    describe('reverts if', function () {
      it('minimum JDFI amount exceeds actual Uniswap output', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        let amountETH = amountJDFI.div(new BN(4));
        await jusdefi.mint(account, amountJDFI);

        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );

        let balance = await instance.balanceOf.call(account);

        await expectRevert(
          instance.unstake(balance, amountJDFI.add(new BN(1)), amountETH, { from: account }),
          'UniswapV2Router: INSUFFICIENT_A_AMOUNT'
        );
      });

      it('minimum ETH amount exceeds actual Uniswap output', async function () {
        let [account] = RECIPIENTS;
        let amountJDFI = new BN(web3.utils.toWei('1'));
        let amountETH = amountJDFI.div(new BN(4));
        await jusdefi.mint(account, amountJDFI);

        await instance.methods['stake(uint256,uint256,uint256)'](
          amountJDFI,
          amountJDFI,
          amountJDFI.div(new BN(4)),
          { from: account, value: amountJDFI.div(new BN(4)) }
        );

        let balance = await instance.balanceOf.call(account);

        await expectRevert(
          instance.unstake(balance, amountJDFI, amountETH.add(new BN(1)), { from: account }),
          'UniswapV2Router: INSUFFICIENT_B_AMOUNT'
        );
      });
    });
  });

  describe('#withdraw', function () {
    it('applies fees and transfers earned rewards to sender', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amountJDFI);

      let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
      await addUniswapLiquidity(account, amountJDFI);
      let amount = await pair.balanceOf.call(account);
      await pair.approve(instance.address, amount, { from: account });

      await instance.methods['stake(uint256)'](amount, { from: account });

      await jusdefi.distributeUNIV2StakingPoolRewards(amount);
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
      let amountJDFI = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amountJDFI);

      let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
      await addUniswapLiquidity(account, amountJDFI);
      let amount = await pair.balanceOf.call(account);
      await pair.approve(instance.address, amount, { from: account });

      await instance.methods['stake(uint256)'](amount, { from: account });

      await jusdefi.distributeUNIV2StakingPoolRewards(amount);

      assert(!(await instance.rewardsOf.call(account)).isZero());
      await instance.withdraw({ from: account });
      assert((await instance.rewardsOf.call(account)).isZero());
    });
  });

  describe('#distributeRewards', function () {
    it('transfers given amount of JDFI from sender and increases rewards for stakers', async function () {
      let [account] = RECIPIENTS;
      let amountJDFI = new BN(web3.utils.toWei('1'));
      await jusdefi.mint(account, amountJDFI.mul(new BN(2)));

      let pair = await IUniswapV2Pair.at(await jusdefi._uniswapPair.call());
      await addUniswapLiquidity(account, amountJDFI);
      let amount = await pair.balanceOf.call(account);
      await pair.approve(instance.address, amount, { from: account });

      await instance.methods['stake(uint256)'](amount, { from: account });

      assert((await instance.rewardsOf.call(account)).isZero());
      await instance.distributeRewards(amountJDFI, { from: account });
      assert(!(await instance.rewardsOf.call(account)).isZero());

      assert((await jusdefi.balanceOf.call(account)).isZero());
    });
  });
});
