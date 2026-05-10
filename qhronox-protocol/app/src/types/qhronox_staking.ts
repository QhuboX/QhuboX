/**
 * QhronoX Protocol — TypeScript types generated from Anchor IDL.
 * Run `anchor build` to regenerate from target/types/qhronox_staking.ts
 */

export type QhronoXStaking = {
  address: "QHUBXstake11111111111111111111111111111111111";
  metadata: {
    name: "qhronoxStaking";
    version: "1.0.0";
    spec: "0.1.0";
    description: "QhronoX Protocol real yield staking with Token-2022";
  };
  instructions: [
    {
      name: "initializePool";
      discriminator: [95, 180, 10, 172, 84, 174, 232, 40];
      accounts: [
        { name: "authority"; writable: true; signer: true },
        { name: "mint" },
        { name: "pool"; writable: true; pda: { seeds: [{ kind: "const"; value: [112,111,111,108] }, { kind: "account"; path: "mint" }] } },
        { name: "vault"; writable: true; pda: { seeds: [{ kind: "const"; value: [118,97,117,108,116] }, { kind: "account"; path: "pool" }] } },
        { name: "tokenProgram" },
        { name: "systemProgram"; address: "11111111111111111111111111111111" }
      ];
      args: [{ name: "treasury"; type: "pubkey" }];
    },
    {
      name: "depositFees";
      discriminator: [174, 206, 184, 65, 68, 3, 247, 211];
      accounts: [
        { name: "feeAuthority"; signer: true },
        { name: "mint" },
        { name: "pool"; writable: true },
        { name: "vault"; writable: true },
        { name: "feeSource"; writable: true },
        { name: "tokenProgram" }
      ];
      args: [{ name: "amount"; type: "u64" }];
    },
    {
      name: "stake";
      discriminator: [206, 176, 202, 18, 200, 209, 179, 108];
      accounts: [
        { name: "user"; writable: true; signer: true },
        { name: "mint" },
        { name: "pool"; writable: true },
        { name: "vault"; writable: true },
        { name: "stakeInfo"; writable: true; pda: { seeds: [{ kind: "const"; value: [115,116,97,107,101] }, { kind: "account"; path: "pool" }, { kind: "account"; path: "user" }] } },
        { name: "userTokenAccount"; writable: true },
        { name: "tokenProgram" },
        { name: "systemProgram"; address: "11111111111111111111111111111111" }
      ];
      args: [{ name: "amount"; type: "u64" }, { name: "tier"; type: "u8" }];
    },
    {
      name: "unstake";
      discriminator: [90, 95, 107, 42, 205, 124, 50, 225];
      accounts: [
        { name: "user"; writable: true; signer: true },
        { name: "mint" },
        { name: "pool"; writable: true },
        { name: "vault"; writable: true },
        { name: "stakeInfo"; writable: true },
        { name: "userTokenAccount"; writable: true },
        { name: "tokenProgram" }
      ];
      args: [{ name: "amount"; type: "u64" }];
    },
    {
      name: "claimRewards";
      discriminator: [4, 144, 132, 71, 116, 23, 151, 80];
      accounts: [
        { name: "user"; writable: true; signer: true },
        { name: "mint" },
        { name: "pool"; writable: true },
        { name: "vault"; writable: true },
        { name: "stakeInfo"; writable: true },
        { name: "userTokenAccount"; writable: true },
        { name: "tokenProgram" }
      ];
      args: [];
    }
  ];
  accounts: [
    { name: "pool";      discriminator: [241, 154, 109, 4, 17, 177, 109, 188] },
    { name: "stakeInfo"; discriminator: [66, 62, 68, 70, 108, 179, 183, 235] }
  ];
  types: [
    {
      name: "pool";
      type: {
        kind: "struct";
        fields: [
          { name: "authority"; type: "pubkey" },
          { name: "mint";      type: "pubkey" },
          { name: "vault";     type: "pubkey" },
          { name: "treasury";  type: "pubkey" },
          { name: "totalStaked";  type: "u64" },
          { name: "totalWeighted"; type: "u64" },
          { name: "accumulatedRewardsPerWeight"; type: "u64" },
          { name: "totalFeesCollected"; type: "u64" },
          { name: "totalBurned"; type: "u64" },
          { name: "bump";      type: "u8" },
          { name: "vaultBump"; type: "u8" }
        ];
      };
    },
    {
      name: "stakeInfo";
      type: {
        kind: "struct";
        fields: [
          { name: "owner";          type: "pubkey" },
          { name: "pool";           type: "pubkey" },
          { name: "amount";         type: "u64" },
          { name: "weightedAmount"; type: "u64" },
          { name: "multiplier";     type: "u64" },
          { name: "tier";           type: "u8" },
          { name: "stakedAt";       type: "i64" },
          { name: "unlockAt";       type: "i64" },
          { name: "rewardDebt";     type: "u64" },
          { name: "pendingRewards"; type: "u64" },
          { name: "totalClaimed";   type: "u64" },
          { name: "bump";           type: "u8" }
        ];
      };
    }
  ];
  errors: [
    { code: 6000; name: "ZeroAmount";        msg: "Amount must be greater than zero" },
    { code: 6001; name: "InvalidTier";       msg: "Invalid tier — must be 0, 1, or 2" },
    { code: 6002; name: "StillLocked";       msg: "Tokens are still locked" },
    { code: 6003; name: "InsufficientStake"; msg: "Insufficient staked balance" },
    { code: 6004; name: "Unauthorized";      msg: "Unauthorized" },
    { code: 6005; name: "NoRewards";         msg: "No rewards to claim" }
  ];
};
