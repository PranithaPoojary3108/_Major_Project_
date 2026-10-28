import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toHex } from "viem";

function keccak256Bytes32(input: string): `0x${string}` {
  return keccak256(toHex(input));
}

describe("Voting — Election Lifecycle", async function () {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const testClient = await viem.getTestClient();
  const walletClients = await viem.getWalletClients();

  const commissionerClient = walletClients[0];
  const voter1Client = walletClients[1];
  const voter2Client = walletClients[2];
  const strangerClient = walletClients[3];

  async function deployVoting() {
    const candidateNames = ["Alice", "Bob", "Charlie"];
    const voting = await viem.deployContract("Voting", [candidateNames], {
      client: { wallet: commissionerClient },
    });
    return { voting };
  }

  it("1. Commissioner can open election with valid timing", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 60n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const info = await voting.read.getElectionInfo();
    assert.equal(info[0], 1); // Open
    assert.equal(info[1], startTime);
    assert.equal(info[2], endTime);
  });

  it("2. Cannot open election when end time <= start time", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 300n;
    const endTime = now + 60n; // Invalid: end < start

    await assert.rejects(
      async () => {
        await voting.write.openElection([startTime, endTime], {
          account: commissionerClient.account,
        });
      },
      (err: Error) => {
        return err.message.includes("End time must be after start time");
      }
    );
  });

  it("3. Non-commissioner cannot open the election", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 60n;
    const endTime = now + 3600n;

    await assert.rejects(
      async () => {
        await voting.write.openElection([startTime, endTime], {
          account: strangerClient.account,
        });
      },
      (err: Error) => {
        return err.message.includes("Caller is not the Election Commissioner");
      }
    );
  });

  it("4. Cannot vote when election has not been opened yet", async function () {
    const { voting } = await deployVoting();
    const bioHash = keccak256Bytes32("voter1-bio");

    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    await assert.rejects(
      async () => {
        await voting.write.castVote([1n, bioHash], {
          account: voter1Client.account,
        });
      },
      (err: Error) => {
        return err.message.includes("Election is not currently open");
      }
    );
  });

  it("5. Cannot vote before startTime even after openElection is called", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 600n; // 10 minutes in the future
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const bioHash = keccak256Bytes32("voter1-bio");
    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    await assert.rejects(
      async () => {
        await voting.write.castVote([1n, bioHash], {
          account: voter1Client.account,
        });
      },
      (err: Error) => {
        return err.message.includes("Election has not started yet");
      }
    );
  });

  it("6. Registered voter can cast a valid ballot during open window", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const bioHash = keccak256Bytes32("voter1-bio");
    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    // Advance time past startTime
    await testClient.increaseTime({ seconds: 20 });
    await testClient.mine({ blocks: 1 });

    await voting.write.castVote([2n, bioHash], {
      account: voter1Client.account,
    });

    const voterData = await voting.read.voters([voter1Client.account.address]);
    assert.equal(voterData[1], true); // hasVoted = true

    const candidate = await voting.read.getCandidate([2n]);
    assert.equal(candidate[2], 1n); // voteCount = 1
  });

  it("7. Second ballot from same voter is rejected by smart contract", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const bioHash = keccak256Bytes32("voter1-bio");
    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    await testClient.increaseTime({ seconds: 20 });
    await testClient.mine({ blocks: 1 });

    // First vote
    await voting.write.castVote([1n, bioHash], {
      account: voter1Client.account,
    });

    // Duplicate vote
    await assert.rejects(
      async () => {
        await voting.write.castVote([2n, bioHash], {
          account: voter1Client.account,
        });
      },
      (err: Error) => {
        return err.message.includes("You have already cast your ballot");
      }
    );
  });

  it("8. Ballot is rejected after election end time passes", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 100n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const bioHash = keccak256Bytes32("voter1-bio");
    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    // Advance time past endTime
    await testClient.increaseTime({ seconds: 200 });
    await testClient.mine({ blocks: 1 });

    await assert.rejects(
      async () => {
        await voting.write.castVote([1n, bioHash], {
          account: voter1Client.account,
        });
      },
      (err: Error) => {
        return err.message.includes("Election voting period has ended");
      }
    );
  });

  it("9. Vote with out-of-range candidate ID is rejected", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const bioHash = keccak256Bytes32("voter1-bio");
    await voting.write.registerVoter([voter1Client.account.address, bioHash], {
      account: commissionerClient.account,
    });

    await testClient.increaseTime({ seconds: 20 });
    await testClient.mine({ blocks: 1 });

    await assert.rejects(
      async () => {
        await voting.write.castVote([99n, bioHash], {
          account: voter1Client.account,
        });
      },
      (err: Error) => {
        return err.message.includes("Invalid candidate selected");
      }
    );
  });

  it("10. Unregistered account cannot cast a ballot", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    await testClient.increaseTime({ seconds: 20 });
    await testClient.mine({ blocks: 1 });

    const dummyHash = keccak256Bytes32("stranger-bio");

    await assert.rejects(
      async () => {
        await voting.write.castVote([1n, dummyHash], {
          account: strangerClient.account,
        });
      },
      (err: Error) => {
        return err.message.includes("You are not registered to vote");
      }
    );
  });

  it("11. Correct vote counting and election close", async function () {
    const { voting } = await deployVoting();
    const currentBlock = await publicClient.getBlock();
    const now = currentBlock.timestamp;
    const startTime = now + 10n;
    const endTime = now + 3600n;

    await voting.write.openElection([startTime, endTime], {
      account: commissionerClient.account,
    });

    const hash1 = keccak256Bytes32("voter1-bio");
    const hash2 = keccak256Bytes32("voter2-bio");

    await voting.write.registerVoter([voter1Client.account.address, hash1], {
      account: commissionerClient.account,
    });
    await voting.write.registerVoter([voter2Client.account.address, hash2], {
      account: commissionerClient.account,
    });

    await testClient.increaseTime({ seconds: 20 });
    await testClient.mine({ blocks: 1 });

    // Both vote for candidate 3
    await voting.write.castVote([3n, hash1], { account: voter1Client.account });
    await voting.write.castVote([3n, hash2], { account: voter2Client.account });

    const cand3 = await voting.read.getCandidate([3n]);
    assert.equal(cand3[2], 2n);

    const info = await voting.read.getElectionInfo();
    assert.equal(info[3], 2n); // totalVotes = 2

    // Commissioner closes election
    await voting.write.closeElection({ account: commissionerClient.account });

    const closedInfo = await voting.read.getElectionInfo();
    assert.equal(closedInfo[0], 2); // Closed
  });
});
