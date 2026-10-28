// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Voting
 * @notice Secure E-Voting Smart Contract with complete election lifecycle management.
 * @dev Enforces timing, registration, and single-vote rules entirely on-chain.
 *      Candidate IDs are 1-indexed (1 .. candidatesCount).
 *      NMAMIT Project Code 08 — ISE Department.
 */
contract Voting {

    // ──────────────────────────────────────────────────────────────────────────
    // State: Commissioner
    // ──────────────────────────────────────────────────────────────────────────

    address public electionCommissioner;

    // ──────────────────────────────────────────────────────────────────────────
    // State: Election Lifecycle
    // ──────────────────────────────────────────────────────────────────────────

    enum ElectionStatus { NotStarted, Open, Closed }

    ElectionStatus public electionStatus;
    uint256 public electionStart;   // Unix timestamp — election opens
    uint256 public electionEnd;     // Unix timestamp — election closes

    // ──────────────────────────────────────────────────────────────────────────
    // State: Candidates & Voters
    // ──────────────────────────────────────────────────────────────────────────

    struct Candidate {
        uint256 id;
        string  name;
        uint256 voteCount;
    }

    struct Voter {
        bool    isRegistered;
        bool    hasVoted;
        bytes32 biometricHash;   // SHA-256 hash of the 128-d biometric embedding
    }

    mapping(address  => Voter)     public voters;
    mapping(uint256  => Candidate) public candidates;
    uint256 public candidatesCount;

    // ──────────────────────────────────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────────────────────────────────

    event ElectionCreated(address indexed commissioner, uint256 candidateCount);
    event ElectionOpened(uint256 indexed startTime, uint256 indexed endTime);
    event ElectionClosed(uint256 closedAt, uint256 totalVotes);
    event VoterRegistered(address indexed voterAddress, bytes32 biometricHash);
    event VoteCasted(address indexed voterAddress, uint256 indexed candidateId);

    // ──────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────────────────────────────────

    modifier onlyCommissioner() {
        require(
            msg.sender == electionCommissioner,
            "Caller is not the Election Commissioner."
        );
        _;
    }

    modifier electionIsOpen() {
        require(
            electionStatus == ElectionStatus.Open,
            "Election is not currently open."
        );
        require(
            block.timestamp >= electionStart,
            "Election has not started yet."
        );
        require(
            block.timestamp <= electionEnd,
            "Election voting period has ended."
        );
        _;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @param candidateNames Array of candidate display names.
     * @dev Deploys in NotStarted status. Commissioner must call openElection() separately.
     */
    constructor(string[] memory candidateNames) {
        electionCommissioner = msg.sender;
        electionStatus = ElectionStatus.NotStarted;

        for (uint256 i = 0; i < candidateNames.length; i++) {
            _addCandidate(candidateNames[i]);
        }

        emit ElectionCreated(msg.sender, candidateNames.length);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Commissioner Functions
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Opens the election for the specified time window.
     * @param _startTime Unix timestamp when voting begins.
     * @param _endTime   Unix timestamp when voting ends. Must be > _startTime.
     * @dev Can only be called once (election must be in NotStarted status).
     */
    function openElection(uint256 _startTime, uint256 _endTime)
        external
        onlyCommissioner
    {
        require(
            electionStatus == ElectionStatus.NotStarted,
            "Election has already been opened or closed."
        );
        require(
            _endTime > _startTime,
            "End time must be after start time."
        );
        require(
            _startTime + 60 >= block.timestamp,
            "Start time cannot be in the past."
        );

        electionStart  = _startTime;
        electionEnd    = _endTime;
        electionStatus = ElectionStatus.Open;

        emit ElectionOpened(_startTime, _endTime);
    }

    /**
     * @notice Closes the election early (before electionEnd) or at any time after Open.
     * @dev Once closed, no more votes can be cast.
     */
    function closeElection() external onlyCommissioner {
        require(
            electionStatus == ElectionStatus.Open,
            "Election is not currently open."
        );

        electionStatus = ElectionStatus.Closed;

        uint256 total = _totalVotes();
        emit ElectionClosed(block.timestamp, total);
    }

    /**
     * @notice Registers a voter on-chain. Only callable by the Election Commissioner.
     * @param _voter         Ethereum address of the voter wallet.
     * @param _biometricHash SHA-256 hash of the voter's biometric embedding.
     */
    function registerVoter(address _voter, bytes32 _biometricHash)
        external
        onlyCommissioner
    {
        require(!voters[_voter].isRegistered, "Voter is already registered.");
        require(_biometricHash != bytes32(0), "Invalid biometric hash.");

        voters[_voter] = Voter(true, false, _biometricHash);
        emit VoterRegistered(_voter, _biometricHash);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Voter Functions
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Casts a ballot. Enforces all restrictions on-chain.
     * @param _candidateId   Candidate to vote for (1-indexed).
     * @param _biometricHash Live biometric hash — must match enrolled hash exactly.
     */
    function castVote(uint256 _candidateId, bytes32 _biometricHash)
        external
        electionIsOpen
    {
        Voter storage sender = voters[msg.sender];

        require(sender.isRegistered,                                     "You are not registered to vote.");
        require(!sender.hasVoted,                                        "You have already cast your ballot.");
        require(sender.biometricHash == _biometricHash,                  "Biometric hash mismatch.");
        require(_candidateId > 0 && _candidateId <= candidatesCount,    "Invalid candidate selected.");

        sender.hasVoted = true;
        candidates[_candidateId].voteCount++;

        emit VoteCasted(msg.sender, _candidateId);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns candidate details by ID.
     */
    function getCandidate(uint256 _candidateId)
        external
        view
        returns (uint256, string memory, uint256)
    {
        require(_candidateId > 0 && _candidateId <= candidatesCount, "Invalid candidate ID.");
        Candidate memory c = candidates[_candidateId];
        return (c.id, c.name, c.voteCount);
    }

    /**
     * @notice Returns the full election lifecycle info in one call.
     * @return status       0=NotStarted, 1=Open, 2=Closed
     * @return startTime    Unix timestamp
     * @return endTime      Unix timestamp
     * @return totalVotes_  Aggregate vote count across all candidates
     * @return votingNow    True if block.timestamp is within the open voting window
     */
    function getElectionInfo()
        external
        view
        returns (
            uint8  status,
            uint256 startTime,
            uint256 endTime,
            uint256 totalVotes_,
            bool    votingNow
        )
    {
        status      = uint8(electionStatus);
        startTime   = electionStart;
        endTime     = electionEnd;
        totalVotes_ = _totalVotes();
        votingNow   = (
            electionStatus == ElectionStatus.Open &&
            block.timestamp >= electionStart &&
            block.timestamp <= electionEnd
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Internal Helpers
    // ──────────────────────────────────────────────────────────────────────────

    function _addCandidate(string memory name) internal {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
    }

    function _totalVotes() internal view returns (uint256 total) {
        for (uint256 i = 1; i <= candidatesCount; i++) {
            total += candidates[i].voteCount;
        }
    }
}