# SAVING SATOSHI - CHAPTER 9: WORK WITH ORACLE

## The Script (Hash Time-Locked Contract)

This is a conditional script with **two spending paths**:

```
OP_IF
  OP_HASH256 
  OP_PUSH with HASH256(FD3771E8) 
  OP_EQUALVERIFY 
  OP_PUSH with PUBKEY(VANDERPOOLE) 
  OP_CHECKSIG 
OP_ELSE 
  OP_CHECKLOCKTIMEVERIFY
  OP_DROP
  OP_PUSH with PUBKEY(ME) 
  OP_CHECKSIG
OP_ENDIF
```

---

## How It Works

### Path 1: Vanderpoole's Path (IF branch)
- Requires knowing the **secret preimage** (`FD3771E8`)
- Must provide a valid **signature** matching Vanderpoole's pubkey
- Can spend **immediately** if they know the secret

### Path 2: Your Path (ELSE branch)  
- Protected by **CHECKLOCKTIMEVERIFY** (timelock)
- Can only spend **after the timelock expires**
- Must provide a valid **signature** matching your pubkey
- This is your fallback/refund path

---

## Spending Conditions

### If Vanderpoole spends first:
```
Stack: SIG(VANDERPOOLE) FD3771E8 1
```
- `1` triggers the IF branch
- `FD3771E8` is the preimage (hashes to the expected value)
- `SIG(VANDERPOOLE)` proves ownership

### If you spend (after timelock):
```
Stack: SIG(ME) 0
```
- `0` triggers the ELSE branch
- Timelock must have expired
- `SIG(ME)` proves you're authorized

---

## Summary
This is an **oracle contract**: Vanderpoole can claim funds by revealing a secret, but if they don't act before the timelock, you can reclaim your coins. Classic trustless Bitcoin! 🔐
