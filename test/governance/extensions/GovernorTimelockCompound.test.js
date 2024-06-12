const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Enums = require('../../helpers/enums');
const { GovernorHelper, proposalStatesToBitMap } = require('../../helpers/governance');
const { computeCreateAddress } = require('../../helpers/create');

const Timelock = artifacts.require('CompTimelock');
const Governor = artifacts.require('$GovernorTimelockCompoundMock');
const CallReceiver = artifacts.require('CallReceiverMock');
const ERC721 = artifacts.require('$ERC721');
const ERC1155 = artifacts.require('$ERC1155');

const TOKENS = [
  { Token: artifacts.require('$ERC20Votes'), mode: 'blocknumber' },
];

contract('GovernorTimelockCompound', function (accounts) {
  const [owner, voter1, voter2, voter3, voter4, other] = accounts;

  const name = 'OZ-Governor';
  const version = '1';
  const tokenName = 'MockToken';
  const tokenSymbol = 'MTKN';
  const tokenSupply = web3.utils.toWei('100');
  const votingDelay = web3.utils.toBN(4);
  const votingPeriod = web3.utils.toBN(16);
  const value = web3.utils.toWei('1');

  const defaultDelay = 2 * 86400;

  for (const { mode, Token } of TOKENS) {
    describe(`using ${Token._json.contractName}`, function () {
      beforeEach(async function () {
        const [deployer] = await web3.eth.getAccounts();

        this.token = await Token.new(tokenName, tokenSymbol, tokenName, version);

        // Need to predict governance address to set it as timelock admin with a delayed transfer
        const nonce = await web3.eth.getTransactionCount(deployer);
        const predictGovernor = computeCreateAddress(deployer, nonce + 1);

        this.timelock = await Timelock.new(predictGovernor, defaultDelay);
        this.mock = await Governor.new(
          name,
          votingDelay,
          votingPeriod,
          0,
          this.timelock.address,
          this.token.address,
          0,
        );
        this.receiver = await CallReceiver.new();

        this.helper = new GovernorHelper(this.mock, mode);

        await web3.eth.sendTransaction({ from: owner, to: this.timelock.address, value });

        await this.token.$_mint(owner, tokenSupply);
        await this.helper.delegate({ token: this.token, to: voter1, value: web3.utils.toWei('10') }, { from: owner });
        await this.helper.delegate({ token: this.token, to: voter2, value: web3.utils.toWei('7') }, { from: owner });
        await this.helper.delegate({ token: this.token, to: voter3, value: web3.utils.toWei('5') }, { from: owner });
        await this.helper.delegate({ token: this.token, to: voter4, value: web3.utils.toWei('2') }, { from: owner });

        // default proposal
        this.proposal = this.helper.setProposal(
          [
            {
              target: this.receiver.address,
              value,
              data: this.receiver.contract.methods.mockFunction().encodeABI(),
            },
          ],
          '<proposal description>',
        );
      });

      it("doesn't accept ether transfers", async function () {
        await expectRevert.unspecified(web3.eth.sendTransaction({ from: owner, to: this.mock.address, value: 1 }));
      });

      describe('should revert', function () {

        describe('on execute', function () {
          it('if not queued', async function () {
            await this.helper.propose();
            await this.helper.waitForSnapshot();
            await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
            await this.helper.waitForDeadline(+1);

            expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Succeeded);

            await expectRevert.unspecified(this.helper.execute(), 'GovernorNotQueuedProposal', [this.proposal.id]);
          });
        });

        describe('on safe receive', function () {
          describe('ERC721', function () {
            const name = 'Non Fungible Token';
            const symbol = 'NFT';
            const tokenId = web3.utils.toBN(1);

            beforeEach(async function () {
              this.token = await ERC721.new(name, symbol);
              await this.token.$_mint(owner, tokenId);
            });

            it("can't receive an ERC721 safeTransfer", async function () {
              await expectRevert.unspecified(
                this.token.safeTransferFrom(owner, this.mock.address, tokenId, { from: owner }),
                'GovernorDisabledDeposit',
                [],
              );
            });
          });

          describe('ERC1155', function () {
            const uri = 'https://token-cdn-domain/{id}.json';
            const tokenIds = {
              1: web3.utils.toBN(1000),
              2: web3.utils.toBN(2000),
              3: web3.utils.toBN(3000),
            };

            beforeEach(async function () {
              this.token = await ERC1155.new(uri);
              await this.token.$_mintBatch(owner, Object.keys(tokenIds), Object.values(tokenIds), '0x');
            });

            it("can't receive ERC1155 safeTransfer", async function () {
              await expectRevert.unspecified(
                this.token.safeTransferFrom(
                  owner,
                  this.mock.address,
                  ...Object.entries(tokenIds)[0], // id + amount
                  '0x',
                  { from: owner },
                ),
                'GovernorDisabledDeposit',
                [],
              );
            });

            it("can't receive ERC1155 safeBatchTransfer", async function () {
              await expectRevert.unspecified(
                this.token.safeBatchTransferFrom(
                  owner,
                  this.mock.address,
                  Object.keys(tokenIds),
                  Object.values(tokenIds),
                  '0x',
                  { from: owner },
                ),
                'GovernorDisabledDeposit',
                [],
              );
            });
          });
        });
      });

      describe('cancel', function () {
        it('cancel before queue prevents scheduling', async function () {
          await this.helper.propose();
          await this.helper.waitForSnapshot();
          await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
          await this.helper.waitForDeadline();

          expectEvent(await this.helper.cancel('internal'), 'ProposalCanceled', { proposalId: this.proposal.id });

          expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Canceled);
          await expectRevert.unspecified(this.helper.queue(), 'GovernorUnexpectedProposalState', [
            this.proposal.id,
            Enums.ProposalState.Canceled,
            proposalStatesToBitMap([Enums.ProposalState.Succeeded]),
          ]);
        });
      });

      describe('onlyGovernance', function () {
        describe('relay', function () {
          beforeEach(async function () {
            await this.token.$_mint(this.mock.address, 1);
          });

          it('is protected', async function () {
            await expectRevert.unspecified(
              this.mock.relay(this.token.address, 0, this.token.contract.methods.transfer(other, 1).encodeABI(), {
                from: owner,
              }),
              'GovernorOnlyExecutor',
              [owner],
            );
          });
        });

        describe('updateTimelock', function () {
          beforeEach(async function () {
            this.newTimelock = await Timelock.new(this.mock.address, 7 * 86400);
          });

          it('is protected', async function () {
            await expectRevert.unspecified(
              this.mock.updateTimelock(this.newTimelock.address, { from: owner }),
              'GovernorOnlyExecutor',
              [owner],
            );
          });
        });

        
      });
    });
  }
});
