const { constants } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect } = require('chai');
const { BNmin } = require('../helpers/math');
const { expectThorRevert, expectRevertCheckStrategy } = require('../helpers/errors.js');
const time = require('../helpers/time');

const { envSetup, shouldBehaveLikeVesting } = require('./VestingWallet.behavior');

const VestingWallet = artifacts.require('VestingWallet');
const ERC20 = artifacts.require('$ERC20');

contract('VestingWallet', function (accounts) {
  const [sender, beneficiary] = accounts;

  const amount = web3.utils.toBN(web3.utils.toWei('100'));
  const duration = web3.utils.toBN(4 * 365 * 86400); // 4 years

  beforeEach(async function () {
    this.start = (await time.clock.timestamp()).addn(3600); // in 1 hour
    this.mock = await VestingWallet.new(beneficiary, this.start, duration);
    this.beneficiary = beneficiary;
  });

  it('rejects zero address for beneficiary', async function () {
    await expectThorRevert(
      VestingWallet.new(constants.ZERO_ADDRESS, this.start, duration),
      '',
      expectRevertCheckStrategy.unspecified,
    );
  });

  it('check vesting contract', async function () {
    expect(await this.mock.owner()).to.equal(beneficiary);
    expect(await this.mock.start()).to.be.bignumber.equal(this.start);
    expect(await this.mock.duration()).to.be.bignumber.equal(duration);
    expect(await this.mock.end()).to.be.bignumber.equal(this.start.add(duration));
  });

  describe('vesting schedule', function () {
    beforeEach(async function () {
      this.schedule = Array(64)
        .fill()
        .map((_, i) => web3.utils.toBN(i).mul(duration).divn(60).add(this.start));
      this.vestingFn = timestamp => BNmin(amount, amount.mul(timestamp.sub(this.start)).div(duration));

      this.token = await ERC20.new('Name', 'Symbol');
      await this.token.$_mint(this.mock.address, amount);
      this.env = await envSetup(this.mock, beneficiary, this.token);
    });

    describe('Eth vesting', function () {
      beforeEach(async function () {
        await web3.eth.sendTransaction({ from: sender, to: this.mock.address, value: amount });
        Object.assign(this, this.env.eth);
      });

      shouldBehaveLikeVesting();
    });

    describe('ERC20 vesting', function () {
      beforeEach(async function () {
        Object.assign(this, this.env.token);
      });

      shouldBehaveLikeVesting();
    });
  });
});
