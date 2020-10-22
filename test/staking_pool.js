const {
  BN,
} = require('@openzeppelin/test-helpers');

const StakingPool = artifacts.require('StakingPoolMock');

contract('JDFIStakingPool', function (accounts) {
  let instance;

  beforeEach(async function () {
    instance = await StakingPool.new();
  });

  describe('#transfer', function () {
    it('does not transfer rewards', async function () {
      let [from, to] = accounts;
      let amount = new BN(web3.utils.toWei('1'));
      await instance.mint(from, amount);
      await instance.distributeRewards(amount);

      let initialRewardsOfFrom = await instance.rewardsOf.call(from);
      let initialRewardsOfTo = await instance.rewardsOf.call(to);
      await instance.transfer(to, amount, { from });
      let finalRewardsOfFrom = await instance.rewardsOf.call(from);
      let finalRewardsOfTo = await instance.rewardsOf.call(to);

      assert(initialRewardsOfFrom.eq(finalRewardsOfFrom));
      assert(initialRewardsOfTo.eq(finalRewardsOfTo));
    });
  });

  describe('#transferFrom', function () {
    it('does not transfer rewards', async function () {
      let [from, to] = accounts;
      let amount = new BN(web3.utils.toWei('1'));
      await instance.mint(from, amount);
      await instance.distributeRewards(amount);

      await instance.approve(to, amount, { from });

      let initialRewardsOfFrom = await instance.rewardsOf.call(from);
      let initialRewardsOfTo = await instance.rewardsOf.call(to);
      await instance.transferFrom(from, to, amount, { from: to });
      let finalRewardsOfFrom = await instance.rewardsOf.call(from);
      let finalRewardsOfTo = await instance.rewardsOf.call(to);

      assert(initialRewardsOfFrom.eq(finalRewardsOfFrom));
      assert(initialRewardsOfTo.eq(finalRewardsOfTo));
    });
  });

  describe('#rewardsOf', function () {
    it('returns accumulated rewards withdrawable by given account', async function () {
      let amount = new BN(web3.utils.toWei('1'));
      let [from, to] = accounts;
      await instance.mint(from, amount);

      assert((await instance.rewardsOf.call(from)).isZero());

      await instance.distributeRewards(amount);

      assert((await instance.rewardsOf.call(from)).eq(amount));

      await instance.transfer(to, amount, { from });

      assert((await instance.rewardsOf.call(from)).eq(amount));
      assert((await instance.rewardsOf.call(to)).isZero());

      await instance.distributeRewards(amount);

      assert((await instance.rewardsOf.call(from)).eq(amount));
      assert((await instance.rewardsOf.call(to)).eq(amount));
    });
  });

  describe('#_distributeRewards', function () {
    it('allocates rewards proportionally to stakers', async function () {
      let holders = accounts.slice(0, 3);
      let amounts = [1, 2, 3].map(n => new BN(web3.utils.toWei(n.toString())));

      for (let i = 0; i < holders.length; i++) {
        await instance.mint(holders[i], amounts[i]);
      }

      await instance.distributeRewards(amounts.reduce((acc, cur) => acc.add(cur), new BN(0)));

      for (let holder of holders) {
        let balance = await instance.balanceOf.call(holder);
        let rewards = await instance.rewardsOf.call(holder);
        assert(balance.eq(rewards));
      }
    });
  });

  describe('#_clearRewards', function () {
    it('removes pending rewards associated with given account', async function () {
      let amount = new BN(web3.utils.toWei('1'));
      let [holder] = accounts;
      await instance.mint(holder, amount);
      await instance.distributeRewards(amount);

      assert(!(await instance.rewardsOf.call(holder)).isZero());
      await instance.clearRewards(holder);
      assert((await instance.rewardsOf.call(holder)).isZero());
    });
  });
});
