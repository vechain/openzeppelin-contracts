const { BN, expectRevert } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const ERC1155Pausable = artifacts.require('$ERC1155Pausable');

contract('ERC1155Pausable', function (accounts) {
  const [holder, operator, receiver, other] = accounts;

  const uri = 'https://token.com';

  beforeEach(async function () {
    this.token = await ERC1155Pausable.new(uri);
  });

  context('when token is paused', function () {
    const firstTokenId = new BN('37');
    const firstTokenValue = new BN('42');

    const secondTokenId = new BN('19842');
    const secondTokenValue = new BN('23');

    beforeEach(async function () {
      await this.token.setApprovalForAll(operator, true, { from: holder });
      await this.token.$_mint(holder, firstTokenId, firstTokenValue, '0x');

      await this.token.$_pause();
    });

    it('reverts when trying to safeTransferFrom from holder', async function () {
      await expectRevert.unspecified(
        this.token.safeTransferFrom(holder, receiver, firstTokenId, firstTokenValue, '0x', { from: holder })
      );
    });

    it('reverts when trying to safeTransferFrom from operator', async function () {
      await expectRevert.unspecified(
        this.token.safeTransferFrom(holder, receiver, firstTokenId, firstTokenValue, '0x', { from: operator })
      );
    });

    it('reverts when trying to safeBatchTransferFrom from holder', async function () {
      await expectRevert.unspecified(
        this.token.safeBatchTransferFrom(holder, receiver, [firstTokenId], [firstTokenValue], '0x', { from: holder })
      );
    });

    it('reverts when trying to safeBatchTransferFrom from operator', async function () {
      await expectRevert.unspecified(
        this.token.safeBatchTransferFrom(holder, receiver, [firstTokenId], [firstTokenValue], '0x', {
          from: operator,
        })
      );
    });

    it('reverts when trying to mint', async function () {
      await expectRevert.unspecified(
        this.token.$_mint(holder, secondTokenId, secondTokenValue, '0x')
      );
    });

    it('reverts when trying to mintBatch', async function () {
      await expectRevert.unspecified(
        this.token.$_mintBatch(holder, [secondTokenId], [secondTokenValue], '0x')
      );
    });

    it('reverts when trying to burn', async function () {
      await expectRevert.unspecified(this.token.$_burn(holder, firstTokenId, firstTokenValue), 'EnforcedPause', []);
    });

    it('reverts when trying to burnBatch', async function () {
      await expectRevert.unspecified(
        this.token.$_burnBatch(holder, [firstTokenId], [firstTokenValue])
      );
    });

    describe('setApprovalForAll', function () {
      it('approves an operator', async function () {
        await this.token.setApprovalForAll(other, true, { from: holder });
        expect(await this.token.isApprovedForAll(holder, other)).to.equal(true);
      });
    });

    describe('balanceOf', function () {
      it('returns the token value owned by the given address', async function () {
        const balance = await this.token.balanceOf(holder, firstTokenId);
        expect(balance).to.be.bignumber.equal(firstTokenValue);
      });
    });

    describe('isApprovedForAll', function () {
      it('returns the approval of the operator', async function () {
        expect(await this.token.isApprovedForAll(holder, operator)).to.equal(true);
      });
    });
  });
});
