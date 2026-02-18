import type { Address } from "viem";

export const BASE_CHAIN_ID = 8453;

export const CLANKER_ADDRESSES = {
  factory: "0xE85A59c628F7d27878ACeB4bf3b35733630083a9",
  positionManager: "0x7c5f5a4bbd8fd63184577525326123b519429bdc",
  hookStaticFee: "0xb429d62f8f3bFFb98CdB9569533eA23bF0Ba28CC",
  lpLockerFeeConversion: "0x63D2DfEA64b3433F4071A98665bcD7Ca14d93496",
  mevBlockDelay: "0xE143f9872A33c955F23cF442BB4B1EFB3A7402A2",
  weth: "0x4200000000000000000000000000000000000006",
} as const satisfies Record<string, Address>;

export const CLANKER_POOL_FEE = 10_000;
export const CLANKER_POOL_TICK_SPACING = 60;

export type ClankerTokenOption = {
  address: Address;
  poolId: `0x${string}`;
  protocol: "v4" | "v3";
};

export const CLANKER_TOKEN_OPTIONS = [
  {
    address: "0xf48bC234855aB08ab2EC0cfaaEb2A80D065a3b07",
    poolId: "0x6c8fd04c19e3c6c3efc21f6f5ae79c1453a19d971b7b7d4969df1928c380aaad",
    protocol: "v4",
  },
  {
    address: "0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07",
    poolId: "0x9fd58e73d8047cb14ac540acd141d3fc1a41fb6252d674b730faf62fe24aa8ce",
    protocol: "v4",
  },
  {
    address: "0xB6830e61aEBa58E07884983451D26880b4078b07",
    poolId: "0x28e472ff6d2240d2b944af3cd823727c717281acf7d17e7a0c8ab000fa8d1589",
    protocol: "v4",
  },
  {
    address: "0x7D928816CC9c462DD7adef911De41535E444CB07",
    poolId: "0xFC01837343cfC2A9dDCA9e8a0a19825f6b2f0460",
    protocol: "v3",
  },
] as const satisfies readonly ClankerTokenOption[];

export type ClankerSwapDirection = "pairedToToken" | "tokenToPaired";

export function getPoolKeyForPair(
  tokenAddress: Address,
  pairedToken: Address,
  hookAddress: Address,
  fee: number,
  tickSpacing: number,
  direction: ClankerSwapDirection,
) {
  const [currency0, currency1] =
    tokenAddress.toLowerCase() < pairedToken.toLowerCase() ? [tokenAddress, pairedToken] : [pairedToken, tokenAddress];

  const inputToken = direction === "pairedToToken" ? pairedToken : tokenAddress;
  const zeroForOne = inputToken.toLowerCase() === currency0.toLowerCase();

  return {
    poolKey: {
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks: hookAddress,
    },
    zeroForOne,
  };
}

export function toPoolId25(poolId: `0x${string}`): `0x${string}` {
  return `0x${poolId.slice(2, 52)}`;
}
