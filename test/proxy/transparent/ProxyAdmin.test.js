const { expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const ImplV1 = artifacts.require('DummyImplementation');
const ImplV2 = artifacts.require('DummyImplementationV2');
const ProxyAdmin = artifacts.require('ProxyAdmin');
const TransparentUpgradeableProxy = artifacts.require('TransparentUpgradeableProxy');
const ITransparentUpgradeableProxy = artifacts.require('ITransparentUpgradeableProxy');
const { expectThorRevert, expectRevertCheckStrategy } = require('../../helpers/errors.js');

contract('ProxyAdmin', function (accounts) {
  const [proxyAdminOwner, anotherAccount] = accounts;

  before('set implementations', async function () {
    this.implementationV1 = await ImplV1.new();
    this.implementationV2 = await ImplV2.new();
  });

  beforeEach(async function () {
    const initializeData = Buffer.from('');
    const proxy = await TransparentUpgradeableProxy.new(this.implementationV1.address, proxyAdminOwner, initializeData);

    let txHash = proxy.transactionHash
    let txReceipt = await web3.eth.getTransactionReceipt(txHash)
    let proxyAdminAddress = txReceipt.logs[2].address
    
    this.proxyAdmin = await ProxyAdmin.at(proxyAdminAddress);
    this.proxy = await ITransparentUpgradeableProxy.at(proxy.address);
  });

  it('has an owner', async function () {
    expect(await this.proxyAdmin.owner()).to.equal(proxyAdminOwner);
  });

  it('has an interface version', async function () {
    expect(await this.proxyAdmin.UPGRADE_INTERFACE_VERSION()).to.equal('5.0.0');
  });

  describe('without data', function () {
    context('with unauthorized account', function () {
      it('fails to upgrade', async function () {
        await expectThorRevert(
          this.proxyAdmin.upgradeAndCall(this.proxy.address, this.implementationV2.address, '0x', {
            from: anotherAccount,
          }),
          "",
          expectRevertCheckStrategy.unspecified
        );
      });
    });
  });

  describe('with data', function () {
    context('with unauthorized account', function () {
      it('fails to upgrade', async function () {
        const callData = new ImplV1('').contract.methods.initializeNonPayableWithValue(1337).encodeABI();
        await expectThorRevert(
          this.proxyAdmin.upgradeAndCall(this.proxy.address, this.implementationV2.address, callData, {
            from: anotherAccount,
          }),
          "",
          expectRevertCheckStrategy.unspecified
        );
      });
    });

    context('with authorized account', function () {
      context('with invalid callData', function () {
        it('fails to upgrade', async function () {
          const callData = '0x12345678';
          await expectRevert.unspecified(
            this.proxyAdmin.upgradeAndCall(this.proxy.address, this.implementationV2.address, callData, {
              from: proxyAdminOwner,
            }),
          );
        });
      });
    });
  });
});
