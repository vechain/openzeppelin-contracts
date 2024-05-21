const { ether } = require('@openzeppelin/test-helpers');
const { shouldBehaveLikeERC20Capped } = require('./ERC20Capped.behavior');
const { expectRevert } = require('@openzeppelin/test-helpers');

const ERC20Capped = artifacts.require('$ERC20Capped');

contract('ERC20Capped', function (accounts) {
  const cap = ether('1000');

  const name = 'My Token';
  const symbol = 'MTKN';

  it('requires a non-zero cap', async function () {
    await expectRevert(ERC20Capped.new(name, symbol, 0), "The transaction receipt didn't contain a contract address.");
  });

  context('once deployed', async function () {
    beforeEach(async function () {
      this.token = await ERC20Capped.new(name, symbol, cap);
    });

    shouldBehaveLikeERC20Capped(accounts, cap);
  });
});
