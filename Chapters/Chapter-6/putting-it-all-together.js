/**
 * SAVING SATOSHI - CHAPTER 6: PUTTING IT ALL TOGETHER
 * 
 * This implements the SegWit v0 signature digest (BIP-143).
 * The digest() method creates the hash that gets signed to authorize spending.
 */

const { createHash } = require('crypto');

class Transaction {
  constructor() {
    this.version = 2;
    this.flags = Buffer.from('0001', 'hex'); // SegWit marker + flag
    this.inputs = [];
    this.outputs = [];
    this.witnesses = [];
    this.locktime = 0;
  }

  /**
   * Creates the signature hash for a specific input (BIP-143 format).
   * This is what gets signed by your private key to prove ownership.
   */
  digest(input_index) {
    // Helper: double SHA256 (Bitcoin's standard hash)
    const dsha256 = (data) => {
      return createHash('sha256').update(createHash('sha256').update(data).digest()).digest();
    };

    // Version (4 bytes, little-endian)
    let buf = Buffer.alloc(4);
    buf.writeUInt32LE(this.version, 0);

    // Hash of all input outpoints (prevents txid malleability)
    let outpoints = Buffer.alloc(this.inputs.length * 36);
    for (let i = 0; i < this.inputs.length; i++)
      this.inputs[i].outpoint.serialize().copy(outpoints, i * 36);
    buf = Buffer.concat([buf, dsha256(outpoints)]);

    // Hash of all input sequences
    const sequences = Buffer.alloc(4 * this.inputs.length);
    for (let i = 0; i < this.inputs.length; i++)
      sequences.writeUInt32LE(this.inputs[i].sequence, i * 4);
    buf = Buffer.concat([buf, dsha256(sequences)]);

    // The specific input being signed: outpoint + scriptcode
    buf = Buffer.concat([buf, this.inputs[input_index].outpoint.serialize()]);
    buf = Buffer.concat([buf, this.inputs[input_index].scriptcode]);

    // Input value + sequence (commits to the exact amount being spent)
    const val_and_seq = Buffer.alloc(12);
    val_and_seq.writeBigInt64LE(BigInt(this.inputs[input_index].value), 0);
    val_and_seq.writeUInt32LE(this.inputs[input_index].sequence, 8);
    buf = Buffer.concat([buf, val_and_seq]);

    // Hash of all outputs (commits to where coins are going)
    let outputs = Buffer.alloc(0);
    for (const output of this.outputs)
      outputs = Buffer.concat([outputs, output.serialize()]);
    buf = Buffer.concat([buf, dsha256(outputs)]);

    // Locktime + sighash type (SIGHASH_ALL = 1)
    const locktime_and_sighash = Buffer.alloc(8);
    locktime_and_sighash.writeUInt32LE(this.locktime, 0);
    locktime_and_sighash.writeUInt32LE(1, 4);
    buf = Buffer.concat([buf, locktime_and_sighash]);

    // Final digest: double-SHA256 of everything above
    return dsha256(buf);
  }
}
