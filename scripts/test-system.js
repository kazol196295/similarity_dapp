
const hre = require("hardhat");
const axios = require("axios");
require("dotenv").config();

async function main() {
    console.log('🧪 Testing the complete system...');

    const contract = await hre.ethers.getContractAt("AdvancedPostManager", process.env.CONTRACT_ADDRESS);

    console.log('📄 Contract:', process.env.CONTRACT_ADDRESS);
    console.log('⚙️ Threshold:', (await contract.similarityThreshold()).toString() + '%');

    // Test 1: Submit post to blockchain
    console.log('\n📝 Test 1: Submitting post to blockchain...');
    const tx = await contract.submitPost("testuser123");
    console.log('📤 Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('✅ Transaction confirmed');

    // Extract post ID
    const postSubmittedLog = receipt.logs.find(log => {
        try {
            const parsed = contract.interface.parseLog(log);
            return parsed.name === 'PostSubmitted';
        } catch (e) {
            return false;
        }
    });

    if (!postSubmittedLog) {
        console.error('❌ No PostSubmitted event found');
        return;
    }

    const parsedLog = contract.interface.parseLog(postSubmittedLog);
    const postId = parsedLog.args[0];
    console.log('🆔 Post ID:', postId.toString());

    // Test 2: Send content to oracle
    console.log('\n📤 Test 2: Sending content to oracle service...');
    const testContent = "This is a test post about blockchain technology and smart contracts.";

    try {
        const response = await axios.post('http://localhost:3001/store-content', {
            postId: postId.toString(),
            content: testContent,
            username: "testuser123",
            walletAddress: "0x742d35Cc6cf32A2bfB16021f27a9670529DDbB73"
        });

        console.log('✅ Content sent to oracle:', response.data);
    } catch (error) {
        console.error('❌ Failed to send content to oracle:', error.message);
        return;
    }

    // Test 3: Monitor post status
    console.log('\n👀 Test 3: Monitoring post status...');
    console.log('⏰ Checking status every 5 seconds...');

    let attempts = 0;
    const maxAttempts = 12; // 1 minute total

    const checkStatus = async () => {
        try {
            const post = await contract.getPost(postId);
            const statusNames = ['Pending', 'Rejected', 'Approved', 'Failed'];

            console.log(`📊 Status: ${statusNames[post.status]} | Score: ${post.similarityScore}% | CID: ${post.ipfsCID || 'None'}`);

            if (post.status === 2) { // Approved
                console.log('🎉 SUCCESS! Post approved and saved to IPFS!');
                console.log('📎 IPFS CID:', post.ipfsCID);
                console.log('🌐 View at: https://gateway.pinata.cloud/ipfs/' + post.ipfsCID);
                return true;
            } else if (post.status === 1) { // Rejected
                console.log('❌ Post rejected due to high similarity');
                console.log('🔗 Similar to post:', post.mostSimilarPostId);
                return true;
            } else if (post.status === 3) { // Failed
                console.log('💥 Post processing failed');
                return true;
            }

            return false; // Still pending
        } catch (error) {
            console.error('❌ Error checking status:', error.message);
            return false;
        }
    };

    const interval = setInterval(async () => {
        attempts++;
        const completed = await checkStatus();

        if (completed || attempts >= maxAttempts) {
            clearInterval(interval);
            if (attempts >= maxAttempts) {
                console.log('⏰ Timeout reached - check oracle service logs');
            }
            console.log('\n✅ Test completed!');
        }
    }, 5000);
}

main().catch(console.error);

