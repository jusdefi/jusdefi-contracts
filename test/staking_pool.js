const {
  BN,
} = require('@openzeppelin/test-helpers');

const StakingPool = artifacts.require('StakingPoolMock');

contract('JDFIStakingPool', function (accounts) {
  let instance;

  const SCALER = new BN(web3.utils.toWei('1'));

  beforeEach(async function () {
    instance = await StakingPool.new();
  });

  describe('#_scaledRewardsOf', function () {
    it('returns undistributed rewards of given user scaled by 1e18', async function () {
      let holders = accounts.slice(0, 3);

      let amount = new BN(web3.utils.toWei('1'));

      for (let holder of holders) {
        // mint amount is arbitrary; holders receive equal amounts
        await instance.mint(holder, amount);
        assert((await instance.scaledRewardsOf.call(holder)).isZero());
      }

      await instance.accrueRewards(amount);

      let expected = amount.div(new BN(holders.length)).mul(SCALER);

      for (let holder of holders) {
        assert((await instance.scaledRewardsOf.call(holder)).eq(expected));
      }
    });
  });

  describe('#_accrueRewards', function () {
    it('allocates rewards proportionally to stakers', async function () {
      let holders = accounts.slice(0, 3);
      let amounts = [1, 2, 3].map(n => new BN(web3.utils.toWei(n.toString())));

      for (let i = 0; i < holders.length; i++) {
        await instance.mint(holders[i], amounts[i]);
      }

      await instance.accrueRewards(amounts.reduce((acc, cur) => acc.add(cur), new BN(0)));

      for (let holder of holders) {
        let balance = await instance.balanceOf.call(holder);
        let rewards = (await instance.scaledRewardsOf.call(holder)).div(SCALER);
        assert(balance.eq(rewards));
      }
    });
  });

  describe('#_deductRewards', function () {
    it('marks rewards of given user as distributed', async function () {
      let [holder] = accounts;
      let amount = new BN(web3.utils.toWei('1'));

      await instance.mint(holder, amount);
      await instance.accrueRewards(amount);

      assert(!(await instance.scaledRewardsOf.call(holder)).isZero());
      await instance.deductRewards(holder);
      assert((await instance.scaledRewardsOf.call(holder)).isZero());
    });
  });
});
