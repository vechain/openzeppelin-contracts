const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { selector } = require('../../helpers/methods');

const AccessManaged = artifacts.require('$AccessManagedTarget');
const AccessManager = artifacts.require('$AccessManager');

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
    });
  });

  describe('setAuthority', function () {
    beforeEach(async function () {
      this.newAuthority = await AccessManager.new(admin);
    });

    it('reverts if the caller is not the authority', async function () {
      await expectRevert.unspecified(this.managed.setAuthority(other, { from: other }));
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
