import { ethers } from "hardhat";

async function main() {
  const Corevo = await ethers.getContractFactory("Corevo");
  const corevo = await Corevo.deploy();
  await corevo.waitForDeployment();
  console.log("Corevo deployed to:", await corevo.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
