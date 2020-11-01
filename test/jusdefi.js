const {
  BN,
  constants,
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const AirdropToken = artifacts.require('AirdropToken');
const JusDeFi = artifacts.require('JusDeFiMock');
const FeePool = artifacts.require('FeePool');
const JDFIStakingPool = artifacts.require('JDFIStakingPool');
const DevStakingPool = artifacts.require('DevStakingPool');
const UNIV2StakingPool = artifacts.require('UNIV2StakingPool');
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair');
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02');

contract('JusDeFi', function (accounts) {
  const [NOBODY, DEPLOYER, DEPOSITOR] = accounts;

  const BP_DIVISOR = new BN(10000);

  let airdropToken;
  let instance;
  let devStakingPool;
  let jdfiStakingPool;
  let univ2StakingPool;

  let closeLiquidityEvent = async function () {
    await time.increaseTo(await instance._liquidityEventClosedAt.call());
    await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('1')) });
    await instance.liquidityEventClose();
  };

  beforeEach(async function () {
    airdropToken = await AirdropToken.new({ from: DEPLOYER });
    instance = await JusDeFi.new(airdropToken.address, uniswapRouter, { from: DEPLOYER });
    devStakingPool = await DevStakingPool.at(await instance._devStakingPool.call());
    jdfiStakingPool = await JDFIStakingPool.at(await instance._jdfiStakingPool.call());
    univ2StakingPool = await UNIV2StakingPool.at(await instance._univ2StakingPool.call());
    await airdropToken.setJDFIStakingPool(jdfiStakingPool.address, { from: DEPLOYER });
  });

  describe('constructor', function () {
    it('deploys staking pools', async function () {
      assert(web3.utils.isAddress(jdfiStakingPool.address));
      assert.notEqual(jdfiStakingPool.address, constants.ZERO_ADDRESS);

      assert(web3.utils.isAddress(univ2StakingPool.address));
      assert.notEqual(univ2StakingPool.address, constants.ZERO_ADDRESS);
    });

    it('mints and stakes team reserve and transfers to sender', async function () {
      let balance = await jdfiStakingPool.balanceOf.call(DEPLOYER);
      assert(balance.eq(new BN(web3.utils.toWei('2000'))));
    });

    it('mints and stakes liquidity event reserve', async function () {
      let balance = await jdfiStakingPool.balanceOf.call(instance.address);
      assert(balance.eq(new BN(web3.utils.toWei('10000'))));
    });

    it('mints justice reserve', async function () {
      let balance = await instance.balanceOf.call(airdropToken.address);
      assert(balance.eq(new BN(web3.utils.toWei('10000'))));
    });

    it('transfers JDFI/E to sender', async function () {
      let balance = await devStakingPool.balanceOf.call(DEPLOYER);
      assert(balance.eq(new BN(web3.utils.toWei('10000'))));
    });
  });

  describe('#name', function () {
    it('returns "JusDeFi"', async function () {
      assert.equal(await instance.name.call(), 'JusDeFi');
    });
  });

  describe('#symbol', function () {
    it('returns "JDFI"', async function () {
      assert.equal(await instance.symbol.call(), 'JDFI');
    });
  });

  describe('#consult', function () {
    it('returns average JDFI output for given ETH amount over last oracle period', async function () {
      let router = await IUniswapV2Router02.at(uniswapRouter);
      let value = new BN(web3.utils.toWei('1'));

      await closeLiquidityEvent();

      let initialPrice = await instance.consult.call(value);

      await router.swapExactETHForTokens(
        new BN(0),
        [await router.WETH.call(), instance.address],
        NOBODY,
        constants.MAX_UINT256,
        { from: NOBODY, value }
      );

      let intermediatePrice = await instance.consult.call(value);

      await time.increase(60 * 6);

      await router.swapExactETHForTokens(
        new BN(0),
        [await router.WETH.call(), instance.address],
        NOBODY,
        constants.MAX_UINT256,
        { from: NOBODY, value }
      );

      let finalPrice = await instance.consult.call(value);

      assert(intermediatePrice.eq(initialPrice));
      assert(finalPrice.gt(initialPrice));
    });

    it('returns zero if oracle period has elapsed since last update', async function () {
      let router = await IUniswapV2Router02.at(uniswapRouter);
      let value = new BN(web3.utils.toWei('1'));

      assert((await instance.consult.call(value)).isZero());

      await closeLiquidityEvent();
      await time.increase(60 * 6);

      await router.swapExactETHForTokens(
        new BN(0),
        [await router.WETH.call(), instance.address],
        NOBODY,
        constants.MAX_UINT256,
        { from: NOBODY, value }
      );

      assert(!(await instance.consult.call(value)).isZero());
      await time.increase(60 * 6);
      assert((await instance.consult.call(value)).isZero());
    });
  });

  describe('#transfer', function () {
    describe('reverts if', function () {
      it('liquidity event is still in progress', async function () {
        await expectRevert(
          instance.transfer(NOBODY, new BN(0), { from: DEPLOYER }),
          'JusDeFi: liquidity event still in progress'
        );
      });
    });
  });

  describe('#transferFrom', function () {
    it('does not require approval for Uniswap Router', async function () {
      await closeLiquidityEvent();

      let router = await IUniswapV2Router02.at(uniswapRouter);

      let value = new BN(web3.utils.toWei('1'));
      await instance.mint(NOBODY, value.mul(new BN(4)));

      assert((await instance.allowance.call(NOBODY, uniswapRouter)).isZero());

      // no revert
      await router.addLiquidityETH(
        instance.address,
        value.mul(new BN(4)),
        value.mul(new BN(4)),
        value,
        NOBODY,
        constants.MAX_UINT256,
        { from: NOBODY, value }
      );
    });

    describe('reverts if', function () {
      it('liquidity event is still in progress', async function () {
        await expectRevert(
          instance.transferFrom(DEPLOYER, DEPLOYER, new BN(0), { from: DEPLOYER }),
          'JusDeFi: liquidity event still in progress'
        );
      });
    });
  });

  describe('#burn', function () {
    it('burns given amount of tokens held by sender', async function () {
      await closeLiquidityEvent();

      let amount = new BN(web3.utils.toWei('1'));
      await instance.mint(NOBODY, amount);

      await instance.burn(amount, { from: NOBODY });
      assert((await instance.balanceOf.call(NOBODY)).isZero());
    });
  });

  describe('#burnAndTransfer', function () {
    it('applies current fee before transfer', async function () {
      await closeLiquidityEvent();

      let amount = new BN(web3.utils.toWei('1'));
      await instance.mint(NOBODY, amount);

      await instance.burnAndTransfer(NOBODY, amount, { from: NOBODY });

      let feePool = await FeePool.at(await instance._feePool.call());
      let fee = await feePool._fee.call();
      assert((await instance.balanceOf.call(NOBODY)).eq(amount.sub(amount.mul(new BN(fee)).div(BP_DIVISOR))));
    });
  });

  describe('#liquidityEventDeposit', function () {
    it('transfers JDFI/S to depositor in exchange for ETH at a ratio of 4:1', async function () {
      let value = new BN(1);

      let initialBalance = await jdfiStakingPool.balanceOf.call(DEPOSITOR);
      await instance.liquidityEventDeposit({ from: DEPOSITOR, value });
      let finalBalance = await jdfiStakingPool.balanceOf.call(DEPOSITOR);

      assert(finalBalance.sub(initialBalance).eq(value.mul(new BN(4))));
    });

    it('accepts deposits if liquidity event period has ended but #liquidityEventClose has not been called', async function () {
      await time.increaseTo((await instance._liquidityEventClosedAt.call()).add(new BN(1)));
      // no revert
      await instance.liquidityEventDeposit({ from: DEPOSITOR });
    });

    describe('reverts if', function () {
      it('liquidity event has been closed', async function () {
        await closeLiquidityEvent();

        await expectRevert(
          instance.liquidityEventDeposit({ from: DEPOSITOR }),
          'JusDeFi: liquidity event has closed'
        );
      });

      it('liquidity event cap has been reached', async function () {
        // cap denominated here in ETH
        let cap = new BN(web3.utils.toWei('2500'));

        await expectRevert(
          instance.liquidityEventDeposit({ from: DEPOSITOR, value: cap.add(new BN(1)) }),
          'JusDeFi: deposit amount surpasses available supply'
        );

        await instance.liquidityEventDeposit({ from: DEPOSITOR, value: cap });

        await expectRevert(
          instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(1) }),
          'JusDeFi: deposit amount surpasses available supply'
        );
      });
    });
  });

  describe('#liquidityEventClose', function () {
    it('adds JDFI and deposited ETH to Uniswap at a ratio of 4:1', async function () {
      await closeLiquidityEvent();

      let pair = await IUniswapV2Pair.at(await instance._uniswapPair.call());
      let { reserve0, reserve1 } = await pair.getReserves();

      let reserveJDFI, reserveETH;

      if (reserve0.gt(reserve1)) {
        reserveJDFI = reserve0;
        reserveETH = reserve1;
      } else {
        reserveJDFI = reserve1;
        reserveETH = reserve0;
      }

      assert(reserveETH.mul(new BN(4)).eq(reserveJDFI));

      let uniBalance = await pair.balanceOf.call(await instance._feePool.call());
      let uniTotalSupply = await pair.totalSupply.call();

      assert(uniBalance.add(await pair.MINIMUM_LIQUIDITY.call()).eq(uniTotalSupply));
    });

    it('burns undistributed JDFI', async function () {
      let value = new BN(web3.utils.toWei('1'));
      await time.increaseTo(await instance._liquidityEventClosedAt.call());
      await instance.liquidityEventDeposit({ from: DEPOSITOR, value });

      let initialSupply = await instance.totalSupply.call();
      await instance.liquidityEventClose();
      let finalSupply = await instance.totalSupply.call();

      // account for amount not burned, as well as amount minted to match
      let burned = new BN(web3.utils.toWei('10000')).sub(value.mul(new BN(8)));
      // account for minted rewards pool seed
      let minted = new BN(web3.utils.toWei('2000'));

      assert(initialSupply.add(minted).sub(burned).eq(finalSupply));
    });

    it('deploys fee pool', async function () {
      await closeLiquidityEvent();
      assert(web3.utils.isAddress(await instance._feePool.call()));
      assert.notEqual(await instance._feePool.call(), constants.ZERO_ADDRESS);
    });

    it('mints staking pool seed', async function () {
      await closeLiquidityEvent();
      assert((await instance.balanceOf.call(await instance._feePool.call())).eq(new BN(web3.utils.toWei('2000'))));
    });

    describe('reverts if', function () {
      it('liquidity event is still in progress', async function () {
        await expectRevert(
          instance.liquidityEventClose(),
          'JusDeFi: liquidity event still in progress'
        );
      });

      it('insufficient ETH has been deposited', async function () {
        await time.increaseTo(await instance._liquidityEventClosedAt.call());
        await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('0.25')).sub(new BN(1)) });

        await expectRevert(
          instance.liquidityEventClose(),
          'JusDeFi: insufficient liquidity added'
        );
      });

      it('liquidity event has already been closed', async function () {
        await closeLiquidityEvent();

        await expectRevert(
          instance.liquidityEventClose(),
          'JusDeFi: liquidity event has already ended'
        );
      });
    });
  });
});
