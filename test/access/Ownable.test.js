const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');
const { expectThorRevert, expectRevertCheckStrategy } = require('../helpers/errors');

const Ownable = artifacts.require('$Ownable');

contract('Ownable', function (accounts) {
  const [owner, other] = accounts;

  beforeEach(async function () {
    this.ownable = await Ownable.new(owner);
  });

  it('rejects zero address for initialOwner', async function () {
    await expectThorRevert(Ownable.new(constants.ZERO_ADDRESS), '', expectRevertCheckStrategy.unspecified);
  });

  it('has an owner', async function () {
    expect(await this.ownable.owner()).to.equal(owner);
  });

  describe('transfer ownership', function () {
    it('changes owner after transfer', async function () {
      const receipt = await this.ownable.transferOwnership(other, { from: owner });
      expectEvent(receipt, 'OwnershipTransferred');

      expect(await this.ownable.owner()).to.equal(other);
    });

    it('prevents non-owners from transferring', async function () {
      await expectRevert.unspecified(this.ownable.transferOwnership(other, { from: other }));
    });

    it('guards ownership against stuck state', async function () {
      await expectRevert.unspecified(this.ownable.transferOwnership(ZERO_ADDRESS, { from: owner }));
    });
  });

  describe('renounce ownership', function () {
    it('loses ownership after renouncement', async function () {
      const receipt = await this.ownable.renounceOwnership({ from: owner });
      expectEvent(receipt, 'OwnershipTransferred');

      expect(await this.ownable.owner()).to.equal(ZERO_ADDRESS);
    });

    it('prevents non-owners from renouncement', async function () {
      await expectRevert.unspecified(this.ownable.renounceOwnership({ from: other }));
    });

    it('allows to recover access using the internal _transferOwnership', async function () {
      await this.ownable.renounceOwnership({ from: owner });
      const receipt = await this.ownable.$_transferOwnership(other);
      expectEvent(receipt, 'OwnershipTransferred');

      expect(await this.ownable.owner()).to.equal(other);
    });
  });
});
