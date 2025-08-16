const { ethers } = require('ethers');
const axios = require('axios');
const FormData = require('form-data');
const express = require('express');
const cors = require('cors');
//require('dotenv').config();
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });


// Load contract ABI  
//const contractJson = require('../oracle/abi/AdvancedPostManager.json');
const contractJson = require('../artifacts/contracts/AdvancedPostManager.sol/AdvancedPostManager.json');
const contractABI = contractJson.abi;

class PostOracleService {
    constructor() {
        console.log('🚀 Initializing Oracle Service...');

        this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
        this.wallet = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(
            process.env.CONTRACT_ADDRESS,
            contractABI,
            this.wallet
        );

        // Temporary storage for pending posts
        this.pendingPosts = new Map();

        this.pinataApiKey = process.env.PINATA_API_KEY;
        this.pinataSecretKey = process.env.PINATA_SECRET_KEY;

        console.log('📝 Oracle Address:', this.wallet.address);
        console.log('📄 Contract Address:', process.env.CONTRACT_ADDRESS);

        this.setupHttpServer();
    }

    setupHttpServer() {
        this.app = express();
        this.app.use(cors());
        this.app.use(express.json());

        // Endpoint to receive content from frontend
        this.app.post('/store-content', (req, res) => {
            try {
                const { postId, content, username, walletAddress } = req.body;

                console.log(`📥 Received content for post ${postId}`);

                this.pendingPosts.set(postId.toString(), {
                    content,
                    username,
                    wallet_address: walletAddress
                });

                res.json({ success: true, message: 'Content stored for processing' });
            } catch (error) {
                console.error('❌ Error storing content:', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', pendingPosts: this.pendingPosts.size });
        });

        const PORT =  process.env.ORACLE_PORT || 3001;
        this.app.listen(PORT, () => console.log(`🌐 Oracle HTTP server on ${PORT}`));

    }

    async startListening() {
        console.log('👂 Oracle service started and listening for blockchain events...');
        console.log('⏳ Waiting for posts to be submitted...');

        // Subscribe to your actual contract event (must exist in ABI)
        this.contract.on('SimilarityCheckRequested', async (postId) => {
            console.log(`\n🔍 Similarity check requested for post ${postId}`);
            setTimeout(() => { this.processSimilarityCheck(postId); }, 2000);
        });

        // Optional: catch unhandled promise rejections and exceptions
        process.on('unhandledRejection', (reason) => {
            console.error('🛑 Unhandled Rejection:', reason);
        });
        process.on('uncaughtException', (err) => {
            console.error('🛑 Uncaught Exception:', err);
        });

        // Optional: if you switch to a WebSocketProvider, you can listen for provider errors:
        // if (this.provider.on) {
        //   this.provider.on('error', (e) => console.error('🔌 Provider error:', e));
        // }
    }


    async processSimilarityCheck(postId) {
        try {
            console.log(`\n🔄 Processing similarity check for post ${postId}...`);

            // Get original content from temporary storage
            const originalContent = this.pendingPosts.get(postId.toString());
            if (!originalContent) {
                console.log('⏳ Content not received yet, waiting...');
                // Retry after 3 seconds
                setTimeout(() => this.processSimilarityCheck(postId), 3000);
                return;
            }

            console.log('📝 Content received, proceeding with similarity check...');

            // Call your FastAPI similarity service
            const similarityResult = await this.callYourFastAPI(originalContent.content);

            const threshold = await this.contract.similarityThreshold();
            console.log(`📈 Similarity score: ${similarityResult.similarity_score}%`);
            console.log(`🎯 Threshold: ${threshold}%`);

            if (similarityResult.similarity_score >= threshold) {
                console.log(`❌ Post ${postId} REJECTED - similarity too high`);

                const mostSimilarId = similarityResult.documents.length > 0
                    ? similarityResult.documents[0].id
                    : "";

                const tx = await this.contract.processSimilarityResult(
                    postId,
                    Math.round(similarityResult.similarity_score),
                    mostSimilarId,
                    ""
                );

                console.log(`📝 Rejection transaction: ${tx.hash}`);
                await tx.wait();
                console.log(`✅ Post ${postId} rejection confirmed`);
            } else {
                console.log(`✅ Post ${postId} APPROVED - uploading to IPFS...`);

                // Create complete post data for IPFS
                const postData = {
                    post_id: postId.toString(),
                    content: originalContent.content,
                    username: originalContent.username,
                    wallet_address: originalContent.wallet_address,
                    timestamp: new Date().toISOString(),
                    similarity_analysis: {
                        similarity_score: similarityResult.similarity_score,
                        most_similar_posts: similarityResult.documents
                    }
                };

                const ipfsCID = await this.uploadToPinata(postData);
                console.log(`📎 IPFS CID: ${ipfsCID}`);

                const mostSimilarId = similarityResult.documents.length > 0
                    ? similarityResult.documents[0].id
                    : "";

                const tx = await this.contract.processSimilarityResult(
                    postId,
                    Math.round(similarityResult.similarity_score),
                    mostSimilarId,
                    ipfsCID
                );

                console.log(`📝 Approval transaction: ${tx.hash}`);
                await tx.wait();
                console.log(`🎉 Post ${postId} approved and saved!`);
            }

            // Clean up
            this.pendingPosts.delete(postId.toString());

        } catch (error) {
            console.error(`💥 Error processing post ${postId}:`, error);
            try {
                const tx = await this.contract.markPostFailed(postId, error.message);
                await tx.wait();
                console.log(`⚠️ Post ${postId} marked as failed`);
            } catch (markError) {
                console.error(`💥 Failed to mark post as failed:`, markError);
            }
        }
    }

    async callYourFastAPI(content) {
        try {
            console.log('🤖 Calling your FastAPI similarity service...');

            const response = await axios.post(
                'https://kontho-kosh-server-production.up.railway.app/api/v1/generate/similarity',
                {
                    text: content,
                    top_k: 5
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                }
            );

            console.log('✅ FastAPI response received');
            return response.data;

        } catch (error) {
            console.error('🤖 FastAPI error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
            // Return default values if API fails
            return {
                similarity_score: 0,
                documents: []
            };
        }
    }

    async uploadToPinata(postData) {
        try {
            console.log('📤 Uploading to Pinata IPFS...');

            const name = `post-${postData.post_id}-${postData.username}`; // any naming you prefer

            const body = {
                pinataOptions: { cidVersion: 1 },
                pinataMetadata: {
                    name,
                    keyvalues: {
                        postId: postData.post_id,
                        username: postData.username
                    }
                },
                pinataContent: postData
            };

            const response = await axios.post(
                'https://api.pinata.cloud/pinning/pinJSONToIPFS',
                body,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'pinata_api_key': this.pinataApiKey,
                        'pinata_secret_api_key': this.pinataSecretKey
                    }
                }
            );

            console.log('✅ Successfully uploaded to Pinata');
            return response.data.IpfsHash;
        } catch (error) {
            console.error('📤 Pinata upload error:', error.message);
            throw new Error('Failed to upload to Pinata');
        }
    }
}

// Start the oracle service
console.log('🌟 Starting Post Oracle Service...');
const oracle = new PostOracleService();
oracle.startListening().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
});