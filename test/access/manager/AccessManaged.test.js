const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { selector } = require('../../helpers/methods');
const { latest } = require('../../helpers/utils');

const AccessManaged = artifacts.require('$AccessManagedTarget');
const AccessManager = artifacts.require('$AccessManager');
const AuthorityNoDelayMock = artifacts.require('AuthorityNoDelayMock');

const AuthoritiyObserveIsConsuming = artifacts.require('$AuthoritiyObserveIsConsuming');

contract('AccessManaged', function (accounts) {
  const [admin, roleMember, other] = accounts;

  beforeEach(async function () {
    this.authority = await AccessManager.new(admin);
    this.managed = await AccessManaged.new(this.authority.address);
  });

  it('sets authority and emits AuthorityUpdated event during construction', async function () {
    await expectEvent.inConstruction(this.managed, 'AuthorityUpdated', {
      authority: this.authority.address,
    });
    expect(await this.managed.authority()).to.eq(this.authority.address);
  });

  describe('restricted modifier', function () {
    const method = 'fnRestricted()';

    beforeEach(async function () {
      this.selector = selector(method);
      this.role = web3.utils.toBN(42);
      await this.authority.$_setTargetFunctionRole(this.managed.address, this.selector, this.role);
      await this.authority.$_grantRole(this.role, roleMember, 0, 0);
    });

    it('succeeds when role is granted without execution delay', async function () {
      await this.managed.methods[method]({ from: roleMember });
    });

    it('reverts when role is not granted', async function () {
      await expectRevert.unspecified(this.managed.methods[method]({ from: other }));
    });

    it('panics in short calldata', async function () {
      // We avoid adding the `restricted` modifier to the fallback function because other tests may depend on it
      // being accessible without restrictions. We check for the internal `_checkCanCall` instead.
      await expectRevert.unspecified(this.managed.$_checkCanCall(other, '0x1234'));
    });

    describe('when role is granted with execution delay', function () {
      beforeEach(async function () {
        const executionDelay = web3.utils.toBN(911);
        await this.authority.$_grantRole(this.role, roleMember, 0, executionDelay);
      });

      it('reverts if the operation is not scheduled', async function () {
        const calldata = await this.managed.contract.methods[method]().encodeABI();

        await expectRevert.unspecified(this.managed.methods[method]({ from: roleMember }));
      });

      it('succeeds if the operation is scheduled', async function () {
        const hre = require('hardhat');
        const calldata = await this.managed.contract.methods[method]().encodeABI();

        if (hre.network.name === 'vechain') {
          // VeChain: evm_increaseTime does not advance block timestamps (uses real wall-clock time).
          // Revoke and re-grant with a short execution delay, then wait for real time to pass.
          // (Simply reducing the delay via re-grant takes `oldDelay - newDelay` seconds to take effect.)
          const shortDelay = 2; // seconds
          await this.authority.$_revokeRole(this.role, roleMember);
          await this.authority.$_grantRole(this.role, roleMember, 0, shortDelay);
          // Schedule with when=0 to use the minimum allowed timepoint (now + shortDelay).
          await this.authority.schedule(this.managed.address, calldata, 0, { from: roleMember });
          // Wait for the execution delay to pass, plus buffer for block timestamp propagation.
          await new Promise(resolve => setTimeout(resolve, (shortDelay + 3) * 1000));
        } else {
          const delay = time.duration.hours(12);
          const scheduledAt = (await latest()).addn(1);
          const when = scheduledAt.add(delay);
          await time.increaseTo(scheduledAt);
          await this.authority.schedule(this.managed.address, calldata, when, { from: roleMember });
          await time.increaseTo(when);
        }

        await this.managed.methods[method]({ from: roleMember });
      });
    });
  });

  describe('setAuthority', function () {
    beforeEach(async function () {
      // Use AuthorityNoDelayMock (with forwardCall) so the authority contract can initiate calls
      // without needing account impersonation (not supported on VeChain Thor).
      this.forwardingAuthority = await AuthorityNoDelayMock.new();
      this.managedAlt = await AccessManaged.new(this.forwardingAuthority.address);
      this.newAuthority = await AccessManager.new(admin);
    });

    it('reverts if the caller is not the authority', async function () {
      await expectRevert.unspecified(this.managedAlt.setAuthority(other, { from: other }));
    });

    it('reverts if the new authority is not a valid authority', async function () {
      const calldata = this.managedAlt.contract.methods.setAuthority(other).encodeABI();
      await expectRevert.unspecified(
        this.forwardingAuthority.forwardCall(this.managedAlt.address, calldata),
      );
    });

    it('sets authority and emits AuthorityUpdated event', async function () {
      const calldata = this.managedAlt.contract.methods.setAuthority(this.newAuthority.address).encodeABI();
      const receipt = await this.forwardingAuthority.forwardCall(this.managedAlt.address, calldata);
      await expectEvent.inTransaction(receipt.tx, this.managedAlt, 'AuthorityUpdated', {
        authority: this.newAuthority.address,
      });
      expect(await this.managedAlt.authority()).to.equal(this.newAuthority.address);
    });
  });

  describe('isConsumingScheduledOp', function () {
    beforeEach(async function () {
      this.authority = await AuthoritiyObserveIsConsuming.new();
      this.managed = await AccessManaged.new(this.authority.address);
    });

    it('returns bytes4(0) when not consuming operation', async function () {
      expect(await this.managed.isConsumingScheduledOp()).to.eq('0x00000000');
    });

    it('returns isConsumingScheduledOp selector when consuming operation', async function () {
      const receipt = await this.managed.fnRestricted({ from: other });
      await expectEvent.inTransaction(receipt.tx, this.authority, 'ConsumeScheduledOpCalled', {
        caller: other,
        data: this.managed.contract.methods.fnRestricted().encodeABI(),
        isConsuming: selector('isConsumingScheduledOp()'),
      });
    });
  });
});
