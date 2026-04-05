const { expectEvent } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { expectThorRevert, expectRevertCheckStrategy } = require('../../helpers/errors.js');
const { getAddressInSlot, ImplementationSlot, AdminSlot, BeaconSlot } = require('../../helpers/erc1967');

const ERC1967Utils = artifacts.require('$ERC1967Utils');
const DummyImplementation = artifacts.require('DummyImplementation');
const CallReceiverMock = artifacts.require('CallReceiverMock');
const UpgradeableBeaconMock = artifacts.require('UpgradeableBeaconMock');
const UpgradeableBeaconReentrantMock = artifacts.require('UpgradeableBeaconReentrantMock');

// Note: hardhat-network-helpers setStorageAt/getStorageAt don't work on VeChain solo.
// We use $upgradeToAndCall/$changeAdmin/$upgradeBeaconToAndCall to write slots, and
// web3.eth.getStorageAt (via erc1967.js) to read them.

contract('ERC1967Utils', function (accounts) {
  const [, admin, anotherAccount] = accounts;

  beforeEach('setup', async function () {
    this.utils = await ERC1967Utils.new();
    this.v1 = await DummyImplementation.new();
    this.v2 = await CallReceiverMock.new();
  });

  describe('IMPLEMENTATION_SLOT', function () {
    beforeEach('set v1 implementation via upgradeToAndCall', async function () {
      await this.utils.$upgradeToAndCall(this.v1.address, '0x');
    });

    describe('getImplementation', function () {
      it('returns current implementation and matches implementation slot value', async function () {
        expect(await this.utils.$getImplementation()).to.equal(this.v1.address);
        expect(await getAddressInSlot(this.utils, ImplementationSlot)).to.equal(this.v1.address);
      });
    });

    describe('upgradeToAndCall', function () {
      it('sets implementation in storage and emits event', async function () {
        const newImplementation = this.v2;
        const receipt = await this.utils.$upgradeToAndCall(newImplementation.address, '0x');

        expect(await getAddressInSlot(this.utils, ImplementationSlot)).to.equal(newImplementation.address);
        expectEvent(receipt, 'Upgraded', { implementation: newImplementation.address });
      });

      it('reverts when implementation does not contain code', async function () {
        await expectThorRevert(
          this.utils.$upgradeToAndCall(anotherAccount, '0x'),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      describe('when data is empty', function () {
        it('reverts when value is sent', async function () {
          await expectThorRevert(
            this.utils.$upgradeToAndCall(this.v2.address, '0x', { value: 1 }),
            '',
            expectRevertCheckStrategy.unspecified,
          );
        });
      });

      describe('when data is not empty', function () {
        it('delegates a call to the new implementation', async function () {
          const initializeData = this.v2.contract.methods.mockFunction().encodeABI();
          const receipt = await this.utils.$upgradeToAndCall(this.v2.address, initializeData);
          await expectEvent.inTransaction(receipt.tx, CallReceiverMock, 'MockFunctionCalled');
        });
      });
    });
  });

  describe('ADMIN_SLOT', function () {
    beforeEach('set admin via changeAdmin', async function () {
      await this.utils.$changeAdmin(admin);
    });

    describe('getAdmin', function () {
      it('returns current admin and matches admin slot value', async function () {
        expect(await this.utils.$getAdmin()).to.equal(admin);
        expect(await getAddressInSlot(this.utils, AdminSlot)).to.equal(admin);
      });
    });

    describe('changeAdmin', function () {
      it('sets admin in storage and emits event', async function () {
        const newAdmin = anotherAccount;
        const receipt = await this.utils.$changeAdmin(newAdmin);

        expect(await getAddressInSlot(this.utils, AdminSlot)).to.equal(newAdmin);
        expectEvent(receipt, 'AdminChanged', { previousAdmin: admin, newAdmin });
      });

      it('reverts when setting the address zero as admin', async function () {
        await expectThorRevert(
          this.utils.$changeAdmin('0x0000000000000000000000000000000000000000'),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });
    });
  });

  describe('BEACON_SLOT', function () {
    beforeEach('set beacon via upgradeBeaconToAndCall', async function () {
      this.beacon = await UpgradeableBeaconMock.new(this.v1.address);
      await this.utils.$upgradeBeaconToAndCall(this.beacon.address, '0x');
    });

    describe('getBeacon', function () {
      it('returns current beacon and matches beacon slot value', async function () {
        expect(await this.utils.$getBeacon()).to.equal(this.beacon.address);
        expect(await getAddressInSlot(this.utils, BeaconSlot)).to.equal(this.beacon.address);
      });
    });

    describe('upgradeBeaconToAndCall', function () {
      it('sets beacon in storage and emits event', async function () {
        const newBeacon = await UpgradeableBeaconMock.new(this.v2.address);
        const receipt = await this.utils.$upgradeBeaconToAndCall(newBeacon.address, '0x');

        expect(await getAddressInSlot(this.utils, BeaconSlot)).to.equal(newBeacon.address);
        expectEvent(receipt, 'BeaconUpgraded', { beacon: newBeacon.address });
      });

      it('reverts when beacon does not contain code', async function () {
        await expectThorRevert(
          this.utils.$upgradeBeaconToAndCall(anotherAccount, '0x'),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      it("reverts when beacon's implementation does not contain code", async function () {
        const newBeacon = await UpgradeableBeaconMock.new(anotherAccount);
        await expectThorRevert(
          this.utils.$upgradeBeaconToAndCall(newBeacon.address, '0x'),
          '',
          expectRevertCheckStrategy.unspecified,
        );
      });

      describe('when data is empty', function () {
        it('reverts when value is sent', async function () {
          const newBeacon = await UpgradeableBeaconMock.new(this.v2.address);
          await expectThorRevert(
            this.utils.$upgradeBeaconToAndCall(newBeacon.address, '0x', { value: 1 }),
            '',
            expectRevertCheckStrategy.unspecified,
          );
        });
      });

      describe('when data is not empty', function () {
        it('delegates a call to the new implementation', async function () {
          const initializeData = this.v2.contract.methods.mockFunction().encodeABI();
          const newBeacon = await UpgradeableBeaconMock.new(this.v2.address);
          const receipt = await this.utils.$upgradeBeaconToAndCall(newBeacon.address, initializeData);
          await expectEvent.inTransaction(receipt.tx, CallReceiverMock, 'MockFunctionCalled');
        });
      });

      describe('reentrant beacon implementation() call', function () {
        it('sees the new beacon implementation', async function () {
          const newBeacon = await UpgradeableBeaconReentrantMock.new();
          await expectThorRevert(
            this.utils.$upgradeBeaconToAndCall(newBeacon.address, '0x'),
            '',
            expectRevertCheckStrategy.unspecified,
          );
        });
      });
    });
  });
});
