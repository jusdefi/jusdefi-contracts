const {
  BN,
  constants,
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const {
  uniswapRouter,
} = require('../data/addresses.js');

const JusDeFi = artifacts.require('JusDeFiMock');
const JDFIStakingPool = artifacts.require('JDFIStakingPool');
const UniswapStakingPool = artifacts.require('UniswapStakingPool');
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair');

contract('JusDeFi', function (accounts) {
  const [NOBODY, DEPLOYER, DEPOSITOR] = accounts;

  const BP_DIVISOR = new BN(10000);

  let instance;
  let jdfiStakingPool;
  let uniswapStakingPool;

  beforeEach(async function () {
    instance = await JusDeFi.new(uniswapRouter, { from: DEPLOYER });
    jdfiStakingPool = await JDFIStakingPool.at(await instance._jdfiStakingPool.call());
    uniswapStakingPool = await UniswapStakingPool.at(await instance._uniswapStakingPool.call());
  });

  describe('constructor', function () {
    it('deploys staking pools', async function () {
      assert(web3.utils.isAddress(jdfiStakingPool.address));
      assert.notEqual(jdfiStakingPool.address, constants.ZERO_ADDRESS);

      assert(web3.utils.isAddress(uniswapStakingPool.address));
      assert.notEqual(uniswapStakingPool.address, constants.ZERO_ADDRESS);
    });

    it('mints and stakes team reserve and justice reserve and transfers to sender', async function () {
      let balance = await jdfiStakingPool.balanceOf.call(DEPLOYER);
      assert(balance.eq(new BN(web3.utils.toWei('12000'))));
    });

    it('mints and stakes liquidity event reserve', async function () {
      let balance = await jdfiStakingPool.balanceOf.call(instance.address);
      assert(balance.eq(new BN(web3.utils.toWei('10000'))));
    });

    it('mints staking pool seed', async function () {
      assert((await instance.balanceOf.call(instance.address)).eq(new BN(web3.utils.toWei('2000'))));
    });

    it('approves Uniswap Router to spend JDFI held by UniswapStakingPool', async function () {
      assert((
        await instance.allowance.call(uniswapStakingPool.address, uniswapRouter)
      ).eq(constants.MAX_UINT256));
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
    describe('reverts if', function () {
      it('liquidity event is still in progress', async function () {
        await expectRevert(
          instance.transferFrom(DEPLOYER, DEPLOYER, new BN(0), { from: DEPLOYER }),
          'JusDeFi: liquidity event still in progress'
        );
      });
    });
  });

  describe('#burnAndTransfer', function () {
    it('applies current fee before transfer', async function () {
      await time.increaseTo(await instance._liquidityEventClosedAt.call());
      await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('1')) });
      await instance.liquidityEventClose();

      let amount = new BN(web3.utils.toWei('1'));
      await instance.mint(NOBODY, amount);

      await instance.burnAndTransfer(NOBODY, amount, { from: NOBODY });

      assert((await instance.balanceOf.call(NOBODY)).eq(amount.sub(amount.mul(new BN(750)).div(BP_DIVISOR))));
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
        await time.increaseTo(await instance._liquidityEventClosedAt.call());

        await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('1')) });
        await instance.liquidityEventClose();

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
      await time.increaseTo(await instance._liquidityEventClosedAt.call());
      await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('1')) });
      await instance.liquidityEventClose();

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

      let uniBalance = await pair.balanceOf.call(instance.address);
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
      assert(initialSupply.sub(burned).eq(finalSupply));
    });

    it('sets initial fee to 7.5%', async function () {
      let value = new BN(web3.utils.toWei('1'));
      await time.increaseTo(await instance._liquidityEventClosedAt.call());
      await instance.liquidityEventDeposit({ from: DEPOSITOR, value });

      assert((await instance._fee.call()).eq(new BN(0)));
      await instance.liquidityEventClose();
      assert((await instance._fee.call()).eq(new BN(750)));
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
        await time.increaseTo(await instance._liquidityEventClosedAt.call());
        await instance.liquidityEventDeposit({ from: DEPOSITOR, value: new BN(web3.utils.toWei('1')) });
        await instance.liquidityEventClose();

        await expectRevert(
          instance.liquidityEventClose(),
          'JusDeFi: liquidity event has already ended'
        );
      });
    });
  });
});
