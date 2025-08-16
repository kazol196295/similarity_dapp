
const hre = require("hardhat");
require("dotenv").config();

async function main() {
    const contract = await hre.ethers.getContractAt("AdvancedPostManager", process.env.CONTRACT_ADDRESS);

    console.log('👀 Monitoring all contract events...\n');

    contract.on("PostSubmitted", (postId, author, username) => {
        console.log(`📝 POST SUBMITTED: ID=${postId} Author=${author} Username=${username}`);
    });

    contract.on("PostApproved", (postId, ipfsCID) => {
        console.log(`✅ POST APPROVED: ID=${postId} CID=${ipfsCID}`);
    });

    contract.on("PostRejected", (postId, score, similarId) => {
        console.log(`❌ POST REJECTED: ID=${postId} Score=${score}% Similar=${similarId}`);
    });

    contract.on("PostFailed", (postId, reason) => {
        console.log(`💥 POST FAILED: ID=${postId} Reason=${reason}`);
    });
}

main().catch(console.error);

