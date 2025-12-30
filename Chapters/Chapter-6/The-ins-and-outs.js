/**
 * SAVING SATOSHI - CHAPTER 6: THE INS AND OUTS
 * 
 * CHALLENGE OVERVIEW:
 * This challenge teaches how Bitcoin transactions work at the byte level.
 * Every Bitcoin transaction consists of INPUTS (coins being spent) and 
 * OUTPUTS (new coins being created).
 * 
 * KEY CONCEPTS:
 * 
 * • UTXO (Unspent Transaction Output): Bitcoin doesn't have "accounts" or "balances".
 *   Instead, you own specific outputs from previous transactions. To spend Bitcoin,
 *   you must reference these outputs as inputs in a new transaction.
 * 
 * • Outpoint: A pointer to a specific output in a previous transaction.
 *   It consists of: txid (32 bytes) + output index (4 bytes) = 36 bytes total.
 * 
 * • Input: Consumes a previous output. Contains the outpoint reference plus
 *   a script (signature) proving you're authorized to spend it.
 * 
 * Think of it like this:
 *   - Outputs are like sealed envelopes containing Bitcoin
 *   - Outpoints are the addresses on those envelopes
 *   - Inputs open those envelopes (with the right key) to spend the coins
 */

const assert = require('assert');

/**
 * Outpoint Class
 * 
 * An outpoint uniquely identifies a specific output in the blockchain.
 * It's like a GPS coordinate for Bitcoin - it tells you exactly where
 * the coins you want to spend are located.
 * 
 * Structure (36 bytes total):
 * ┌─────────────────────────────┬───────────────┐
 * │  Transaction ID (32 bytes)  │  Index (4 B)  │
 * └─────────────────────────────┴───────────────┘
 * 
 * Example: If transaction ABC has 3 outputs, and you want to spend
 * the second one, your outpoint would be: {txid: ABC, index: 1}
 */
class Outpoint {
  /**
   * Creates a new Outpoint reference.
   * 
   * @param {Buffer} txid - The 32-byte transaction ID (hash) containing the output
   * @param {number} index - The output index within that transaction (0-based)
   */
  constructor(txid, index) {
    // Validate: txid must be a Buffer (raw bytes, not a string)
    assert(Buffer.isBuffer(txid));
    
    // Validate: txid must be exactly 32 bytes (256 bits - SHA256 hash)
    assert(txid.length === 32);
    
    // Validate: index must be a whole number (can't have fractional outputs!)
    assert(Number.isInteger(index));
    
    this.txid = txid;
    this.index = index;
  }

  /**
   * Serializes the outpoint to raw bytes for inclusion in a transaction.
   * 
   * Bitcoin uses little-endian byte order for most integers.
   * The serialized format is exactly 36 bytes:
   *   - Bytes 0-31: Transaction ID
   *   - Bytes 32-35: Output index (4 bytes, little-endian)
   * 
   * @returns {Buffer} The 36-byte serialized outpoint
   */
  serialize() {
    // Allocate a buffer for txid (32) + index (4) = 36 bytes
    const buf = Buffer.alloc(36);
    
    // Copy the transaction ID into the first 32 bytes
    this.txid.copy(buf, 0);
    
    // Write the output index as a 4-byte little-endian unsigned integer
    // Little-endian means least significant byte first (Bitcoin's format)
    buf.writeUInt32LE(this.index, 32);
    
    return buf;
  }
}

/**
 * Input Class
 * 
 * A transaction input spends a previous output. It contains:
 *   1. An outpoint (reference to the output being spent)
 *   2. A script (the "unlocking" script proving you can spend it)
 *   3. A sequence number (for advanced features like RBF, timelocks)
 *   4. The value being spent (for signature verification)
 *   5. The scriptcode (the locking script we need to satisfy)
 * 
 * When you create a transaction, you're essentially saying:
 * "I want to spend the coins at [outpoint], and here's my proof [script]
 *  that I'm authorized to do so."
 */
class Input {
  /**
   * Creates an empty Input with default values.
   * Use Input.from_output() to create a populated input.
   */
  constructor() {
    // Reference to the output we're spending (set later)
    this.outpoint = null;
    
    // The unlocking script (signature) - empty until we sign
    this.script = Buffer.alloc(0);
    
    // Sequence number: 0xffffffff means "final" (no RBF, no relative timelock)
    // Lower values enable Replace-By-Fee and relative timelocks
    this.sequence = 0xffffffff;
    
    // The value of the output we're spending (in satoshis)
    // Needed for SegWit signature generation
    this.value = 0;
    
    // The scriptcode (locking script) of the output we're spending
    // This is hashed into the signature to prevent certain attacks
    this.scriptcode = Buffer.alloc(0);
  }

  /**
   * Factory method: Creates an Input from a previous transaction output.
   * 
   * This is the typical way to create an input - you provide the details
   * of the output you want to spend.
   * 
   * @param {string} txid - The transaction ID as a hex string (with or without '0x')
   * @param {number} vout - The output index (vout = "vector out")
   * @param {number} value - The output value in satoshis
   * @param {string} scriptcode - The locking script as a hex string
   * @returns {Input} A new Input instance ready to be signed
   * 
   * Note: The txid is reversed because Bitcoin displays txids in big-endian
   * (human readable) but stores them in little-endian (internally).
   */
  static from_output(txid, vout, value, scriptcode) {
    const self = new this();
    
    // Convert hex string to Buffer and reverse byte order
    // Bitcoin's internal format is little-endian, but txids are displayed big-endian
    // Example: displayed as "abc123..." but stored as "...321cba"
    self.outpoint = new Outpoint(
      Buffer.from(txid.replace('0x', ''), 'hex').reverse(),
      vout
    );
    
    // Store the value for later signature generation
    self.value = value;
    
    // Store the scriptcode (locking script we need to satisfy)
    self.scriptcode = Buffer.from(scriptcode.replace('0x', ''), 'hex');
    
    return self;
  }

  /**
   * Serializes the input to raw bytes for inclusion in a transaction.
   * 
   * Serialized input structure (41 bytes for empty script):
   * ┌────────────────────┬────────────────┬────────────────┐
   * │  Outpoint (36 B)   │  Script Len    │  Sequence (4B) │
   * │  txid + index      │  (1 byte)      │  (little-end)  │
   * └────────────────────┴────────────────┴────────────────┘
   * 
   * Note: The actual script bytes would be inserted after script length,
   * but this implementation assumes an empty script (unsigned transaction).
   * 
   * @returns {Buffer} The serialized input bytes
   */
  serialize() {
    // Allocate: 32 (txid) + 4 (index) + 1 (script len) + 4 (sequence) = 41 bytes
    const buf = Buffer.alloc(32 + 4 + 1 + 4);
    
    // Copy the serialized outpoint (36 bytes)
    this.outpoint.serialize().copy(buf, 0);
    
    // Write script length (0 for unsigned transaction)
    buf.writeUInt8(this.script.length, 36);
    
    // Write sequence number (4 bytes, little-endian)
    buf.writeUInt32LE(this.sequence, 37);
    
    return buf;
  }
}

/**
 * SUMMARY: WHAT WE LEARNED
 * 
 * 1. Bitcoin transactions are chains: each input references a previous output.
 *    This creates an unbroken chain of ownership back to the coinbase.
 * 
 * 2. Outpoints are 36-byte pointers: txid (32) + index (4).
 *    They uniquely identify any output in the entire blockchain.
 * 
 * 3. Inputs contain the proof (script) that you're authorized to spend.
 *    Without a valid signature, the input is rejected.
 * 
 * 4. Little-endian byte order is used throughout Bitcoin's protocol.
 *    Always remember to reverse byte order when needed!
 * 
 * This is the foundation of Bitcoin's UTXO model - understanding this
 * is key to understanding how Bitcoin actually works! 🔗
 */
