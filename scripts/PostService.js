//frontend/PostService.js
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS;
const ORACLE_SERVICE_URL = process.env.REACT_APP_ORACLE_SERVICE_URL || 'http://localhost:3001';

// You'll need to paste your contract ABI here
const contractABI = [/* Paste your contract ABI here */];

class PostService {
    constructor() {
        this.provider = new ethers.BrowserProvider(window.ethereum);
        this.contract = new ethers.Contract(
            CONTRACT_ADDRESS,
            contractABI,
            this.provider
        );
    }

    async submitPost(content, username) {
        try {
            console.log('📝 Submitting post...');

            // Step 1: Submit to blockchain (gas-optimized)
            const signer = await this.provider.getSigner();
            const contractWithSigner = this.contract.connect(signer);
            const walletAddress = await signer.getAddress();

            const tx = await contractWithSigner.submitPost(username);
            console.log('📤 Transaction sent:', tx.hash);

            const receipt = await tx.wait();
            console.log('✅ Transaction confirmed');

            // Extract post ID from events
            const postSubmittedEvent = receipt.logs.find(log => {
                try {
                    const parsed = this.contract.interface.parseLog(log);
                    return parsed.name === 'PostSubmitted';
                } catch (e) {
                    return false;
                }
            });

            if (postSubmittedEvent) {
                const parsedLog = this.contract.interface.parseLog(postSubmittedEvent);
                const postId = parsedLog.args[0];

                console.log('🆔 Post ID:', postId.toString());

                // Step 2: Send content to oracle service
                await this.sendContentToOracle(postId, content, username, walletAddress);

                return {
                    success: true,
                    postId: postId.toString(),
                    txHash: receipt.hash
                };
            }

            throw new Error('Post submission failed - no event found');

        } catch (error) {
            console.error('❌ Submission error:', error);
            return { success: false, error: error.message };
        }
    }

    async sendContentToOracle(postId, content, username, walletAddress) {
        try {
            console.log('📤 Sending content to oracle...');

            const response = await fetch(`${ORACLE_SERVICE_URL}/store-content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    postId: postId.toString(),
                    content,
                    username,
                    walletAddress
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('✅ Content sent to oracle:', result);

        } catch (error) {
            console.error('❌ Failed to send content to oracle:', error);
            throw error;
        }
    }

    async getPostStatus(postId) {
        try {
            const post = await this.contract.getPost(postId);
            return {
                id: ethers.toNumber(post.id),
                author: post.author,
                username: post.username,
                status: post.status, // 0: Pending, 1: Rejected, 2: Approved, 3: Failed
                similarityScore: ethers.toNumber(post.similarityScore),
                mostSimilarPostId: post.mostSimilarPostId,
                ipfsCID: post.ipfsCID,
                timestamp: new Date(ethers.toNumber(post.timestamp) * 1000)
            };
        } catch (error) {
            console.error('❌ Status check error:', error);
            return null;
        }
    }

    async getApprovedPosts(offset = 0, limit = 20) {
        try {
            const posts = await this.contract.getApprovedPosts(offset, limit);
            const postsWithContent = [];

            for (const post of posts) {
                if (post.ipfsCID) {
                    try {
                        // Fetch content from IPFS
                        const ipfsResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${post.ipfsCID}`);
                        const ipfsData = await ipfsResponse.json();

                        postsWithContent.push({
                            id: ethers.toNumber(post.id),
                            author: post.author,
                            username: post.username,
                            content: ipfsData.content,
                            ipfsCID: post.ipfsCID,
                            timestamp: new Date(ethers.toNumber(post.timestamp) * 1000),
                            similarityScore: ethers.toNumber(post.similarityScore)
                        });
                    } catch (ipfsError) {
                        console.error(`Failed to fetch IPFS content for post ${post.id}:`, ipfsError);
                    }
                }
            }

            return postsWithContent;
        } catch (error) {
            console.error('❌ Posts fetch error:', error);
            return [];
        }
    }

    // Listen for post status updates
    listenForPostUpdates(postId, callback) {
        const approvedFilter = this.contract.filters.PostApproved(postId);
        const rejectedFilter = this.contract.filters.PostRejected(postId);
        const failedFilter = this.contract.filters.PostFailed(postId);

        this.contract.on(approvedFilter, (id, ipfsCID) => {
            callback({ type: 'approved', postId: id, ipfsCID });
        });

        this.contract.on(rejectedFilter, (id, score, similarId) => {
            callback({ type: 'rejected', postId: id, similarityScore: score, similarId });
        });

        this.contract.on(failedFilter, (id, reason) => {
            callback({ type: 'failed', postId: id, reason });
        });

        // Return cleanup function
        return () => {
            this.contract.off(approvedFilter);
            this.contract.off(rejectedFilter);
            this.contract.off(failedFilter);
        };
    }
}

export default PostService;