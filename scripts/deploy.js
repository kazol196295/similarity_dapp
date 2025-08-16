const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log("🚀 Deploying AdvancedPostManager...");

    const AdvancedPostManager = await hre.ethers.getContractFactory("AdvancedPostManager");
    const contract = await AdvancedPostManager.deploy();

    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();

    console.log("✅ AdvancedPostManager deployed to:", contractAddress);
    console.log("📝 Update your .env file with:");
    console.log(`CONTRACT_ADDRESS=${contractAddress}`);

    const threshold = await contract.similarityThreshold();
    console.log("🎯 Similarity threshold:", threshold.toString() + "%");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});



//new
//0x289E5e7B27d76EDC39D092b503F80f6c6264a738