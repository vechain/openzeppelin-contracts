const { constants, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const Enums = require('../../helpers/enums');
const { GovernorHelper, proposalStatesToBitMap, timelockSalt } = require('../../helpers/governance');

const Timelock = artifacts.require('TimelockController');
const Governor = artifacts.require('$GovernorTimelockControlMock');
const CallReceiver = artifacts.require('CallReceiverMock');
const ERC721 = artifacts.require('$ERC721');
const ERC1155 = artifacts.require('$ERC1155');

const TOKENS = [
  { Token: artifacts.require('$ERC20Votes'), mode: 'blocknumber' },
];

contract('GovernorTimelockControl', function (accounts) {
  const [owner, voter1, voter2, voter3, voter4, other] = accounts;

  const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const PROPOSER_ROLE = web3.utils.soliditySha3('PROPOSER_ROLE');
  const EXECUTOR_ROLE = web3.utils.soliditySha3('EXECUTOR_ROLE');
  const CANCELLER_ROLE = web3.utils.soliditySha3('CANCELLER_ROLE');

  const name = 'OZ-Governor';
  const version = '1';
  const tokenName = 'MockToken';
  const tokenSymbol = 'MTKN';
  const tokenSupply = web3.utils.toWei('100');
  const votingDelay = web3.utils.toBN(4);
  const votingPeriod = web3.utils.toBN(16);
  const value = web3.utils.toWei('1');

  const delay = 3600;

  for (const { mode, Token } of TOKENS) {
    describe(`using ${Token._json.contractName}`, function () {
      beforeEach(async function () {
        const [deployer] = await web3.eth.getAccounts();

        this.token = await Token.new(tokenName, tokenSymbol, tokenName, version);
        this.timelock = await Timelock.new(delay, [], [], deployer);
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

        this.PROPOSER_ROLE = await this.timelock.PROPOSER_ROLE();
        this.EXECUTOR_ROLE = await this.timelock.EXECUTOR_ROLE();
        this.CANCELLER_ROLE = await this.timelock.CANCELLER_ROLE();

        await web3.eth.sendTransaction({ from: owner, to: this.timelock.address, value });

        // normal setup: governor is proposer, everyone is executor, timelock is its own admin
        await this.timelock.grantRole(PROPOSER_ROLE, this.mock.address);
        await this.timelock.grantRole(PROPOSER_ROLE, owner);
        await this.timelock.grantRole(CANCELLER_ROLE, this.mock.address);
        await this.timelock.grantRole(CANCELLER_ROLE, owner);
        await this.timelock.grantRole(EXECUTOR_ROLE, constants.ZERO_ADDRESS);
        await this.timelock.revokeRole(DEFAULT_ADMIN_ROLE, deployer);

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

        this.proposal.timelockid = await this.timelock.hashOperationBatch(
          ...this.proposal.shortProposal.slice(0, 3),
          '0x0',
          timelockSalt(this.mock.address, this.proposal.shortProposal[3]),
        );
      });

      it("doesn't accept ether transfers", async function () {
        await expectRevert.unspecified(web3.eth.sendTransaction({ from: owner, to: this.mock.address, value: 1 }));
      });

      it('post deployment check', async function () {
        expect(await this.mock.name()).to.be.equal(name);
        expect(await this.mock.token()).to.be.equal(this.token.address);
        expect(await this.mock.votingDelay()).to.be.bignumber.equal(votingDelay);
        expect(await this.mock.votingPeriod()).to.be.bignumber.equal(votingPeriod);
        expect(await this.mock.quorum(0)).to.be.bignumber.equal('0');

        expect(await this.mock.timelock()).to.be.equal(this.timelock.address);
      });

      describe('should revert', function () {

        describe('on execute', function () {

          it('if too early', async function () {
            await this.helper.propose();
            await this.helper.waitForSnapshot();
            await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
            await this.helper.waitForDeadline();
            await this.helper.queue();

            expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Queued);

            await expectRevert.unspecified(this.helper.execute(), 'TimelockUnexpectedOperationState', [
              this.proposal.timelockid,
              proposalStatesToBitMap(Enums.OperationState.Ready),
            ]);
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

        it('cancel after queue prevents executing', async function () {
          await this.helper.propose();
          await this.helper.waitForSnapshot();
          await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
          await this.helper.waitForDeadline();
          await this.helper.queue();

          expectEvent(await this.helper.cancel('internal'), 'ProposalCanceled', { proposalId: this.proposal.id });

          expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Canceled);
          await expectRevert.unspecified(this.helper.execute(), 'GovernorUnexpectedProposalState', [
            this.proposal.id,
            Enums.ProposalState.Canceled,
            proposalStatesToBitMap([Enums.ProposalState.Succeeded, Enums.ProposalState.Queued]),
          ]);
        });

        it('cancel on timelock is reflected on governor', async function () {
          await this.helper.propose();
          await this.helper.waitForSnapshot();
          await this.helper.vote({ support: Enums.VoteType.For }, { from: voter1 });
          await this.helper.waitForDeadline();
          await this.helper.queue();

          expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Queued);

          expectEvent(await this.timelock.cancel(this.proposal.timelockid, { from: owner }), 'Cancelled', {
            id: this.proposal.timelockid,
          });

          expect(await this.mock.state(this.proposal.id)).to.be.bignumber.equal(Enums.ProposalState.Canceled);
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

          it('protected against other proposers', async function () {
            const target = this.mock.address;
            const value = web3.utils.toWei('0');
            const data = this.mock.contract.methods.relay(constants.ZERO_ADDRESS, 0, '0x').encodeABI();
            const predecessor = constants.ZERO_BYTES32;
            const salt = constants.ZERO_BYTES32;

            await this.timelock.schedule(target, value, data, predecessor, salt, delay, { from: owner });

            await time.increase(delay);

            await expectRevert.unspecified(
              this.timelock.execute(target, value, data, predecessor, salt, { from: owner }),
              'QueueEmpty', // Bubbled up from Governor
              [],
            );
          });
        });

        describe('updateTimelock', function () {
          beforeEach(async function () {
            this.newTimelock = await Timelock.new(
              delay,
              [this.mock.address],
              [this.mock.address],
              constants.ZERO_ADDRESS,
            );
          });

          it('is protected', async function () {
            await expectRevert.unspecified(
              this.mock.updateTimelock(this.newTimelock.address, { from: owner }),
              'GovernorOnlyExecutor',
              [owner],
            );
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
    });
  }
});
