import { ethers } from "hardhat";

async function main() {
  const candidateNames = [
    "Pranitha C Poojary (NNM23IS134)",
    "Srajan J Poojary (NNM22IS173)",
    "Aashna Mathias (NNM23IS001)",
    "Abhimanyu Rai B S (NNM23IS002)",
    "Pranjali N (NNM23IS135)",
    "Raksha S Suvarna (NNM23IS143)",
    "Nireeksha (NNM23IS111)",
    "H Nihal Shetty (NNM23IS074)",
    "Rishika Rajesh Kumar (NNM23IS147)",
    "Spoorthi (NNM23IS183)"
  ];

  console.log("Deploying Voting contract with candidates:", candidateNames);
  console.log("Note: Election is deployed in NotStarted status.");
  console.log("      Call openElection() via the Flask API or Hardhat console to begin voting.");

  const Voting = await ethers.getContractFactory("Voting");
  const voting = await Voting.deploy(candidateNames);
  await voting.waitForDeployment();

  const address = await voting.getAddress();
  console.log(`\nVoting contract deployed successfully to: ${address}`);
  console.log("\nNext step: Start the Flask backend and call POST /api/open-election to set timing.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});