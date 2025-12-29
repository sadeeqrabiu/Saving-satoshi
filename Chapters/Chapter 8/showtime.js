/**
 * SAVING SATOSHI - CHAPTER 8: SHOWTIME
 * 
 * CHALLENGE OVERVIEW:
 * -------------------
 * In this challenge, we implement Bitcoin's chain selection algorithm - the core
 * mechanism that allows nodes to agree on which blockchain is the "correct" one.
 * 
 * Bitcoin uses the "longest valid chain" rule (actually "most accumulated work",
 * but for simplicity here we use height). When there are multiple competing chains
 * (forks), nodes must:
 *   1. Validate each block according to consensus rules
 *   2. Track valid chain tips
 *   3. Select the longest valid chain as the canonical chain
 * 
 * KEY CONCEPTS:
 * -------------
 * • Block Subsidy: The reward miners receive for creating a new block.
 *   Started at 50 BTC and halves every 210,000 blocks (~4 years).
 * 
 * • Transaction Fees: The difference between a transaction's inputs and outputs.
 *   Miners collect these fees as additional reward.
 * 
 * • Coinbase Transaction: The first transaction in every block (tx[0]).
 *   Its output must equal: subsidy + total_fees (no more, no less!)
 * 
 * • Chain Tips: The latest blocks at the end of each branch of the blockchain.
 * 
 */

const Bitcoinrpc = require('@savingsatoshi/bitcoin_rpcjs');
const Bitcoin = new Bitcoinrpc();

/**
 * Calculates the transaction fee for a given transaction.
 * 
 * In Bitcoin, the transaction fee is implicit - it's not stated directly.
 * Instead, it's the difference between total input value and total output value.
 * 
 * Formula: fee = Σ(inputs) - Σ(outputs)
 * 
 * @param {Object} tx - A transaction object containing inputs and outputs arrays
 * @returns {number} The transaction fee in satoshis
 * 
 * Example:
 *   If a tx has inputs totaling 100,000 sats and outputs totaling 99,000 sats,
 *   the fee is 1,000 sats (which goes to the miner).
 */
const getTxFee = (tx) => {
  let fee = 0;
  
  // Sum up all input values (what's being spent)
  for (const input of tx["inputs"]) {
    fee += input["value"];
  }
  
  // Subtract all output values (what's being sent/received)
  for (const output of tx["outputs"]) {
    fee -= output["value"];
  }
  
  return fee;
};

/**
 * Calculates the block subsidy (mining reward) at a given block height.
 * 
 * Bitcoin's monetary policy is built into the protocol:
 * - Initial subsidy: 50 BTC (5,000,000,000 satoshis)
 * - Halving interval: Every 210,000 blocks (~4 years)
 * - Maximum halvings: 64 (after which subsidy becomes 0)
 * 
 * Halving Schedule:
 *   Block 0 - 209,999:       50.00000000 BTC
 *   Block 210,000 - 419,999: 25.00000000 BTC
 *   Block 420,000 - 629,999: 12.50000000 BTC
 *   Block 630,000 - 839,999:  6.25000000 BTC
 *   ... and so on until the subsidy reaches 0
 * 
 * This creates Bitcoin's famous 21 million coin supply cap!
 * 
 * @param {number} height - The block height
 * @returns {number} The subsidy in satoshis
 */
function getSubsidy(height) {
  // Calculate how many halvings have occurred
  // Each "era" lasts 210,000 blocks
  const halvings = BigInt(Math.floor(height / 210000));

  // After 64 halvings, the subsidy becomes 0 (all 21M BTC mined)
  if (halvings >= 64) {
    return 0n;
  }

  // Initial subsidy: 50 BTC = 5,000,000,000 satoshis (100M sats per BTC)
  let subsidy = BigInt(5000000000);
  
  // Right bit-shift is equivalent to dividing by 2^n
  // Example: 50 >> 1 = 25, 50 >> 2 = 12, etc.
  // This efficiently calculates: 50 / (2^halvings)
  subsidy >>= halvings;

  return Number(subsidy);
}

/**
 * Validates a block according to Bitcoin's coinbase output rule.
 * 
 * The coinbase transaction (first tx in block) is special - it creates new
 * Bitcoin out of thin air. However, the amount is strictly controlled:
 * 
 *   coinbase_output MUST EQUAL (subsidy + total_fees)
 * 
 * If a miner tries to pay themselves more than allowed, the block is INVALID.
 * If they pay themselves less, that's allowed (though wasteful - those sats are lost forever!).
 * 
 * @param {Object} block - A block object with height and txs array
 * @returns {boolean} True if the block is valid, false otherwise
 */
const validateBlock = (block) => {
  // Get the expected subsidy for this block height
  let subsidy = getSubsidy(block["height"]);
  
  // Calculate total fees from all transactions (skip coinbase at index 0)
  let fee = 0;
  for (let i = 1; i < block["txs"].length; i++) {
    fee += getTxFee(block["txs"][i]);
  }

  // Check: Does coinbase output match subsidy + fees?
  // block["txs"][0] is the coinbase transaction
  // Its first output should contain exactly the allowed reward
  return subsidy + fee === block["txs"][0]["outputs"][0]["value"];
};

/**
 * ============================================================================
 * SHOWTIME: THE MAIN CHAIN SELECTION ALGORITHM
 * ============================================================================
 * 
 * This function implements Bitcoin's chain selection - finding the longest
 * valid chain among potentially many competing forks.
 * 
 * ALGORITHM OVERVIEW:
 * 1. Start from a known block height and iterate through all blocks
 * 2. For each height, there may be multiple candidate blocks (forks!)
 * 3. Validate each block:
 *    - Skip if parent block was invalid (bad chain)
 *    - Skip if block itself fails validation
 * 4. Track valid chain "tips" (latest blocks of each valid branch)
 * 5. After processing all blocks, find the tip with maximum height
 * 6. Reconstruct the full chain by following parent links backwards
 * 
 * DATA STRUCTURES:
 * - tips: {hash -> block} - Current tips of valid chains
 * - prevs: {hash -> parentHash} - Parent mapping for chain reconstruction
 * - invalid: [hash, ...] - List of invalid block hashes
 * - valid: [hash, ...] - Final list of blocks in the longest valid chain
 * 
 * @returns {Object} An object containing:
 *   - valid: Array of block hashes in the longest valid chain (oldest to newest)
 *   - invalid: Array of all invalid block hashes found
 */
const showtime = () => {
  // Starting block height for our search
  let height = 6929851;
  
  // Track the tips (latest blocks) of each valid chain branch
  // Key: block hash, Value: block object
  let tips = {};
  
  // Map each block hash to its parent hash (for chain reconstruction)
  let prevs = {};
  
  // Collection of invalid block hashes
  let invalid = [];
  
  // Will hold the final valid chain (filled at the end)
  let valid = [];
  
  // Get the current blockchain height from the node
  let last = Bitcoin.rpc("getinfo")["blocks"];
  
  // =========================================================================
  // PHASE 1: Process all blocks and identify valid chains
  // =========================================================================
  while (height <= last) {
    // Get all candidate blocks at this height (may be multiple due to forks)
    let candidates = Bitcoin.rpc("getblocksbyheight", height);
    
    for (let bhash of candidates) {
      // Fetch the full block data
      let block = Bitcoin.rpc("getblock", bhash);
      
      // VALIDATION CHECK:
      // 1. Is the parent block invalid? (If so, this block is invalid too)
      // 2. Does this block fail our validation rules?
      if (invalid.includes(block["prev"]) || !validateBlock(block)) {
        invalid.push(bhash);
        continue; // Skip to next candidate
      }
      
      // VALID BLOCK: Update our chain tracking
      
      // If this block extends an existing tip, remove the old tip
      // (this block becomes the new tip of that branch)
      if (tips[block["prev"]]) {
        delete tips[block["prev"]];
      }
      
      // Add this block as a new tip
      tips[block["hash"]] = block;
      
      // Save parent mapping for later chain reconstruction
      prevs[bhash] = block["prev"];
    }
    
    // Move to the next height
    height += 1;
  }
  
  // =========================================================================
  // PHASE 2: Find the longest valid chain
  // =========================================================================
  
  // Among all valid chain tips, find the one with maximum height
  // This is the tip of the "best" (longest valid) chain
  let best = Object.values(tips).reduce(function(a, b) {
    return a["height"] > b["height"] ? a : b;
  });
  
  // =========================================================================
  // PHASE 3: Reconstruct the chain from tip back to start
  // =========================================================================
  
  // Start with the best tip and walk backwards using parent links
  let best_hash = best["hash"];
  valid.push(best_hash);
  
  // Keep following parent links until we reach a block without a known parent
  // (i.e., we've reached the start of our search range)
  while (prevs[best_hash]) {
    let prev = prevs[best_hash];
    valid.push(prev);
    best_hash = prev;
  }
  
  // Reverse to get chronological order (oldest first, newest last)
  valid.reverse();
  
  // Return both the valid chain and all invalid blocks found
  return {
    valid: valid,
    invalid: invalid
  };
};

/**

 * SUMMARY: WHAT WE LEARNED IN THIS CHAPTER
 * 
 * This challenge teaches the fundamentals of Bitcoin consensus.
 * 
 * This is the magic of Bitcoin: pure mathematics and economic incentives
 * creating trustless consensus across the globe! 🧡
 * 
 */
