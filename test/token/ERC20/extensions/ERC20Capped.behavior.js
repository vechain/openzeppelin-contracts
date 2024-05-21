const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

function shouldBehaveLikeERC20Capped(accounts, cap) {
  describe('capped token', function () {
    const user = accounts[0];

    it('starts with the correct cap', async function () {
      expect(await this.token.cap()).to.be.bignumber.equal(cap);
    });

    it('mints when value is less than cap', async function () {
      await this.token.$_mint(user, cap.subn(1));
      expect(await this.token.totalSupply()).to.be.bignumber.equal(cap.subn(1));
    });

    it('fails to mint if the value exceeds the cap', async function () {
      await this.token.$_mint(user, cap.subn(1));
      await expectRevert.unspecified(this.token.$_mint(user, 2));
    });

    it('fails to mint after cap is reached', async function () {
      await this.token.$_mint(user, cap);
      await expectRevert.unspecified(this.token.$_mint(user, 1));
    });
  });
}

module.exports = {
  shouldBehaveLikeERC20Capped,
};
