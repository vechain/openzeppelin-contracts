const shouldBehaveLikeProxy = require('../Proxy.behaviour');

const ERC1967Proxy = artifacts.require('ERC1967Proxy');
const ERC1967ProxyUnsafe = artifacts.require('ERC1967ProxyUnsafe');

contract('ERC1967Proxy', function (accounts) {
  describe('(default) allowUninitialized is false', function () {
    const createProxy = async function (implementation, initData, opts) {
      return ERC1967Proxy.new(implementation, initData, ...[opts].filter(Boolean));
    };

    shouldBehaveLikeProxy(createProxy, accounts, false);
  });

  describe('(unsafe) allowUninitialized is true', function () {
    const createProxy = async function (implementation, initData, opts) {
      return ERC1967ProxyUnsafe.new(implementation, initData, ...[opts].filter(Boolean));
    };

    shouldBehaveLikeProxy(createProxy, accounts, true);
  });
});
