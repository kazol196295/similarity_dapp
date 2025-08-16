// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AdvancedPostManager {
    struct Post {
        uint256 id;
        address author;
        string username;
        string ipfsCID;
        uint256 timestamp;
        PostStatus status;
        uint256 similarityScore;
        string mostSimilarPostId;
    }
    
    enum PostStatus { 
        Pending,
        Rejected,
        Approved,
        Failed
    }
    
    uint256 public postCount;
    uint256 public similarityThreshold = 80;
    address public oracle;
    
    mapping(uint256 => Post) public posts;
    mapping(address => uint256[]) public userPosts;
    
    event PostSubmitted(uint256 indexed postId, address indexed author, string username);
    event SimilarityCheckRequested(uint256 indexed postId);
    event PostRejected(uint256 indexed postId, uint256 similarityScore, string mostSimilarPostId);
    event PostApproved(uint256 indexed postId, string ipfsCID);
    event PostFailed(uint256 indexed postId, string reason);
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this");
        _;
    }
    
    constructor() {
        oracle = msg.sender;
    }
    
    function setOracle(address _oracle) public onlyOracle {
        oracle = _oracle;
    }
    
    function setSimilarityThreshold(uint256 _threshold) public onlyOracle {
        require(_threshold <= 100, "Threshold must be <= 100");
        similarityThreshold = _threshold;
    }
    
    function submitPost(string memory username) public returns (uint256) {
        require(bytes(username).length > 0, "Username required");
        
        postCount++;
        
        posts[postCount] = Post({
            id: postCount,
            author: msg.sender,
            username: username,
            ipfsCID: "",
            timestamp: block.timestamp,
            status: PostStatus.Pending,
            similarityScore: 0,
            mostSimilarPostId: ""
        });
        
        userPosts[msg.sender].push(postCount);
        
        emit PostSubmitted(postCount, msg.sender, username);
        emit SimilarityCheckRequested(postCount);
        
        return postCount;
    }
    
    function processSimilarityResult(
        uint256 postId,
        uint256 similarityScore,
        string memory mostSimilarPostId,
        string memory ipfsCID
    ) public onlyOracle {
        require(postId <= postCount && postId > 0, "Invalid post ID");
        require(posts[postId].status == PostStatus.Pending, "Post not pending");
        
        Post storage post = posts[postId];
        post.similarityScore = similarityScore;
        post.mostSimilarPostId = mostSimilarPostId;
        
        if (similarityScore >= similarityThreshold) {
            post.status = PostStatus.Rejected;
            emit PostRejected(postId, similarityScore, mostSimilarPostId);
        } else {
            require(bytes(ipfsCID).length > 0, "IPFS CID required for approval");
            post.status = PostStatus.Approved;
            post.ipfsCID = ipfsCID;
            emit PostApproved(postId, ipfsCID);
        }
    }
    
    function markPostFailed(uint256 postId, string memory reason) public onlyOracle {
        require(postId <= postCount && postId > 0, "Invalid post ID");
        require(posts[postId].status == PostStatus.Pending, "Post not pending");
        
        posts[postId].status = PostStatus.Failed;
        emit PostFailed(postId, reason);
    }
    
    function getPost(uint256 postId) public view returns (Post memory) {
        require(postId <= postCount && postId > 0, "Invalid post ID");
        return posts[postId];
    }
    
    function getUserPosts(address user) public view returns (uint256[] memory) {
        return userPosts[user];
    }
    
    function getApprovedPosts(uint256 offset, uint256 limit) public view returns (Post[] memory) {
        uint256 approvedCount = 0;
        
        for (uint256 i = 1; i <= postCount; i++) {
            if (posts[i].status == PostStatus.Approved) {
                approvedCount++;
            }
        }
        
        uint256 resultLength = limit;
        if (offset + limit > approvedCount) {
            resultLength = approvedCount > offset ? approvedCount - offset : 0;
        }
        
        Post[] memory result = new Post[](resultLength);
        uint256 currentIndex = 0;
        uint256 skipped = 0;
        
        for (uint256 i = 1; i <= postCount && currentIndex < resultLength; i++) {
            if (posts[i].status == PostStatus.Approved) {
                if (skipped >= offset) {
                    result[currentIndex] = posts[i];
                    currentIndex++;
                } else {
                    skipped++;
                }
            }
        }
        
        return result;
    }
    
    function getAllApprovedPostsWithContent() public view returns (Post[] memory) {
        uint256 approvedCount = 0;
        
        for (uint256 i = 1; i <= postCount; i++) {
            if (posts[i].status == PostStatus.Approved) {
                approvedCount++;
            }
        }
        
        Post[] memory result = new Post[](approvedCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 1; i <= postCount; i++) {
            if (posts[i].status == PostStatus.Approved) {
                result[currentIndex] = posts[i];
                currentIndex++;
            }
        }
        
        return result;
    }
}