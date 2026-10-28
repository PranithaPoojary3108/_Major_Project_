// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Voting {
    address public electionCommissioner;

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    struct Voter {
        bool isRegistered;
        bool hasVoted;
        bytes32 biometricHash; // SHA-256 hash of the 128-d embedding
    }

    mapping(address => Voter) public voters;
    mapping(uint256 => Candidate) public candidates;
    uint256 public candidatesCount;

    event VoterRegistered(address indexed voterAddress, bytes32 biometricHash);
    event VoteCasted(address indexed voterAddress, uint256 indexed candidateId);

    modifier onlyCommissioner() {
        require(msg.sender == electionCommissioner, "Caller is not Election Commissioner.");
        _;
    }

    constructor(string[] memory candidateNames) {
        electionCommissioner = msg.sender;
        for (uint256 i = 0; i < candidateNames.length; i++) {
            _addCandidate(candidateNames[i]);
        }
    }

    function _addCandidate(string memory name) internal {
        candidatesCount++;
        candidates[candidatesCount] = Candidate(candidatesCount, name, 0);
    }

    function registerVoter(address _voter, bytes32 _biometricHash) external onlyCommissioner {
        require(!voters[_voter].isRegistered, "Voter is already registered.");
        require(_biometricHash != bytes32(0), "Invalid biometric hash.");

        voters[_voter] = Voter(true, false, _biometricHash);
        emit VoterRegistered(_voter, _biometricHash);
    }

    function castVote(uint256 _candidateId, bytes32 _biometricHash) external {
        Voter storage sender = voters[msg.sender];

        require(sender.isRegistered, "You are not registered to vote.");
        require(!sender.hasVoted, "You have already cast your ballot.");
        require(sender.biometricHash == _biometricHash, "Biometric hash mismatch.");
        require(_candidateId > 0 && _candidateId <= candidatesCount, "Invalid candidate selected.");

        sender.hasVoted = true;
        candidates[_candidateId].voteCount++;

        emit VoteCasted(msg.sender, _candidateId);
    }

    function getCandidate(uint256 _candidateId) external view returns (uint256, string memory, uint256) {
        require(_candidateId > 0 && _candidateId <= candidatesCount, "Invalid candidate ID.");
        Candidate memory c = candidates[_candidateId];
        return (c.id, c.name, c.voteCount);
    }
}