// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CoReVo — Commit-Reveal Voting for Small Groups
/// @notice On-chain enforcement of the CoReVo protocol (https://github.com/brenzi/corevo)
/// @dev Designed for Revive on Kusama Hub / Paseo testnet.
///
/// Protocol phases:
///   1. Key Announcement — participants register X25519 public keys
///   2. Proposal Creation — proposer defines context, invites voters with
///      individually-encrypted common salts (emitted as events)
///   3. Commit — voters submit keccak256(vote ‖ oneTimeSalt ‖ commonSalt)
///   4. Reveal — voters publish ONLY their oneTimeSalt on-chain
///
/// Privacy guarantee: the commonSalt never appears on-chain. Only group
/// members who received the encrypted commonSalt can brute-force the 3
/// vote options against each commitment to determine votes. Outsiders see
/// commitments and one-time salts but cannot reconstruct votes.
///
/// Verification and tallying happen off-chain by group members.
contract Corevo {
    // ─── Types ───────────────────────────────────────────────────────

    enum Phase {
        Commit,   // voters may submit commitments
        Reveal,   // voters publish their one-time salts
        Finished  // all salts revealed or deadline passed
    }

    struct Proposal {
        address proposer;
        string  context;
        Phase   phase;
        bool    isPublic;          // if true, commonSalt is public knowledge
        uint64  commitDeadline;
        uint64  revealDeadline;
        uint32  voterCount;
        uint32  commitCount;
        uint32  revealCount;
    }

    // ─── State ───────────────────────────────────────────────────────

    uint256 public proposalCount;

    /// proposalId => Proposal
    mapping(uint256 => Proposal) public proposals;

    /// proposalId => voter address list (for enumeration)
    mapping(uint256 => address[]) internal _voterLists;

    /// proposalId => voter => is eligible
    mapping(uint256 => mapping(address => bool)) public isVoter;

    /// proposalId => voter => commitment hash
    mapping(uint256 => mapping(address => bytes32)) public commitments;

    /// proposalId => voter => revealed one-time salt (zero until revealed)
    mapping(uint256 => mapping(address => bytes32)) public revealedSalts;

    /// Global encryption key registry (one per account, reusable across proposals)
    mapping(address => bytes32) public encryptionKeys;

    // ─── Events ──────────────────────────────────────────────────────

    /// @notice Emitted when a participant registers their X25519 public key.
    event KeyAnnounced(address indexed account, bytes32 pubKey);

    /// @notice Emitted when a new proposal is created.
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string  context,
        bool    isPublic,
        uint64  commitDeadline,
        uint64  revealDeadline
    );

    /// @notice Emitted for each invited voter. `encryptedSalt` contains the
    ///         common salt encrypted to this voter's X25519 key. For public
    ///         proposals this may carry the plaintext common salt.
    event VoterInvited(
        uint256 indexed proposalId,
        address indexed voter,
        bytes   encryptedSalt
    );

    /// @notice Emitted when a voter submits a commitment.
    event VoteCommitted(
        uint256 indexed proposalId,
        address indexed voter,
        bytes32 commitment
    );

    /// @notice Emitted when a voter reveals their one-time salt.
    ///         Group members can now verify this voter's commitment off-chain.
    event SaltRevealed(
        uint256 indexed proposalId,
        address indexed voter,
        bytes32 oneTimeSalt
    );

    /// @notice Emitted when a proposal enters the Finished phase.
    event ProposalFinished(uint256 indexed proposalId);

    // ─── Errors ──────────────────────────────────────────────────────

    error NoVoters();
    error ArrayLengthMismatch();
    error InvalidDuration();
    error NotInCommitPhase();
    error CommitPhaseEnded();
    error NotAVoter();
    error AlreadyCommitted();
    error NotInRevealPhase();
    error NotCommitted();
    error AlreadyRevealed();
    error AlreadyFinished();
    error RevealPhaseNotEnded();
    error ZeroPubKey();
    error ZeroSalt();

    // ─── Phase 1: Key Announcement ──────────────────────────────────

    /// @notice Register (or update) your X25519 public key.
    /// @param pubKey 32-byte X25519 public key.
    function announceKey(bytes32 pubKey) external {
        if (pubKey == bytes32(0)) revert ZeroPubKey();
        encryptionKeys[msg.sender] = pubKey;
        emit KeyAnnounced(msg.sender, pubKey);
    }

    // ─── Phase 2: Proposal Creation ─────────────────────────────────

    /// @notice Create a new commit-reveal vote.
    /// @param context      Short description of what is being voted on.
    /// @param voters       Addresses eligible to vote.
    /// @param encryptedSalts Per-voter encrypted common salts (same order as
    ///                     `voters`). For public proposals pass the plaintext
    ///                     common salt; for private ones, the X25519-encrypted
    ///                     ciphertext for each voter.
    /// @param isPublic     If true, the common salt is considered public.
    /// @param commitDuration  Seconds from now until commit phase ends.
    /// @param revealDuration  Seconds after commit phase until reveal ends.
    /// @return proposalId  The id of the newly created proposal.
    function createProposal(
        string    calldata context,
        address[] calldata voters,
        bytes[]   calldata encryptedSalts,
        bool      isPublic,
        uint64    commitDuration,
        uint64    revealDuration
    ) external returns (uint256 proposalId) {
        if (voters.length == 0) revert NoVoters();
        if (voters.length != encryptedSalts.length) revert ArrayLengthMismatch();
        if (commitDuration == 0 || revealDuration == 0) revert InvalidDuration();

        proposalId = proposalCount++;

        Proposal storage p = proposals[proposalId];
        p.proposer       = msg.sender;
        p.context        = context;
        p.phase          = Phase.Commit;
        p.isPublic       = isPublic;
        p.commitDeadline = uint64(block.timestamp) + commitDuration;
        p.revealDeadline = uint64(block.timestamp) + commitDuration + revealDuration;
        p.voterCount     = uint32(voters.length);

        for (uint256 i = 0; i < voters.length; i++) {
            address v = voters[i];
            isVoter[proposalId][v] = true;
            _voterLists[proposalId].push(v);
            emit VoterInvited(proposalId, v, encryptedSalts[i]);
        }

        emit ProposalCreated(
            proposalId,
            msg.sender,
            context,
            isPublic,
            p.commitDeadline,
            p.revealDeadline
        );
    }

    // ─── Phase 3: Commit ────────────────────────────────────────────

    /// @notice Submit a vote commitment.
    /// @dev    commitment = keccak256(abi.encodePacked(uint8(vote), oneTimeSalt, commonSalt))
    ///         where vote is 1=Aye, 2=Nay, 3=Abstain.
    ///         The commonSalt MUST NOT appear anywhere on-chain.
    /// @param proposalId The proposal to vote on.
    /// @param commitment The blinded commitment hash.
    function commitVote(uint256 proposalId, bytes32 commitment) external {
        Proposal storage p = proposals[proposalId];
        if (p.phase != Phase.Commit)                              revert NotInCommitPhase();
        if (block.timestamp > p.commitDeadline)                   revert CommitPhaseEnded();
        if (!isVoter[proposalId][msg.sender])                     revert NotAVoter();
        if (commitments[proposalId][msg.sender] != bytes32(0))    revert AlreadyCommitted();

        commitments[proposalId][msg.sender] = commitment;
        p.commitCount++;

        emit VoteCommitted(proposalId, msg.sender, commitment);
    }

    // ─── Phase 4: Reveal (salt only) ────────────────────────────────

    /// @notice Reveal your one-time salt. This is the ONLY data published
    ///         on-chain during the reveal phase — the vote itself and the
    ///         common salt stay off-chain.
    ///
    ///         The reveal deadline is SOFT: voters may reveal after the
    ///         deadline as long as the proposal has not been finalized.
    ///
    ///         Group members can verify your vote off-chain by trying all 3
    ///         vote options:
    ///           for v in {Aye, Nay, Abstain}:
    ///             if keccak256(v ‖ oneTimeSalt ‖ commonSalt) == commitment → match
    ///
    /// @param proposalId  The proposal.
    /// @param oneTimeSalt The random salt you chose at commit time.
    function revealSalt(uint256 proposalId, bytes32 oneTimeSalt) external {
        Proposal storage p = proposals[proposalId];

        // Transition Commit → Reveal when commit deadline passes
        _ensureRevealPhase(p);

        if (commitments[proposalId][msg.sender] == bytes32(0))    revert NotCommitted();
        if (revealedSalts[proposalId][msg.sender] != bytes32(0))  revert AlreadyRevealed();
        if (oneTimeSalt == bytes32(0))                             revert ZeroSalt();

        revealedSalts[proposalId][msg.sender] = oneTimeSalt;
        p.revealCount++;

        emit SaltRevealed(proposalId, msg.sender, oneTimeSalt);

        // Auto-finish when everyone who committed has revealed
        if (p.revealCount == p.commitCount) {
            p.phase = Phase.Finished;
            emit ProposalFinished(proposalId);
        }
    }

    /// @notice Finalize a proposal after the reveal deadline, even if not
    ///         all voters revealed their salts.
    /// @param proposalId The proposal to finalize.
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        if (p.phase == Phase.Finished) revert AlreadyFinished();
        if (block.timestamp <= p.revealDeadline) revert RevealPhaseNotEnded();

        p.phase = Phase.Finished;
        emit ProposalFinished(proposalId);
    }

    // ─── Views ───────────────────────────────────────────────────────

    /// @notice Get the voter list for a proposal.
    function getVoters(uint256 proposalId) external view returns (address[] memory) {
        return _voterLists[proposalId];
    }

    /// @notice Get reveal progress for a proposal.
    function getRevealProgress(uint256 proposalId)
        external
        view
        returns (uint32 committed, uint32 revealed, uint32 unrevealed)
    {
        Proposal storage p = proposals[proposalId];
        committed  = p.commitCount;
        revealed   = p.revealCount;
        unrevealed = p.commitCount - p.revealCount;
    }

    /// @notice Pure helper: compute the commitment hash. Useful for clients.
    /// @dev    vote encoding: 1=Aye, 2=Nay, 3=Abstain
    function computeCommitment(
        uint8   vote,
        bytes32 oneTimeSalt,
        bytes32 commonSalt
    ) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(vote, oneTimeSalt, commonSalt));
    }

    /// @notice Check whether the proposal currently accepts salt reveals.
    ///         The reveal deadline is soft — reveals are accepted until the
    ///         proposal is finalized (either by all committers revealing or
    ///         by someone calling finalizeProposal after the deadline).
    function isRevealOpen(uint256 proposalId) external view returns (bool) {
        Proposal storage p = proposals[proposalId];
        return p.phase != Phase.Finished
            && block.timestamp > p.commitDeadline;
    }

    // ─── Internal ────────────────────────────────────────────────────

    /// @dev Transitions from Commit → Reveal when the commit deadline passes.
    function _ensureRevealPhase(Proposal storage p) internal {
        if (p.phase == Phase.Finished) revert AlreadyFinished();
        if (p.phase == Phase.Commit) {
            if (block.timestamp <= p.commitDeadline) revert NotInRevealPhase();
            p.phase = Phase.Reveal;
        }
    }
}
