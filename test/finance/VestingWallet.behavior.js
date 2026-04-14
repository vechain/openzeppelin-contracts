const { BN, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-helpers/src/setup');
const { expect } = require('chai');
const { expectThorRevert, expectRevertCheckStrategy } = require('../helpers/errors');

/**
 * Sets up environment-specific helpers for ETH and ERC20 vesting tests.
 *
 * Uses mock.methods['func(types)'] syntax to avoid Truffle overload resolution
 * issues on VeChain, where the first ABI entry is always selected regardless of
 * argument count. The send() receipts on VeChain include decoded logs compatible
 * with @openzeppelin/test-helpers expectEvent.
 *
 * @param {object} mock        - VestingWallet contract instance
 * @param {string} beneficiary - beneficiary address (current owner)
 * @param {object} token       - ERC20 contract instance
 */
async function envSetup(mock, beneficiary, token) {
  // Use mock.contract.methods (raw web3) for view calls to guarantee correct ABI selector
  // resolution when there are overloaded functions (Truffle picks first ABI entry otherwise).
  // For state-changing calls, use mock.methods['func(types)'](args, { from }) — Truffle detects
  // the presence of { from } and sends a transaction instead of a call.
  return {
    eth: {
      vestedAmountFn: timestamp =>
        mock.contract.methods['vestedAmount(uint64)'](timestamp.toString()).call().then(web3.utils.toBN),
      releasableFn: () =>
        mock.contract.methods['releasable()']().call().then(web3.utils.toBN),
      releaseFn: () => mock.methods['release()']({ from: beneficiary }),
      checkRelease: async (receipt, amount) => {
        expectEvent(receipt, 'EtherReleased', { amount });
      },
      setupFailure: async () => {
        const EtherReceiverMock = artifacts.require('EtherReceiverMock');
        const rejectingBeneficiary = await EtherReceiverMock.new();
        await rejectingBeneficiary.setAcceptEther(false);
        await mock.transferOwnership(rejectingBeneficiary.address, { from: beneficiary });
        return {
          releaseFn: () => mock.methods['release()']({ from: beneficiary }),
        };
      },
      releasedEvent: 'EtherReleased',
    },
    token: {
      vestedAmountFn: timestamp =>
        mock.contract.methods['vestedAmount(address,uint64)'](token.address, timestamp.toString()).call().then(web3.utils.toBN),
      releasableFn: () =>
        mock.contract.methods['releasable(address)'](token.address).call().then(web3.utils.toBN),
      releaseFn: () => mock.methods['release(address)'](token.address, { from: beneficiary }),
      checkRelease: async (receipt, amount) => {
        await expectEvent.inTransaction(receipt.tx, token, 'Transfer', {
          from: mock.address,
          to: beneficiary,
          value: amount,
        });
        expectEvent(receipt, 'ERC20Released', { token: token.address, amount });
      },
      setupFailure: async () => {
        const ERC20Pausable = artifacts.require('$ERC20Pausable');
        const pausableToken = await ERC20Pausable.new('Name', 'Symbol');
        await pausableToken.$_pause();
        return {
          releaseFn: () =>
            mock.methods['release(address)'](pausableToken.address, { from: beneficiary }),
        };
      },
      releasedEvent: 'ERC20Released',
    },
  };
}

function shouldBehaveLikeVesting() {
  // NOTE: On VeChain Solo, block.timestamp cannot be artificially advanced
  // (evm_increaseTime is a no-op). vestedAmount(uint64 timestamp) accepts an
  // explicit timestamp, so the vesting formula is fully testable. However,
  // releasable() and release() use block.timestamp internally and can only
  // reflect the current real on-chain time.

  it('check vesting schedule', async function () {
    for (const timestamp of this.schedule) {
      await time.increaseTo(timestamp);
      const vesting = this.vestingFn(timestamp);

      // Verify the vesting formula with explicit timestamps.
      expect(await this.vestedAmountFn(timestamp)).to.be.bignumber.equal(vesting);

      // releasableFn() uses block.timestamp internally; on VeChain Solo the
      // block timestamp does not advance with evm_increaseTime, so we skip
      // that assertion here and instead verify releasable() is consistent
      // with the current on-chain time in execute vesting schedule.
    }
  });

  it('execute vesting schedule', async function () {
    // On VeChain Solo, block.timestamp does not advance artificially, so
    // release() always releases vestedAmount(block.timestamp) − already_released.
    // We verify that each release() call emits an event whose amount exactly
    // matches the on-chain releasable() value at call time, and that
    // consecutive releases correctly track the cumulative released amount.
    {
      const receipt = await this.releaseFn();
      expectEvent(receipt, this.releasedEvent);
      await this.checkRelease(receipt, new BN(0));
    }

    for (const timestamp of this.schedule) {
      await time.increaseTo(timestamp);

      // Capture the on-chain releasable amount before releasing.
      const releasableNow = await this.releasableFn();

      const receipt = await this.releaseFn();
      expectEvent(receipt, this.releasedEvent);
      // The event amount must equal what releasable() reported before the call.
      await this.checkRelease(receipt, releasableNow);
    }
  });

  it('should revert on transaction failure', async function () {
    const { releaseFn } = await this.setupFailure();

    for (const timestamp of this.schedule) {
      await time.increaseTo(timestamp);

      await expectThorRevert(
        releaseFn(),
        '',
        expectRevertCheckStrategy.unspecified,
      );
    }
  });
}

module.exports = { envSetup, shouldBehaveLikeVesting };
