const { BN, constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');
require('@nomicfoundation/hardhat-chai-matchers/internal/add-chai-matchers');
const { ZERO_ADDRESS, MAX_UINT256 } = constants;

// Returns the address of a signer (`.address`) or a contract (`.target`)
function addressOf(account) {
  return account.target ?? account.address;
}

// Wait for a transaction to be mined (needed on VeChain where state reads after
// a non-waited tx may return stale data).
async function waitTx(txPromise) {
  const tx = await txPromise;
  if (tx && typeof tx.wait === 'function') await tx.wait();
}

// ─── Public API ──────────────────────────────────────────────────────────────
// Each function dispatches to the old-style (truffle / BN) or new-style
// (ethers / BigInt) implementation based on the number of arguments supplied.

function shouldBehaveLikeERC20(initialSupply, accounts, opts = {}) {
  if (Array.isArray(accounts)) {
    _oldShouldBehaveLikeERC20(initialSupply, accounts, opts);
  } else {
    _newShouldBehaveLikeERC20(initialSupply);
  }
}

function shouldBehaveLikeERC20Transfer(fromOrBalance, to, balance, transfer) {
  if (transfer !== undefined) {
    _oldShouldBehaveLikeERC20Transfer(fromOrBalance, to, balance, transfer);
  } else {
    _newShouldBehaveLikeERC20Transfer(fromOrBalance);
  }
}

function shouldBehaveLikeERC20Approve(ownerOrSupply, spender, supply, approve) {
  if (approve !== undefined) {
    _oldShouldBehaveLikeERC20Approve(ownerOrSupply, spender, supply, approve);
  } else {
    _newShouldBehaveLikeERC20Approve(ownerOrSupply);
  }
}

// ─── New-style implementations (ethers / BigInt) ─────────────────────────────
// Context expected on `this`:
//   this.token    – the ERC-20 contract
//   this.holder   – the account that holds `initialSupply` tokens
//   this.other    – an account with no tokens
//   this.accounts – all available signers (optional, for anotherAccount)

function _newShouldBehaveLikeERC20(initialSupply) {
  describe('total supply', function () {
    it('returns the total token value', async function () {
      expect(await this.token.totalSupply()).to.equal(initialSupply);
    });
  });

  describe('balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await this.token.balanceOf(this.other)).to.equal(0n);
      });
    });

    describe('when the requested account has some tokens', function () {
      it('returns the total token value', async function () {
        expect(await this.token.balanceOf(this.holder)).to.equal(initialSupply);
      });
    });
  });

  describe('transfer', function () {
    beforeEach(function () {
      this.recipient = this.other;
      this.transfer = (from, to, value) => this.token.connect(from).transfer(to, value);
    });

    _newShouldBehaveLikeERC20Transfer(initialSupply);
  });

  describe('transfer from', function () {
    beforeEach(async function () {
      await waitTx(this.token.connect(this.holder).approve(this.other, initialSupply));
    });

    describe('when the spender has enough allowance', function () {
      describe('when the token owner has enough balance', function () {
        it('transfers the requested amount', async function () {
          await waitTx(this.token.connect(this.other).transferFrom(this.holder, this.other, initialSupply));
          expect(await this.token.balanceOf(this.holder)).to.equal(0n);
          expect(await this.token.balanceOf(this.other)).to.equal(initialSupply);
        });

        it('decreases the spender allowance', async function () {
          await waitTx(this.token.connect(this.other).transferFrom(this.holder, this.other, initialSupply));
          expect(await this.token.allowance(this.holder, this.other)).to.equal(0n);
        });

        it('emits a Transfer event', async function () {
          await expect(this.token.connect(this.other).transferFrom(this.holder, this.other, initialSupply))
            .to.emit(this.token, 'Transfer')
            .withArgs(this.holder.address, this.other.address, initialSupply);
        });
      });

      describe('when the token owner does not have enough balance', function () {
        it('reverts', async function () {
          await expect(
            this.token.connect(this.other).transferFrom(this.holder, this.other, initialSupply + 1n),
          ).to.be.reverted;
        });
      });
    });

    describe('when the spender does not have enough allowance', function () {
      it('reverts', async function () {
        await expect(
          this.token.connect(this.other).transferFrom(this.holder, this.other, initialSupply + 1n),
        ).to.be.reverted;
      });
    });

    describe('when the recipient is the zero address', function () {
      it('reverts', async function () {
        await expect(
          this.token.connect(this.other).transferFrom(this.holder, ethers.ZeroAddress, initialSupply),
        ).to.be.reverted;
      });
    });
  });

  describe('approve', function () {
    beforeEach(function () {
      this.recipient = this.other;
      this.approve = (owner, spender, value) => this.token.connect(owner).approve(spender, value);
    });

    _newShouldBehaveLikeERC20Approve(initialSupply);
  });
}

function _newShouldBehaveLikeERC20Transfer(balance) {
  describe('when the recipient is not the zero address', function () {
    describe('when the sender does not have enough balance', function () {
      it('reverts', async function () {
        await expect(this.transfer(this.holder, this.recipient, balance + 1n)).to.be.reverted;
      });
    });

    describe('when the sender transfers all balance', function () {
      it('transfers the requested amount', async function () {
        await waitTx(this.transfer(this.holder, this.recipient, balance));
        expect(await this.token.balanceOf(this.holder)).to.equal(0n);
        expect(await this.token.balanceOf(this.recipient)).to.equal(balance);
      });

      it('emits a Transfer event', async function () {
        await expect(this.transfer(this.holder, this.recipient, balance))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.holder.address, addressOf(this.recipient), balance);
      });
    });

    describe('when the sender transfers zero tokens', function () {
      it('transfers the requested amount', async function () {
        await waitTx(this.transfer(this.holder, this.recipient, 0n));
        expect(await this.token.balanceOf(this.holder)).to.equal(balance);
        expect(await this.token.balanceOf(this.recipient)).to.equal(0n);
      });

      it('emits a Transfer event', async function () {
        await expect(this.transfer(this.holder, this.recipient, 0n))
          .to.emit(this.token, 'Transfer')
          .withArgs(this.holder.address, addressOf(this.recipient), 0n);
      });
    });
  });

  describe('when the recipient is the zero address', function () {
    it('reverts', async function () {
      await expect(this.transfer(this.holder, ethers.ZeroAddress, balance)).to.be.reverted;
    });
  });
}

function _newShouldBehaveLikeERC20Approve(supply) {
  describe('when the spender is not the zero address', function () {
    describe('when the sender has enough balance', function () {
      it('emits an Approval event', async function () {
        await expect(this.approve(this.holder, this.recipient, supply))
          .to.emit(this.token, 'Approval')
          .withArgs(this.holder.address, addressOf(this.recipient), supply);
      });

      describe('when there was no approved value before', function () {
        it('approves the requested value', async function () {
          await waitTx(this.approve(this.holder, this.recipient, supply));
          expect(await this.token.allowance(this.holder, this.recipient)).to.equal(supply);
        });
      });

      describe('when the spender had an approved value', function () {
        beforeEach(async function () {
          await waitTx(this.approve(this.holder, this.recipient, 1n));
        });

        it('approves the requested value and replaces the previous one', async function () {
          await waitTx(this.approve(this.holder, this.recipient, supply));
          expect(await this.token.allowance(this.holder, this.recipient)).to.equal(supply);
        });
      });
    });

    describe('when the sender does not have enough balance', function () {
      it('emits an Approval event', async function () {
        await expect(this.approve(this.holder, this.recipient, supply + 1n))
          .to.emit(this.token, 'Approval')
          .withArgs(this.holder.address, addressOf(this.recipient), supply + 1n);
      });

      describe('when there was no approved value before', function () {
        it('approves the requested value', async function () {
          await waitTx(this.approve(this.holder, this.recipient, supply + 1n));
          expect(await this.token.allowance(this.holder, this.recipient)).to.equal(supply + 1n);
        });
      });

      describe('when the spender had an approved value', function () {
        beforeEach(async function () {
          await waitTx(this.approve(this.holder, this.recipient, 1n));
        });

        it('approves the requested value and replaces the previous one', async function () {
          await waitTx(this.approve(this.holder, this.recipient, supply + 1n));
          expect(await this.token.allowance(this.holder, this.recipient)).to.equal(supply + 1n);
        });
      });
    });
  });

  describe('when the spender is the zero address', function () {
    it('reverts', async function () {
      await expect(this.approve(this.holder, ethers.ZeroAddress, supply)).to.be.reverted;
    });
  });
}

// ─── Old-style implementations (truffle / BN) ────────────────────────────────

function _oldShouldBehaveLikeERC20(initialSupply, accounts, opts = {}) {
  const [initialHolder, recipient, anotherAccount] = accounts;
  const { forcedApproval } = opts;

  describe('total supply', function () {
    it('returns the total token value', async function () {
      expect(await this.token.totalSupply()).to.be.bignumber.equal(initialSupply);
    });
  });

  describe('balanceOf', function () {
    describe('when the requested account has no tokens', function () {
      it('returns zero', async function () {
        expect(await this.token.balanceOf(anotherAccount)).to.be.bignumber.equal('0');
      });
    });

    describe('when the requested account has some tokens', function () {
      it('returns the total token value', async function () {
        expect(await this.token.balanceOf(initialHolder)).to.be.bignumber.equal(initialSupply);
      });
    });
  });

  describe('transfer', function () {
    _oldShouldBehaveLikeERC20Transfer(initialHolder, recipient, initialSupply, function (from, to, value) {
      return this.token.transfer(to, value, { from });
    });
  });

  describe('transfer from', function () {
    const spender = recipient;

    describe('when the token owner is not the zero address', function () {
      const tokenOwner = initialHolder;

      describe('when the recipient is not the zero address', function () {
        const to = anotherAccount;

        describe('when the spender has enough allowance', function () {
          beforeEach(async function () {
            await this.token.approve(spender, initialSupply, { from: initialHolder });
          });

          describe('when the token owner has enough balance', function () {
            const value = initialSupply;

            it('transfers the requested value', async function () {
              await this.token.transferFrom(tokenOwner, to, value, { from: spender });

              expect(await this.token.balanceOf(tokenOwner)).to.be.bignumber.equal('0');

              expect(await this.token.balanceOf(to)).to.be.bignumber.equal(value);
            });

            it('decreases the spender allowance', async function () {
              await this.token.transferFrom(tokenOwner, to, value, { from: spender });

              expect(await this.token.allowance(tokenOwner, spender)).to.be.bignumber.equal('0');
            });

            it('emits a transfer event', async function () {
              expectEvent(await this.token.transferFrom(tokenOwner, to, value, { from: spender }), 'Transfer', {
                from: tokenOwner,
                to: to,
                value: value,
              });
            });

            if (forcedApproval) {
              it('emits an approval event', async function () {
                expectEvent(await this.token.transferFrom(tokenOwner, to, value, { from: spender }), 'Approval', {
                  owner: tokenOwner,
                  spender: spender,
                  value: await this.token.allowance(tokenOwner, spender),
                });
              });
            } else {
              it('does not emit an approval event', async function () {
                expectEvent.notEmitted(
                  await this.token.transferFrom(tokenOwner, to, value, { from: spender }),
                  'Approval',
                );
              });
            }
          });

          describe('when the token owner does not have enough balance', function () {
            const value = initialSupply;

            beforeEach('reducing balance', async function () {
              await this.token.transfer(to, 1, { from: tokenOwner });
            });

            it('reverts', async function () {
              await expectRevert.unspecified(
                this.token.transferFrom(tokenOwner, to, value, { from: spender })
              );
            });
          });
        });

        describe('when the spender does not have enough allowance', function () {
          const allowance = initialSupply.subn(1);

          beforeEach(async function () {
            await this.token.approve(spender, allowance, { from: tokenOwner });
          });

          describe('when the token owner has enough balance', function () {
            const value = initialSupply;

            it('reverts', async function () {
              await expectRevert.unspecified(
                this.token.transferFrom(tokenOwner, to, value, { from: spender })
              );
            });
          });

          describe('when the token owner does not have enough balance', function () {
            const value = allowance;

            beforeEach('reducing balance', async function () {
              await this.token.transfer(to, 2, { from: tokenOwner });
            });

            it('reverts', async function () {
              await expectRevert.unspecified(
                this.token.transferFrom(tokenOwner, to, value, { from: spender })
              );
            });
          });
        });

        describe('when the spender has unlimited allowance', function () {
          beforeEach(async function () {
            await this.token.approve(spender, MAX_UINT256, { from: initialHolder });
          });

          it('does not decrease the spender allowance', async function () {
            await this.token.transferFrom(tokenOwner, to, 1, { from: spender });

            expect(await this.token.allowance(tokenOwner, spender)).to.be.bignumber.equal(MAX_UINT256);
          });

          it('does not emit an approval event', async function () {
            expectEvent.notEmitted(await this.token.transferFrom(tokenOwner, to, 1, { from: spender }), 'Approval');
          });
        });
      });

      describe('when the recipient is the zero address', function () {
        const value = initialSupply;
        const to = ZERO_ADDRESS;

        beforeEach(async function () {
          await this.token.approve(spender, value, { from: tokenOwner });
        });

        it('reverts', async function () {
          await expectRevert.unspecified(
            this.token.transferFrom(tokenOwner, to, value, { from: spender })
          );
        });
      });
    });

    describe('when the token owner is the zero address', function () {
      const value = 0;
      const tokenOwner = ZERO_ADDRESS;
      const to = recipient;

      it('reverts', async function () {
        await expectRevert.unspecified(
          this.token.transferFrom(tokenOwner, to, value, { from: spender })
        );
      });
    });
  });

  describe('approve', function () {
    _oldShouldBehaveLikeERC20Approve(initialHolder, recipient, initialSupply, function (owner, spender, value) {
      return this.token.approve(spender, value, { from: owner });
    });
  });
}

function _oldShouldBehaveLikeERC20Transfer(from, to, balance, transfer) {
  describe('when the recipient is not the zero address', function () {
    describe('when the sender does not have enough balance', function () {
      const value = balance.addn(1);

      it('reverts', async function () {
        await expectRevert.unspecified(transfer.call(this, from, to, value));
      });
    });

    describe('when the sender transfers all balance', function () {
      const value = balance;

      it('transfers the requested value', async function () {
        await transfer.call(this, from, to, value);

        expect(await this.token.balanceOf(from)).to.be.bignumber.equal('0');

        expect(await this.token.balanceOf(to)).to.be.bignumber.equal(value);
      });

      it('emits a transfer event', async function () {
        expectEvent(await transfer.call(this, from, to, value), 'Transfer', { from, to, value: value });
      });
    });

    describe('when the sender transfers zero tokens', function () {
      const value = new BN('0');

      it('transfers the requested value', async function () {
        await transfer.call(this, from, to, value);

        expect(await this.token.balanceOf(from)).to.be.bignumber.equal(balance);

        expect(await this.token.balanceOf(to)).to.be.bignumber.equal('0');
      });

      it('emits a transfer event', async function () {
        expectEvent(await transfer.call(this, from, to, value), 'Transfer', { from, to, value: value });
      });
    });
  });

  describe('when the recipient is the zero address', function () {
    it('reverts', async function () {
      await expectRevert.unspecified(transfer.call(this, from, ZERO_ADDRESS, balance));
    });
  });
}

function _oldShouldBehaveLikeERC20Approve(owner, spender, supply, approve) {
  describe('when the spender is not the zero address', function () {
    describe('when the sender has enough balance', function () {
      const value = supply;

      it('emits an approval event', async function () {
        expectEvent(await approve.call(this, owner, spender, value), 'Approval', {
          owner: owner,
          spender: spender,
          value: value,
        });
      });

      describe('when there was no approved value before', function () {
        it('approves the requested value', async function () {
          await approve.call(this, owner, spender, value);

          expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
      });

      describe('when the spender had an approved value', function () {
        beforeEach(async function () {
          await approve.call(this, owner, spender, new BN(1));
        });

        it('approves the requested value and replaces the previous one', async function () {
          await approve.call(this, owner, spender, value);

          expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
      });
    });

    describe('when the sender does not have enough balance', function () {
      const value = supply.addn(1);

      it('emits an approval event', async function () {
        expectEvent(await approve.call(this, owner, spender, value), 'Approval', {
          owner: owner,
          spender: spender,
          value: value,
        });
      });

      describe('when there was no approved value before', function () {
        it('approves the requested value', async function () {
          await approve.call(this, owner, spender, value);

          expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
      });

      describe('when the spender had an approved value', function () {
        beforeEach(async function () {
          await approve.call(this, owner, spender, new BN(1));
        });

        it('approves the requested value and replaces the previous one', async function () {
          await approve.call(this, owner, spender, value);

          expect(await this.token.allowance(owner, spender)).to.be.bignumber.equal(value);
        });
      });
    });
  });

  describe('when the spender is the zero address', function () {
    it('reverts', async function () {
      await expectRevert.unspecified(approve.call(this, owner, ZERO_ADDRESS, supply));
    });
  });
}

module.exports = {
  shouldBehaveLikeERC20,
  shouldBehaveLikeERC20Transfer,
  shouldBehaveLikeERC20Approve,
};
