import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Corevo } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Corevo", function () {
  let corevo: Corevo;
  let proposer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let carol: HardhatEthersSigner;
  let outsider: HardhatEthersSigner;

  const COMMIT_DURATION = 3600; // 1 hour
  const REVEAL_DURATION = 3600; // 1 hour
  const DUMMY_CONTEXT = ethers.keccak256(ethers.toUtf8Bytes("RFC-42: adopt cats"));
  const COMMON_SALT = ethers.randomBytes(32);
  const EMPTY_SALT = new Uint8Array(0);

  // Vote encodings matching the contract (1=Aye, 2=Nay, 3=Abstain)
  const Vote = { Aye: 1, Nay: 2, Abstain: 3 };

  // Helper: compute commitment the same way the contract does
  function computeCommitment(
    vote: number,
    oneTimeSalt: Uint8Array,
    commonSalt: Uint8Array
  ): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["uint8", "bytes32", "bytes32"],
        [vote, oneTimeSalt, commonSalt]
      )
    );
  }

  // Helper: verify a vote off-chain (as a group member would)
  function verifyVoteOffChain(
    commitment: string,
    oneTimeSalt: string,
    commonSalt: Uint8Array
  ): number | null {
    for (const v of [Vote.Aye, Vote.Nay, Vote.Abstain]) {
      const computed = ethers.keccak256(
        ethers.solidityPacked(
          ["uint8", "bytes32", "bytes32"],
          [v, oneTimeSalt, commonSalt]
        )
      );
      if (computed === commitment) return v;
    }
    return null;
  }

  beforeEach(async function () {
    [proposer, alice, bob, carol, outsider] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("Corevo");
    corevo = await factory.deploy();
  });

  // ─── Key Announcement ─────────────────────────────────────────────

  describe("Key Announcement", function () {
    it("should register an encryption key", async function () {
      const pubKey = ethers.randomBytes(32);
      await expect(corevo.connect(alice).announceKey(pubKey))
        .to.emit(corevo, "KeyAnnounced")
        .withArgs(alice.address, ethers.hexlify(pubKey));

      expect(await corevo.encryptionKeys(alice.address)).to.equal(
        ethers.hexlify(pubKey)
      );
    });

    it("should allow updating a key", async function () {
      const key1 = ethers.randomBytes(32);
      const key2 = ethers.randomBytes(32);
      await corevo.connect(alice).announceKey(key1);
      await corevo.connect(alice).announceKey(key2);
      expect(await corevo.encryptionKeys(alice.address)).to.equal(
        ethers.hexlify(key2)
      );
    });

    it("should reject a zero key", async function () {
      await expect(
        corevo.connect(alice).announceKey(ethers.ZeroHash)
      ).to.be.revertedWithCustomError(corevo, "ZeroPubKey");
    });
  });

  // ─── Proposal Creation ────────────────────────────────────────────

  describe("Proposal Creation", function () {
    it("should create a proposal and emit events", async function () {
      const voters = [alice.address, bob.address];
      const salts = [EMPTY_SALT, EMPTY_SALT];

      const tx = await corevo
        .connect(proposer)
        .createProposal(DUMMY_CONTEXT, voters, salts, true, COMMIT_DURATION, REVEAL_DURATION);

      await expect(tx)
        .to.emit(corevo, "ProposalCreated")
        .withArgs(0, proposer.address, DUMMY_CONTEXT, true, () => true, () => true);

      await expect(tx)
        .to.emit(corevo, "VoterInvited")
        .withArgs(0, alice.address, "0x");

      const p = await corevo.proposals(0);
      expect(p.proposer).to.equal(proposer.address);
      expect(p.phase).to.equal(0); // Commit
      expect(p.voterCount).to.equal(2);
    });

    it("should reject empty voter list", async function () {
      await expect(
        corevo.createProposal(DUMMY_CONTEXT, [], [], true, COMMIT_DURATION, REVEAL_DURATION)
      ).to.be.revertedWithCustomError(corevo, "NoVoters");
    });

    it("should reject mismatched arrays", async function () {
      await expect(
        corevo.createProposal(
          DUMMY_CONTEXT,
          [alice.address, bob.address],
          [EMPTY_SALT],
          true,
          COMMIT_DURATION,
          REVEAL_DURATION
        )
      ).to.be.revertedWithCustomError(corevo, "ArrayLengthMismatch");
    });

    it("should reject zero durations", async function () {
      await expect(
        corevo.createProposal(
          DUMMY_CONTEXT,
          [alice.address],
          [EMPTY_SALT],
          true,
          0,
          REVEAL_DURATION
        )
      ).to.be.revertedWithCustomError(corevo, "InvalidDuration");
    });

    it("should store voter list retrievable via getVoters", async function () {
      const voters = [alice.address, bob.address, carol.address];
      const salts = [EMPTY_SALT, EMPTY_SALT, EMPTY_SALT];
      await corevo.createProposal(DUMMY_CONTEXT, voters, salts, true, COMMIT_DURATION, REVEAL_DURATION);

      const stored = await corevo.getVoters(0);
      expect(stored).to.deep.equal(voters);
    });
  });

  // ─── Commit Phase ─────────────────────────────────────────────────

  describe("Commit Phase", function () {
    let oneTimeSaltAlice: Uint8Array;

    beforeEach(async function () {
      oneTimeSaltAlice = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );
    });

    it("should accept a valid commitment", async function () {
      const commitment = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      await expect(corevo.connect(alice).commitVote(0, commitment))
        .to.emit(corevo, "VoteCommitted")
        .withArgs(0, alice.address, commitment);

      const p = await corevo.proposals(0);
      expect(p.commitCount).to.equal(1);
    });

    it("should reject non-voter", async function () {
      const commitment = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      await expect(
        corevo.connect(outsider).commitVote(0, commitment)
      ).to.be.revertedWithCustomError(corevo, "NotAVoter");
    });

    it("should reject double commitment", async function () {
      const commitment = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      await corevo.connect(alice).commitVote(0, commitment);
      await expect(
        corevo.connect(alice).commitVote(0, commitment)
      ).to.be.revertedWithCustomError(corevo, "AlreadyCommitted");
    });

    it("should reject commitment after deadline", async function () {
      await time.increase(COMMIT_DURATION + 1);
      const commitment = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      await expect(
        corevo.connect(alice).commitVote(0, commitment)
      ).to.be.revertedWithCustomError(corevo, "CommitPhaseEnded");
    });
  });

  // ─── Reveal Phase ─────────────────────────────────────────────────

  describe("Reveal Phase", function () {
    let oneTimeSaltAlice: Uint8Array;
    let oneTimeSaltBob: Uint8Array;

    beforeEach(async function () {
      oneTimeSaltAlice = ethers.randomBytes(32);
      oneTimeSaltBob = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      // Both commit
      const commitAlice = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      const commitBob = computeCommitment(Vote.Nay, oneTimeSaltBob, COMMON_SALT);
      await corevo.connect(alice).commitVote(0, commitAlice);
      await corevo.connect(bob).commitVote(0, commitBob);

      // Advance past commit deadline
      await time.increase(COMMIT_DURATION + 1);
    });

    it("should accept a valid salt reveal", async function () {
      await expect(
        corevo.connect(alice).revealSalt(0, oneTimeSaltAlice)
      )
        .to.emit(corevo, "SaltRevealed")
        .withArgs(0, alice.address, ethers.hexlify(oneTimeSaltAlice));

      expect(await corevo.revealedSalts(0, alice.address)).to.equal(
        ethers.hexlify(oneTimeSaltAlice)
      );
    });

    it("should reject double reveal", async function () {
      await corevo.connect(alice).revealSalt(0, oneTimeSaltAlice);
      await expect(
        corevo.connect(alice).revealSalt(0, oneTimeSaltAlice)
      ).to.be.revertedWithCustomError(corevo, "AlreadyRevealed");
    });

    it("should reject reveal before commit deadline", async function () {
      // Create fresh proposal
      await corevo.createProposal(
        ethers.keccak256(ethers.toUtf8Bytes("fresh")),
        [alice.address],
        [EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );
      const freshId = 1;
      const ots = ethers.randomBytes(32);
      const cm = computeCommitment(Vote.Aye, ots, COMMON_SALT);
      await corevo.connect(alice).commitVote(freshId, cm);

      // Try to reveal immediately (still in commit phase)
      await expect(
        corevo.connect(alice).revealSalt(freshId, ots)
      ).to.be.revertedWithCustomError(corevo, "NotInRevealPhase");
    });

    it("should reject reveal after reveal deadline", async function () {
      await time.increase(REVEAL_DURATION + 1);
      await expect(
        corevo.connect(alice).revealSalt(0, oneTimeSaltAlice)
      ).to.be.revertedWithCustomError(corevo, "RevealPhaseEnded");
    });

    it("should reject zero salt", async function () {
      await expect(
        corevo.connect(alice).revealSalt(0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(corevo, "ZeroSalt");
    });

    it("should reject reveal from someone who didn't commit", async function () {
      await corevo.createProposal(
        ethers.keccak256(ethers.toUtf8Bytes("another")),
        [carol.address],
        [EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );
      await time.increase(COMMIT_DURATION + 1);
      await expect(
        corevo.connect(carol).revealSalt(1, ethers.randomBytes(32))
      ).to.be.revertedWithCustomError(corevo, "NotCommitted");
    });
  });

  // ─── Group Privacy ────────────────────────────────────────────────

  describe("Group Privacy", function () {
    let oneTimeSaltAlice: Uint8Array;
    let oneTimeSaltBob: Uint8Array;
    let commitmentAlice: string;
    let commitmentBob: string;

    beforeEach(async function () {
      oneTimeSaltAlice = ethers.randomBytes(32);
      oneTimeSaltBob = ethers.randomBytes(32);

      commitmentAlice = computeCommitment(Vote.Aye, oneTimeSaltAlice, COMMON_SALT);
      commitmentBob = computeCommitment(Vote.Nay, oneTimeSaltBob, COMMON_SALT);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      await corevo.connect(alice).commitVote(0, commitmentAlice);
      await corevo.connect(bob).commitVote(0, commitmentBob);

      await time.increase(COMMIT_DURATION + 1);

      await corevo.connect(alice).revealSalt(0, oneTimeSaltAlice);
      await corevo.connect(bob).revealSalt(0, oneTimeSaltBob);
    });

    it("group members with commonSalt CAN verify votes off-chain", async function () {
      const revealedA = await corevo.revealedSalts(0, alice.address);
      const revealedB = await corevo.revealedSalts(0, bob.address);

      // A group member who has the commonSalt can brute-force 3 options
      const aliceVote = verifyVoteOffChain(commitmentAlice, revealedA, COMMON_SALT);
      const bobVote = verifyVoteOffChain(commitmentBob, revealedB, COMMON_SALT);

      expect(aliceVote).to.equal(Vote.Aye);
      expect(bobVote).to.equal(Vote.Nay);
    });

    it("outsiders without commonSalt CANNOT determine votes", async function () {
      const revealedA = await corevo.revealedSalts(0, alice.address);
      const wrongCommonSalt = ethers.randomBytes(32);

      // An outsider tries to verify with a random salt — no match
      const result = verifyVoteOffChain(commitmentAlice, revealedA, wrongCommonSalt);
      expect(result).to.be.null;
    });

    it("the vote value never appears on-chain (no VoteRevealed event)", async function () {
      // The SaltRevealed event only contains the one-time salt, not the vote
      const filter = corevo.filters.SaltRevealed(0, alice.address);
      const events = await corevo.queryFilter(filter);
      expect(events).to.have.lengthOf(1);

      // The event args are: proposalId, voter, oneTimeSalt — no vote field
      const args = events[0].args;
      expect(args.length).to.equal(3);
      expect(args[0]).to.equal(0n); // proposalId
      expect(args[1]).to.equal(alice.address); // voter
      // args[2] is oneTimeSalt — no vote anywhere
    });
  });

  // ─── Full Lifecycle ───────────────────────────────────────────────

  describe("Full Lifecycle", function () {
    it("should auto-finish when all committers reveal their salts", async function () {
      const otsA = ethers.randomBytes(32);
      const otsB = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      await corevo.connect(alice).commitVote(0, computeCommitment(Vote.Aye, otsA, COMMON_SALT));
      await corevo.connect(bob).commitVote(0, computeCommitment(Vote.Nay, otsB, COMMON_SALT));

      await time.increase(COMMIT_DURATION + 1);

      // Reveal alice — still in Reveal phase
      await corevo.connect(alice).revealSalt(0, otsA);
      let p = await corevo.proposals(0);
      expect(p.phase).to.equal(1); // Reveal

      // Reveal bob → auto-finish
      const tx = await corevo.connect(bob).revealSalt(0, otsB);
      await expect(tx).to.emit(corevo, "ProposalFinished").withArgs(0);

      p = await corevo.proposals(0);
      expect(p.phase).to.equal(2); // Finished

      const progress = await corevo.getRevealProgress(0);
      expect(progress.committed).to.equal(2);
      expect(progress.revealed).to.equal(2);
      expect(progress.unrevealed).to.equal(0);
    });

    it("should allow manual finalization after reveal deadline", async function () {
      const otsA = ethers.randomBytes(32);
      const otsB = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      // Both commit, only alice reveals
      await corevo.connect(alice).commitVote(0, computeCommitment(Vote.Aye, otsA, COMMON_SALT));
      await corevo.connect(bob).commitVote(0, computeCommitment(Vote.Nay, otsB, COMMON_SALT));
      await time.increase(COMMIT_DURATION + 1);
      await corevo.connect(alice).revealSalt(0, otsA);

      // Can't finalize yet
      await expect(
        corevo.finalizeProposal(0)
      ).to.be.revertedWithCustomError(corevo, "RevealPhaseNotEnded");

      // Advance past reveal deadline
      await time.increase(REVEAL_DURATION + 1);

      await expect(corevo.finalizeProposal(0))
        .to.emit(corevo, "ProposalFinished")
        .withArgs(0);

      const progress = await corevo.getRevealProgress(0);
      expect(progress.committed).to.equal(2);
      expect(progress.revealed).to.equal(1);
      expect(progress.unrevealed).to.equal(1); // bob never revealed
    });

    it("should handle 3-voter proposal end-to-end", async function () {
      const otsA = ethers.randomBytes(32);
      const otsB = ethers.randomBytes(32);
      const otsC = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address, carol.address],
        [EMPTY_SALT, EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      const cmA = computeCommitment(Vote.Aye, otsA, COMMON_SALT);
      const cmB = computeCommitment(Vote.Nay, otsB, COMMON_SALT);
      const cmC = computeCommitment(Vote.Abstain, otsC, COMMON_SALT);

      await corevo.connect(alice).commitVote(0, cmA);
      await corevo.connect(bob).commitVote(0, cmB);
      await corevo.connect(carol).commitVote(0, cmC);

      await time.increase(COMMIT_DURATION + 1);

      await corevo.connect(alice).revealSalt(0, otsA);
      await corevo.connect(bob).revealSalt(0, otsB);
      await corevo.connect(carol).revealSalt(0, otsC);

      // Verify off-chain
      const revA = await corevo.revealedSalts(0, alice.address);
      const revB = await corevo.revealedSalts(0, bob.address);
      const revC = await corevo.revealedSalts(0, carol.address);

      expect(verifyVoteOffChain(cmA, revA, COMMON_SALT)).to.equal(Vote.Aye);
      expect(verifyVoteOffChain(cmB, revB, COMMON_SALT)).to.equal(Vote.Nay);
      expect(verifyVoteOffChain(cmC, revC, COMMON_SALT)).to.equal(Vote.Abstain);
    });
  });

  // ─── computeCommitment view ───────────────────────────────────────

  describe("computeCommitment helper", function () {
    it("should match client-side computation", async function () {
      const ots = ethers.randomBytes(32);
      const cs = ethers.randomBytes(32);
      const onChain = await corevo.computeCommitment(Vote.Aye, ots, cs);
      const offChain = computeCommitment(Vote.Aye, ots, cs);
      expect(onChain).to.equal(offChain);
    });
  });

  // ─── isRevealOpen view ────────────────────────────────────────────

  describe("isRevealOpen", function () {
    beforeEach(async function () {
      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address],
        [EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );
    });

    it("should return false during commit phase", async function () {
      expect(await corevo.isRevealOpen(0)).to.be.false;
    });

    it("should return true during reveal window", async function () {
      await time.increase(COMMIT_DURATION + 1);
      expect(await corevo.isRevealOpen(0)).to.be.true;
    });

    it("should return false after reveal deadline", async function () {
      await time.increase(COMMIT_DURATION + REVEAL_DURATION + 2);
      expect(await corevo.isRevealOpen(0)).to.be.false;
    });
  });

  // ─── Multiple Proposals ───────────────────────────────────────────

  describe("Multiple Proposals", function () {
    it("should track proposals independently", async function () {
      const ots1 = ethers.randomBytes(32);
      const ots2 = ethers.randomBytes(32);
      const cs1 = ethers.randomBytes(32);
      const cs2 = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address],
        [EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      await corevo.createProposal(
        ethers.keccak256(ethers.toUtf8Bytes("second")),
        [bob.address],
        [EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      await corevo.connect(alice).commitVote(0, computeCommitment(Vote.Aye, ots1, cs1));
      await corevo.connect(bob).commitVote(1, computeCommitment(Vote.Nay, ots2, cs2));

      await time.increase(COMMIT_DURATION + 1);

      await corevo.connect(alice).revealSalt(0, ots1);
      await corevo.connect(bob).revealSalt(1, ots2);

      // Both finished independently
      const p0 = await corevo.proposals(0);
      const p1 = await corevo.proposals(1);
      expect(p0.phase).to.equal(2); // Finished
      expect(p1.phase).to.equal(2); // Finished

      // Verify independently
      const revA = await corevo.revealedSalts(0, alice.address);
      const revB = await corevo.revealedSalts(1, bob.address);
      const cmA = computeCommitment(Vote.Aye, ots1, cs1);
      const cmB = computeCommitment(Vote.Nay, ots2, cs2);

      expect(verifyVoteOffChain(cmA, revA, cs1)).to.equal(Vote.Aye);
      expect(verifyVoteOffChain(cmB, revB, cs2)).to.equal(Vote.Nay);
    });
  });

  // ─── getRevealProgress ────────────────────────────────────────────

  describe("getRevealProgress", function () {
    it("should track commit and reveal counts", async function () {
      const otsA = ethers.randomBytes(32);
      const otsB = ethers.randomBytes(32);

      await corevo.createProposal(
        DUMMY_CONTEXT,
        [alice.address, bob.address],
        [EMPTY_SALT, EMPTY_SALT],
        true,
        COMMIT_DURATION,
        REVEAL_DURATION
      );

      let prog = await corevo.getRevealProgress(0);
      expect(prog.committed).to.equal(0);
      expect(prog.revealed).to.equal(0);

      await corevo.connect(alice).commitVote(0, computeCommitment(Vote.Aye, otsA, COMMON_SALT));
      await corevo.connect(bob).commitVote(0, computeCommitment(Vote.Nay, otsB, COMMON_SALT));

      prog = await corevo.getRevealProgress(0);
      expect(prog.committed).to.equal(2);
      expect(prog.revealed).to.equal(0);
      expect(prog.unrevealed).to.equal(2);

      await time.increase(COMMIT_DURATION + 1);
      await corevo.connect(alice).revealSalt(0, otsA);

      prog = await corevo.getRevealProgress(0);
      expect(prog.committed).to.equal(2);
      expect(prog.revealed).to.equal(1);
      expect(prog.unrevealed).to.equal(1);
    });
  });
});
