const { expectEvent, time, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Enums = require('../../helpers/enums');
const { GovernorHelper } = require('../../helpers/governance');

const AccessManager = artifacts.require('$AccessManager');
const Governor = artifacts.require('$GovernorTimelockAccessMock');
const AccessManagedTarget = artifacts.require('$AccessManagedTarget');

const TOKENS = [
  { Token: artifacts.require('$ERC20Votes'), mode: 'blocknumber' },
];

const hashOperation = (caller, target, data) =>
  web3.utils.keccak256(web3.eth.abi.encodeParameters(['address', 'address', 'bytes'], [caller, target, data]));

contract('GovernorTimelockAccess', function (accounts) {
  const [admin, voter1, voter2, voter3, voter4, other] = accounts;

  const name = 'OZ-Governor';
  const version = '1';
  const tokenName = 'MockToken';
  const tokenSymbol = 'MTKN';
  const tokenSupply = web3.utils.toWei('100');
  const votingDelay = web3.utils.toBN(4);
  const votingPeriod = web3.utils.toBN(16);
  const value = web3.utils.toWei('1');

  for (const { mode, Token } of TOKENS) {
    describe(`using ${Token._json.contractName}`, function () {
      beforeEach(async function () {
        this.token = await Token.new(tokenName, tokenSymbol, tokenName, version);
        this.manager = await AccessManager.new(admin);
        this.mock = await Governor.new(
          name,
          votingDelay,
          votingPeriod,
          0, // proposal threshold
          this.manager.address,
          0, // base delay
          this.token.address,
          0, // quorum
        );
        this.receiver = await AccessManagedTarget.new(this.manager.address);

        this.helper = new GovernorHelper(this.mock, mode);

        await web3.eth.sendTransaction({ from: admin, to: this.mock.address, value });

        await this.token.$_mint(admin, tokenSupply);
        await this.helper.delegate({ token: this.token, to: voter1, value: web3.utils.toWei('10') }, { from: admin });
        await this.helper.delegate({ token: this.token, to: voter2, value: web3.utils.toWei('7') }, { from: admin });
        await this.helper.delegate({ token: this.token, to: voter3, value: web3.utils.toWei('5') }, { from: admin });
        await this.helper.delegate({ token: this.token, to: voter4, value: web3.utils.toWei('2') }, { from: admin });

        // default proposals
        this.restricted = {};
        this.restricted.selector = this.receiver.contract.methods.fnRestricted().encodeABI();
        this.restricted.operation = {
          target: this.receiver.address,
          value: '0',
          data: this.restricted.selector,
        };
        this.restricted.operationId = hashOperation(
          this.mock.address,
          this.restricted.operation.target,
          this.restricted.operation.data,
        );

        this.unrestricted = {};
        this.unrestricted.selector = this.receiver.contract.methods.fnUnrestricted().encodeABI();
        this.unrestricted.operation = {
          target: this.receiver.address,
          value: '0',
          data: this.unrestricted.selector,
        };
        this.unrestricted.operationId = hashOperation(
          this.mock.address,
          this.unrestricted.operation.target,
          this.unrestricted.operation.data,
        );

        this.fallback = {};
        this.fallback.operation = {
          target: this.receiver.address,
          value: '0',
          data: '0x1234',
        };
        this.fallback.operationId = hashOperation(
          this.mock.address,
          this.fallback.operation.target,
          this.fallback.operation.data,
        );
      });

      it('accepts ether transfers', async function () {
        await web3.eth.sendTransaction({ from: admin, to: this.mock.address, value: 1 });
      });

      it('post deployment check', async function () {
        expect(await this.mock.name()).to.be.equal(name);
        expect(await this.mock.token()).to.be.equal(this.token.address);
        expect(await this.mock.votingDelay()).to.be.bignumber.equal(votingDelay);
        expect(await this.mock.votingPeriod()).to.be.bignumber.equal(votingPeriod);
        expect(await this.mock.quorum(0)).to.be.bignumber.equal('0');

        expect(await this.mock.accessManager()).to.be.equal(this.manager.address);
      });

      it('sets access manager ignored when target is the governor', async function () {
        const other = this.mock.address;
        const selectors = ['0x12345678', '0x87654321', '0xabcdef01'];

        await this.helper.setProposal(
          [
            {
              target: this.mock.address,
              value: '0',
              data: this.mock.contract.methods.setAccessManagerIgnored(other, selectors, true).encodeABI(),
            },
          ],
          'descr',
        );

        await this.helper.propose();
        await this.helper.waitForSnapshot();
        await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
        await this.helper.waitForDeadline();
        const receipt = await this.helper.execute();

        for (const selector of selectors) {
          expectEvent(receipt, 'AccessManagerIgnoredSet', {
            target: other,
            selector,
            ignored: true,
          });
          expect(await this.mock.isAccessManagerIgnored(other, selector)).to.be.true;
        }
      });
    });
  }
});
