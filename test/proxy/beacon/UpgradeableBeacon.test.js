const { expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { expectRevertCustomError } = require('../../helpers/customError');
const { expectThorRevert, expectRevertCheckStrategy } = require('../../helpers/errors.js');
const UpgradeableBeacon = artifacts.require('UpgradeableBeacon');
const Implementation1 = artifacts.require('Implementation1');
const Implementation2 = artifacts.require('Implementation2');

contract('UpgradeableBeacon', function (accounts) {
  const [owner, other] = accounts;

  it('cannot be created with non-contract implementation', async function () {
    await expectThorRevert(UpgradeableBeacon.new(other, owner), "", expectRevertCheckStrategy.unspecified);
  });

  context('once deployed', async function () {
    beforeEach('deploying beacon', async function () {
      this.v1 = await Implementation1.new();
      this.beacon = await UpgradeableBeacon.new(this.v1.address, owner);
    });

    it('emits Upgraded event to the first implementation', async function () {
      const beacon = await UpgradeableBeacon.new(this.v1.address, owner);
      await expectEvent.inTransaction(beacon.contract.transactionHash, beacon, 'Upgraded', {
        implementation: this.v1.address,
      });
    });

    it('returns implementation', async function () {
      expect(await this.beacon.implementation()).to.equal(this.v1.address);
    });

    it('can be upgraded by the owner', async function () {
      const v2 = await Implementation2.new();
      const receipt = await this.beacon.upgradeTo(v2.address, { from: owner });
      expectEvent(receipt, 'Upgraded', { implementation: v2.address });
      expect(await this.beacon.implementation()).to.equal(v2.address);
    });

    it('cannot be upgraded to a non-contract', async function () {
      await expectRevert.unspecified(this.beacon.upgradeTo(other, { from: owner }));
    });

    it('cannot be upgraded by other account', async function () {
      const v2 = await Implementation2.new();
      await expectRevert.unspecified(this.beacon.upgradeTo(v2.address, { from: other }));
    });
  });
});
