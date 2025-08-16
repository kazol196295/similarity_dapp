const hre = require("hardhat");
require("dotenv").config();

async function main() {
    console.log('🔧 Setting up oracle address in smart contract...');

    const contractAddress = process.env.CONTRACT_ADDRESS;
    const oracleWallet = new hre.ethers.Wallet(process.env.ORACLE_PRIVATE_KEY);
    const oracleAddress = oracleWallet.address;

    console.log('📄 Contract Address:', contractAddress);
    console.log('🤖 Oracle Address:', oracleAddress);

    const contract = await hre.ethers.getContractAt("AdvancedPostManager", contractAddress);

    console.log('⏳ Setting oracle address...');
    const tx = await contract.setOracle(oracleAddress);
    console.log('📝 Transaction sent:', tx.hash);

    await tx.wait();
    console.log('✅ Oracle address set successfully!');
}

main().catch((error) => {
    console.error('❌ Error:', error);
    process.exitCode = 1;
});