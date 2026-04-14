const { time, expectRevert } = require('@openzeppelin/test-helpers');
const { setStorageAt, time: networkHelperTime } = require('@nomicfoundation/hardhat-network-helpers');

const { impersonate } = require('../../helpers/account');
const { EXPIRATION, EXECUTION_ID_STORAGE_SLOT } = require('../../helpers/access-manager');
const { latest } = require('../../helpers/utils');

// ============ COMMON PREDICATES ============

const LIKE_COMMON_IS_EXECUTING = {
  executing() {
    it('succeeds', async function () {
      await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
    });
  },
  notExecuting() {
    it('reverts as AccessManagerUnauthorizedAccount', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
      );
    });
  },
};

const LIKE_COMMON_GET_ACCESS = {
  requiredRoleIsGranted: {
    roleGrantingIsDelayed: {
      callerHasAnExecutionDelay: {
        beforeGrantDelay() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
            );
          });
        },
        afterGrantDelay: undefined, // Diverges if there's an operation delay or not
      },
      callerHasNoExecutionDelay: {
        beforeGrantDelay() {
          it('reverts as AccessManagerUnauthorizedAccount', async function () {
            await expectRevert.unspecified(
              web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
            );
          });
        },
        afterGrantDelay() {
          it('succeeds called directly', async function () {
            await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
          });

          it('succeeds via execute', async function () {
            await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
          });
        },
      },
    },
    roleGrantingIsNotDelayed: {
      callerHasAnExecutionDelay: undefined, // Diverges if there's an operation to schedule or not
      callerHasNoExecutionDelay() {
        it('succeeds called directly', async function () {
          await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
        });

        it('succeeds via execute', async function () {
          await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
        });
      },
    },
  },
  requiredRoleIsNotGranted() {
    it('reverts as AccessManagerUnauthorizedAccount', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
      );
    });
  },
};

const LIKE_COMMON_SCHEDULABLE = {
  scheduled: {
    before() {
      it('reverts as AccessManagerNotReady', async function () {
        await expectRevert.unspecified(
          web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
        );
      });
    },
    after() {
      it('succeeds called directly', async function () {
        await web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller });
      });

      it('succeeds via execute', async function () {
        await this.manager.execute(this.target.address, this.calldata, { from: this.caller });
      });
    },
    expired() {
      it('reverts as AccessManagerExpired', async function () {
        await expectRevert.unspecified(
          web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
        );
      });
    },
  },
  notScheduled() {
    it('reverts as AccessManagerNotScheduled', async function () {
      await expectRevert.unspecified(
        web3.eth.sendTransaction({ to: this.target.address, data: this.calldata, from: this.caller }),
      );
    });
  },
};

// ============ MODE ============

/**
 * @requires this.{manager,target}
 */
function testAsClosable({ closed, open }) {
  describe('when the manager is closed', function () {
    beforeEach('close', async function () {
      await this.manager.$_setTargetClosed(this.target.address, true);
    });

    closed();
  });

  describe('when the manager is open', function () {
    beforeEach('open', async function () {
      await this.manager.$_setTargetClosed(this.target.address, false);
    });

    open();
  });
}

// ============ DELAY ============

/**
 * @requires this.{delay} (as BN from @openzeppelin/test-helpers time)
 */
function testAsDelay(type, { before, after }) {
  beforeEach('define timestamp when delay takes effect', async function () {
    const timestamp = await latest();
    this.delayEffect = timestamp.add(this.delay);
  });

  describe(`when ${type} delay has not taken effect yet`, function () {
    beforeEach(`set next block timestamp before ${type} takes effect`, async function () {
      await networkHelperTime.increaseTo(this.delayEffect.subn(1).toNumber());
    });

    before();
  });

  describe(`when ${type} delay has taken effect`, function () {
    beforeEach(`set next block timestamp when ${type} takes effect`, async function () {
      await networkHelperTime.increaseTo(this.delayEffect.toNumber());
    });

    after();
  });
}

// ============ OPERATION ============

/**
 * @requires this.{manager,scheduleIn,caller,target,calldata}
 */
function testAsSchedulableOperation({ scheduled: { before, after, expired }, notScheduled }) {
  describe('when operation is scheduled', function () {
    beforeEach('schedule operation', async function () {
      // If caller is a contract instance, impersonate it and use its address
      const callerAddress = this.caller.address || this.caller;
      if (this.caller.address) {
        await impersonate(this.caller.address);
        this.caller = this.caller.address;
      }

      const scheduledAt = (await latest()).addn(1);
      await networkHelperTime.increaseTo(scheduledAt.toNumber());

      this.operationId = await this.manager.hashOperation(callerAddress, this.target.address, this.calldata);
      const when = scheduledAt.add(this.scheduleIn);
      await this.manager.schedule(this.target.address, this.calldata, when, { from: callerAddress });
    });

    describe('when operation is not ready for execution', function () {
      beforeEach('set next block time before operation is ready', async function () {
        this.scheduledAt = await latest();
        const schedule = await this.manager.getSchedule(this.operationId);
        await networkHelperTime.increaseTo(schedule.subn(1).toNumber());
      });

      before();
    });

    describe('when operation is ready for execution', function () {
      beforeEach('set next block time when operation is ready for execution', async function () {
        this.scheduledAt = await latest();
        const schedule = await this.manager.getSchedule(this.operationId);
        await networkHelperTime.increaseTo(schedule.toNumber());
      });

      after();
    });

    describe('when operation has expired', function () {
      beforeEach('set next block time when operation expired', async function () {
        this.scheduledAt = await latest();
        const schedule = await this.manager.getSchedule(this.operationId);
        await networkHelperTime.increaseTo(schedule.add(EXPIRATION).toNumber());
      });

      expired();
    });
  });

  describe('when operation is not scheduled', function () {
    beforeEach('set expected operationId', async function () {
      const callerAddress = this.caller.address || this.caller;
      this.operationId = await this.manager.hashOperation(callerAddress, this.target.address, this.calldata);

      // Assert operation is not scheduled
      expect(await this.manager.getSchedule(this.operationId)).to.be.bignumber.equal(web3.utils.toBN(0));
    });

    notScheduled();
  });
}

/**
 * @requires this.{manager,roles,target,calldata}
 */
function testAsRestrictedOperation({ callerIsTheManager: { executing, notExecuting }, callerIsNotTheManager }) {
  describe('when the call comes from the manager (msg.sender == manager)', function () {
    beforeEach('define caller as manager', async function () {
      await impersonate(this.manager.address);
      this.caller = this.manager.address;
    });

    describe('when _executionId is in storage for target and selector', function () {
      beforeEach('set _executionId flag from calldata and target', async function () {
        const executionId = web3.utils.keccak256(
          web3.eth.abi.encodeParameters(
            ['address', 'bytes4'],
            [this.target.address, this.calldata.substring(0, 10)],
          ),
        );
        // EXECUTION_ID_STORAGE_SLOT is a BigInt; setStorageAt accepts BigInt for the slot
        // and a 0x-prefixed hex string for the value
        await setStorageAt(this.manager.address, EXECUTION_ID_STORAGE_SLOT, executionId);
      });

      executing();
    });

    describe('when _executionId does not match target and selector', notExecuting);
  });

  describe('when the call does not come from the manager (msg.sender != manager)', function () {
    beforeEach('define non manager caller', function () {
      this.caller = this.roles.SOME.members[0];
    });

    callerIsNotTheManager();
  });
}

/**
 * @requires this.{manager,scheduleIn,caller,target,calldata,executionDelay}
 */
function testAsDelayedOperation() {
  describe('with operation delay', function () {
    describe('when operation delay is greater than execution delay', function () {
      beforeEach('set operation delay', async function () {
        this.operationDelay = this.executionDelay.add(time.duration.hours(1));
        const target = this.operationDelayTarget || this.target;
        await this.manager.$_setTargetAdminDelay(target.address, this.operationDelay);
        this.scheduleIn = this.operationDelay; // For testAsSchedulableOperation
      });

      testAsSchedulableOperation(LIKE_COMMON_SCHEDULABLE);
    });

    describe('when operation delay is shorter than execution delay', function () {
      beforeEach('set operation delay', async function () {
        this.operationDelay = this.executionDelay.sub(time.duration.hours(1));
        const target = this.operationDelayTarget || this.target;
        await this.manager.$_setTargetAdminDelay(target.address, this.operationDelay);
        this.scheduleIn = this.executionDelay; // For testAsSchedulableOperation
      });

      testAsSchedulableOperation(LIKE_COMMON_SCHEDULABLE);
    });
  });

  describe('without operation delay', function () {
    beforeEach('set operation delay', async function () {
      this.operationDelay = web3.utils.toBN(0);
      const target = this.operationDelayTarget || this.target;
      await this.manager.$_setTargetAdminDelay(target.address, this.operationDelay);
      this.scheduleIn = this.executionDelay; // For testAsSchedulableOperation
    });

    testAsSchedulableOperation(LIKE_COMMON_SCHEDULABLE);
  });
}

// ============ METHOD ============

/**
 * @requires this.{manager,roles,role,target,calldata}
 */
function testAsCanCall({
  closed,
  open: {
    callerIsTheManager,
    callerIsNotTheManager: { publicRoleIsRequired, specificRoleIsRequired },
  },
}) {
  testAsClosable({
    closed,
    open() {
      testAsRestrictedOperation({
        callerIsTheManager,
        callerIsNotTheManager() {
          testAsHasRole({
            publicRoleIsRequired,
            specificRoleIsRequired,
          });
        },
      });
    },
  });
}

/**
 * @requires this.{target,calldata,roles,role}
 */
function testAsHasRole({ publicRoleIsRequired, specificRoleIsRequired }) {
  describe('when the function requires the caller to be granted with the PUBLIC_ROLE', function () {
    beforeEach('set target function role as PUBLIC_ROLE', async function () {
      this.role = this.roles.PUBLIC;
      await this.manager.$_setTargetFunctionRole(
        this.target.address,
        this.calldata.substring(0, 10),
        this.role.id,
        { from: this.roles.ADMIN.members[0] },
      );
    });

    publicRoleIsRequired();
  });

  describe('when the function requires the caller to be granted with a role other than PUBLIC_ROLE', function () {
    beforeEach('set target function role', async function () {
      await this.manager.$_setTargetFunctionRole(
        this.target.address,
        this.calldata.substring(0, 10),
        this.role.id,
        { from: this.roles.ADMIN.members[0] },
      );
    });

    testAsGetAccess(specificRoleIsRequired);
  });
}

/**
 * @requires this.{manager,role,caller}
 */
function testAsGetAccess({
  requiredRoleIsGranted: {
    roleGrantingIsDelayed: {
      // Because both grant and execution delay are set within the same $_grantRole call
      // it's not possible to create a set of tests that diverge between grant and execution delay.
      // Therefore, the testAsDelay arguments are renamed for clarity:
      // before => beforeGrantDelay
      // after => afterGrantDelay
      callerHasAnExecutionDelay: { beforeGrantDelay: case1, afterGrantDelay: case2 },
      callerHasNoExecutionDelay: { beforeGrantDelay: case3, afterGrantDelay: case4 },
    },
    roleGrantingIsNotDelayed: { callerHasAnExecutionDelay: case5, callerHasNoExecutionDelay: case6 },
  },
  requiredRoleIsNotGranted,
}) {
  describe('when the required role is granted to the caller', function () {
    describe('when role granting is delayed', function () {
      beforeEach('define delay', function () {
        this.grantDelay = time.duration.minutes(3);
        this.delay = this.grantDelay; // For testAsDelay
      });

      describe('when caller has an execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = time.duration.hours(10);
          this.delay = this.grantDelay;
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        testAsDelay('grant', { before: case1, after: case2 });
      });

      describe('when caller has no execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = web3.utils.toBN(0);
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        testAsDelay('grant', { before: case3, after: case4 });
      });
    });

    describe('when role granting is not delayed', function () {
      beforeEach('define delay', function () {
        this.grantDelay = web3.utils.toBN(0);
      });

      describe('when caller has an execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = time.duration.hours(10);
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        case5();
      });

      describe('when caller has no execution delay', function () {
        beforeEach('set role and delay', async function () {
          this.executionDelay = web3.utils.toBN(0);
          await this.manager.$_grantRole(this.role.id, this.caller, this.grantDelay, this.executionDelay);
        });

        case6();
      });
    });
  });

  describe('when role is not granted', function () {
    // Because this helper can be composed with other helpers, it's possible
    // that role has been set already by another helper.
    // Although this is highly unlikely, we check for it here to avoid false positives.
    beforeEach('assert role is unset', async function () {
      const { since } = await this.manager.getAccess(this.role.id, this.caller);
      expect(since).to.be.bignumber.equal(web3.utils.toBN(0));
    });

    requiredRoleIsNotGranted();
  });
}

module.exports = {
  LIKE_COMMON_IS_EXECUTING,
  LIKE_COMMON_GET_ACCESS,
  LIKE_COMMON_SCHEDULABLE,
  testAsClosable,
  testAsDelay,
  testAsSchedulableOperation,
  testAsRestrictedOperation,
  testAsDelayedOperation,
  testAsCanCall,
  testAsHasRole,
  testAsGetAccess,
};
