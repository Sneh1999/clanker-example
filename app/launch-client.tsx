"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSwap, useToken } from "@zahastudio/uniswap-sdk-react";
import { formatUnits, parseUnits, type Address } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";

import {
  BASE_CHAIN_ID,
  CLANKER_ADDRESSES,
  CLANKER_TOKEN_OPTIONS,
  type ClankerTokenOption,
  type ClankerSwapDirection,
  toPoolId25,
} from "@/lib/clanker";

const QUOTE_REFRESH_INTERVAL = 30_000;

const WETH_DEPOSIT_CALLDATA = "0xd0e30db0" as const;

const POOL_KEY_ABI = [
  {
    type: "function",
    name: "poolKeys",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes25" }],
    outputs: [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
  },
] as const;

type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

function shouldShowExecutionError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return (
    !normalizedMessage.includes("user rejected") &&
    !normalizedMessage.includes("user denied")
  );
}

function formatShortAmount(amount: string, precision = 6) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return amount;
  return parsed.toLocaleString(undefined, { maximumFractionDigits: precision });
}

export function LaunchClient() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const publicClient = usePublicClient({ chainId: BASE_CHAIN_ID });

  const [selectedTokenAddress, setSelectedTokenAddress] = useState<Address>(
    CLANKER_TOKEN_OPTIONS[0].address,
  );
  const [poolKey, setPoolKey] = useState<PoolKey | null>(null);
  const [poolKeyError, setPoolKeyError] = useState<string | null>(null);
  const [swapDirection, setSwapDirection] =
    useState<ClankerSwapDirection>("pairedToToken");
  const [swapAmount, setSwapAmount] = useState<string>("0.01");
  const [swapErrorMessage, setSwapErrorMessage] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const wrongNetwork = isConnected && chainId !== BASE_CHAIN_ID;

  const selectedTokenOption = useMemo<ClankerTokenOption>(
    () =>
      CLANKER_TOKEN_OPTIONS.find(
        (token) =>
          token.address.toLowerCase() === selectedTokenAddress.toLowerCase(),
      ) ?? CLANKER_TOKEN_OPTIONS[0],
    [selectedTokenAddress],
  );

  useEffect(() => {
    if (!publicClient) return;

    if (selectedTokenOption.protocol !== "v4") {
      setPoolKey(null);
      setPoolKeyError("This demo only supports V4 pools for quoting/swapping.");
      return;
    }

    let active = true;
    setPoolKeyError(null);

    const readPoolKey = async () => {
      try {
        const result = await publicClient.readContract({
          address: CLANKER_ADDRESSES.positionManager,
          abi: POOL_KEY_ABI,
          functionName: "poolKeys",
          args: [toPoolId25(selectedTokenOption.poolId)],
        });

        if (!active) return;

        setPoolKey({
          currency0: result[0],
          currency1: result[1],
          fee: result[2],
          tickSpacing: result[3],
          hooks: result[4],
        });
      } catch (error) {
        if (!active) return;
        setPoolKey(null);
        setPoolKeyError(
          error instanceof Error
            ? error.message
            : "Failed to load pool key for token.",
        );
      }
    };

    void readPoolKey();

    return () => {
      active = false;
    };
  }, [publicClient, selectedTokenOption]);

  const targetToken = useToken(
    { tokenAddress: selectedTokenAddress },
    {
      enabled: true,
      chainId: BASE_CHAIN_ID,
    },
  );

  const tokenOption0 = useToken(
    { tokenAddress: CLANKER_TOKEN_OPTIONS[0].address },
    { enabled: true, chainId: BASE_CHAIN_ID },
  );
  const tokenOption1 = useToken(
    { tokenAddress: CLANKER_TOKEN_OPTIONS[1].address },
    { enabled: true, chainId: BASE_CHAIN_ID },
  );
  const tokenOption2 = useToken(
    { tokenAddress: CLANKER_TOKEN_OPTIONS[2].address },
    { enabled: true, chainId: BASE_CHAIN_ID },
  );
  const tokenOption3 = useToken(
    { tokenAddress: CLANKER_TOKEN_OPTIONS[3].address },
    { enabled: true, chainId: BASE_CHAIN_ID },
  );

  const pairedTokenAddress = useMemo(() => {
    if (!poolKey) return null;

    if (poolKey.currency0.toLowerCase() === selectedTokenAddress.toLowerCase())
      return poolKey.currency1;
    if (poolKey.currency1.toLowerCase() === selectedTokenAddress.toLowerCase())
      return poolKey.currency0;

    return null;
  }, [poolKey, selectedTokenAddress]);

  const pairedToken = useToken(
    { tokenAddress: pairedTokenAddress ?? CLANKER_ADDRESSES.weth },
    {
      enabled: Boolean(pairedTokenAddress),
      chainId: BASE_CHAIN_ID,
      refetchInterval: 15_000,
    },
  );

  const targetTokenData = targetToken.query.data;
  const pairedTokenData = pairedToken.query.data;
  const tokenOptionQueries = [
    tokenOption0.query.data,
    tokenOption1.query.data,
    tokenOption2.query.data,
    tokenOption3.query.data,
  ];

  const isPairedWeth =
    pairedTokenAddress?.toLowerCase() === CLANKER_ADDRESSES.weth.toLowerCase();
  const useNativeETH = isPairedWeth && swapDirection === "tokenToPaired";
  const useNativeInput = false;
  const useNativeOutput = isPairedWeth && swapDirection === "tokenToPaired";

  const targetSymbol = targetTokenData?.token.symbol || "TOKEN";
  const selectedTokenLabel =
    targetTokenData?.token.name ??
    targetTokenData?.token.symbol ??
    `${selectedTokenAddress.slice(0, 6)}...${selectedTokenAddress.slice(-4)}`;
  const tokenSelectOptions = CLANKER_TOKEN_OPTIONS.map((tokenOption, index) => {
    const tokenData = tokenOptionQueries[index]?.token;
    const label = tokenData?.name ?? tokenData?.symbol ?? `Token ${index + 1}`;
    const sublabel = tokenData?.symbol
      ? `${tokenData.symbol} token`
      : "Loading token metadata";
    const protocolLabel = tokenOption.protocol === "v4" ? "V4" : "V3.1";

    return {
      address: tokenOption.address,
      label,
      sublabel: `${sublabel} (${protocolLabel})`,
      protocol: tokenOption.protocol,
    };
  });
  const pairedSymbol = isPairedWeth
    ? swapDirection === "pairedToToken"
      ? "WETH"
      : "ETH"
    : (pairedTokenData?.token.symbol ?? "Paired Token");
  const inputSymbol =
    swapDirection === "pairedToToken" ? pairedSymbol : targetSymbol;
  const outputSymbol =
    swapDirection === "pairedToToken" ? targetSymbol : pairedSymbol;

  const pairedTokenDecimals = isPairedWeth
    ? 18
    : (pairedTokenData?.token.decimals ?? 18);
  const fallbackInputDecimals =
    swapDirection === "pairedToToken"
      ? pairedTokenDecimals
      : (targetTokenData?.token.decimals ?? 18);
  const outputDecimals =
    swapDirection === "pairedToToken"
      ? (targetTokenData?.token.decimals ?? 18)
      : pairedTokenDecimals;
  const inputTokenAddress =
    swapDirection === "pairedToToken"
      ? pairedTokenAddress
      : selectedTokenAddress;

  const nativeBalance = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });

  const inputTokenBalance = useBalance({
    address,
    chainId: BASE_CHAIN_ID,
    token: useNativeInput ? undefined : (inputTokenAddress ?? undefined),
    query: {
      enabled: Boolean(address && (useNativeInput || inputTokenAddress)),
      refetchInterval: 15_000,
    },
  });

  const balanceInputDecimals = useNativeInput
    ? 18
    : inputTokenBalance.data?.decimals;
  const inputDecimals = balanceInputDecimals ?? fallbackInputDecimals;

  const parsedSwapAmount = useMemo(() => {
    if (!swapAmount || swapAmount === ".") return 0n;

    try {
      return parseUnits(swapAmount, inputDecimals);
    } catch {
      return 0n;
    }
  }, [swapAmount, inputDecimals]);

  const hasAmount = swapAmount.trim().length > 0;
  const invalidAmount = hasAmount && parsedSwapAmount === 0n;

  const inputBalanceValue = useNativeInput
    ? nativeBalance.data?.value
    : inputTokenBalance.data?.value;

  const zeroForOne = useMemo(() => {
    if (!poolKey || !pairedTokenAddress) return true;

    const inputToken =
      swapDirection === "pairedToToken"
        ? pairedTokenAddress
        : selectedTokenAddress;
    return inputToken.toLowerCase() === poolKey.currency0.toLowerCase();
  }, [pairedTokenAddress, poolKey, selectedTokenAddress, swapDirection]);

  const safePoolKey = poolKey ?? {
    currency0: CLANKER_ADDRESSES.weth,
    currency1: selectedTokenAddress,
    fee: 10_000,
    tickSpacing: 60,
    hooks: CLANKER_ADDRESSES.hookStaticFee,
  };

  const swapParams = {
    poolKey: safePoolKey,
    amountIn: parsedSwapAmount,
    zeroForOne,
    slippageBps: 50,
    useNativeETH,
    useNativeInput,
    useNativeOutput,
  } as Parameters<typeof useSwap>[0];

  const swap = useSwap(swapParams, {
    enabled: Boolean(poolKey && pairedTokenAddress) && parsedSwapAmount > 0n,
    chainId: BASE_CHAIN_ID,
    refetchInterval: QUOTE_REFRESH_INTERVAL,
  });

  const swapQuote = swap.steps.quote.data;
  const swapQuoteAmountOut = swapQuote
    ? formatUnits(swapQuote.amountOut, outputDecimals)
    : null;
  const minAmountOut = swapQuote
    ? formatUnits(swapQuote.minAmountOut, outputDecimals)
    : null;
  const swapTxHash = swap.steps.swap.transaction.txHash;
  const swapTxError = swap.steps.swap.transaction.error?.message;
  const txStatus = swap.steps.swap.transaction.status;
  const isSwapConfirmed = txStatus === "confirmed";
  const isSwapPending = txStatus === "pending" || txStatus === "confirming";
  const isQuoteLoading = swap.steps.quote.isLoading;
  const isQuoteFetching = swap.steps.quote.isFetching;

  const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL ?? "";
  const isLocalRpc =
    baseRpcUrl.includes("127.0.0.1") || baseRpcUrl.includes("localhost");

  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    QUOTE_REFRESH_INTERVAL / 1000,
  );
  const lastRefreshRef = useRef(Date.now());
  const wasQuoteFetchingRef = useRef(false);
  const refreshedTxHashRef = useRef<`0x${string}` | undefined>(undefined);

  useEffect(() => {
    if (!swapQuote || isSwapConfirmed) return;
    lastRefreshRef.current = Date.now();
    setSecondsUntilRefresh(QUOTE_REFRESH_INTERVAL / 1000);
  }, [swapQuote, isSwapConfirmed]);

  useEffect(() => {
    if (isSwapConfirmed) {
      wasQuoteFetchingRef.current = isQuoteFetching;
      return;
    }

    if (wasQuoteFetchingRef.current && !isQuoteFetching && swapQuote) {
      lastRefreshRef.current = Date.now();
      setSecondsUntilRefresh(QUOTE_REFRESH_INTERVAL / 1000);
    }

    wasQuoteFetchingRef.current = isQuoteFetching;
  }, [isQuoteFetching, isSwapConfirmed, swapQuote]);

  useEffect(() => {
    if (!swapQuote || isSwapConfirmed) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastRefreshRef.current;
      const remaining = Math.max(
        0,
        Math.ceil((QUOTE_REFRESH_INTERVAL - elapsed) / 1000),
      );
      setSecondsUntilRefresh(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [swapQuote, isSwapConfirmed]);

  const refreshAll = useCallback(() => {
    void swap.steps.quote.refetch();
    void nativeBalance.refetch();
    void inputTokenBalance.refetch();
    void targetToken.query.refetch();
    void pairedToken.query.refetch();
    lastRefreshRef.current = Date.now();
    setSecondsUntilRefresh(QUOTE_REFRESH_INTERVAL / 1000);
  }, [
    inputTokenBalance,
    nativeBalance,
    pairedToken.query,
    swap.steps.quote,
    targetToken.query,
  ]);

  useEffect(() => {
    if (txStatus !== "confirmed" || !swapTxHash) return;
    if (refreshedTxHashRef.current === swapTxHash) return;

    refreshedTxHashRef.current = swapTxHash;
    refreshAll();

    const delayedRefresh = setTimeout(() => {
      refreshAll();
    }, 1_500);

    return () => clearTimeout(delayedRefresh);
  }, [refreshAll, swapTxHash, txStatus]);

  const onSwap = useCallback(async () => {
    setSwapErrorMessage(null);

    setIsExecuting(true);

    try {
      if (isPairedWeth && swapDirection === "pairedToToken") {
        const wrappedBalance = inputTokenBalance.data?.value ?? 0n;

        if (parsedSwapAmount > wrappedBalance) {
          const wrapAmount = parsedSwapAmount - wrappedBalance;

          if (!publicClient) {
            throw new Error("Public client unavailable for WETH wrapping.");
          }

          const wrapHash = await sendTransactionAsync({
            to: CLANKER_ADDRESSES.weth,
            data: WETH_DEPOSIT_CALLDATA,
            value: wrapAmount,
          });

          await publicClient.waitForTransactionReceipt({ hash: wrapHash });
          await inputTokenBalance.refetch();
        }
      }

      await swap.executeAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shouldShowExecutionError(message)) {
        setSwapErrorMessage(message);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [
    inputTokenBalance,
    isPairedWeth,
    parsedSwapAmount,
    publicClient,
    sendTransactionAsync,
    swap,
    swapDirection,
  ]);

  const onReset = useCallback(() => {
    swap.reset();
    setSwapErrorMessage(null);
    setIsExecuting(false);
    refreshAll();
  }, [refreshAll, swap]);

  const topStatusMessage = useMemo(() => {
    if (!isConnected) return "Connect wallet to begin";
    if (wrongNetwork) return "Switch network to Base to continue";
    if (poolKeyError) return "Pool configuration unavailable";
    if (!poolKey || !pairedTokenAddress) return "Loading pool configuration";
    if (!hasAmount) return "Enter an amount to get a quote";
    if (invalidAmount) return "Enter a valid amount";
    if (isQuoteLoading) return "Fetching quote";
    if (swap.steps.quote.error) return "Quote failed";
    if (isSwapConfirmed) return "Swap confirmed";
    return "Ready to swap";
  }, [
    hasAmount,
    invalidAmount,
    isConnected,
    isQuoteLoading,
    isSwapConfirmed,
    pairedTokenAddress,
    poolKey,
    poolKeyError,
    swap.steps.quote.error,
    wrongNetwork,
  ]);

  const errorMessage =
    poolKeyError ||
    swap.steps.quote.error?.message ||
    swapTxError ||
    swapErrorMessage;

  const canSwap =
    isConnected &&
    !wrongNetwork &&
    Boolean(poolKey && pairedTokenAddress) &&
    hasAmount &&
    !invalidAmount &&
    parsedSwapAmount > 0n &&
    !isQuoteLoading &&
    !isSwapPending &&
    !isExecuting;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_15%,#1b1321_0%,#0f0f15_38%,#07070a_100%)] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute -top-24 left-[-6rem] h-72 w-72 rounded-full bg-[#fc72ff]/16 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] bottom-[-4rem] h-72 w-72 rounded-full bg-[#d45bff]/14 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5">
        <section className="rounded-2xl border border-[#2b2b35] bg-[#12121a]/92 p-5 shadow-[0_22px_45px_-30px_rgba(0,0,0,0.85)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-[0.18em] text-[#fc72ff] uppercase">
                Clanker Example
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-[#f4f4fa] sm:text-4xl">
                Clanker Token Swap on Base
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-[#b2b2c4]">
                Swap multiple Clanker tokens through fixed WETH pools on Base.
              </p>
            </div>
            <div className="rounded-xl border border-[#2d2d39] bg-[#171722] p-2">
              <ConnectButton />
            </div>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="min-w-0 rounded-2xl border border-[#2b2b35] bg-[#12121a]/92 p-4 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)] backdrop-blur">
              <h2 className="text-sm font-semibold tracking-wide text-[#fc72ff] uppercase">
                Status
              </h2>
              <p className="mt-2 text-sm text-[#c8c8d6]">{topStatusMessage}</p>
              <div className="mt-3 rounded-xl border border-[#2d2d39] bg-[#171722] p-3 text-xs text-[#b6b6c8]">
                <p>
                  Current step:{" "}
                  <span className="font-semibold text-[#f1f1f8]">
                    {swap.currentStep}
                  </span>
                </p>
                <p className="mt-1">
                  Tx status:{" "}
                  <span className="font-semibold text-[#f1f1f8]">
                    {txStatus}
                  </span>
                </p>
              </div>
              {swapTxHash ? (
                <p className="mt-3 min-w-0 text-xs break-all text-[#b6b6c8]">
                  Tx hash:{" "}
                  {isLocalRpc ? (
                    <span>{swapTxHash}</span>
                  ) : (
                    <a
                      href={`https://basescan.org/tx/${swapTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium break-all text-[#fc72ff] hover:text-[#fd8fff]"
                    >
                      {swapTxHash}
                    </a>
                  )}
                </p>
              ) : null}
            </section>

            <section className="min-w-0 rounded-2xl border border-[#2b2b35] bg-[#12121a]/92 p-4 shadow-[0_18px_40px_-30px_rgba(0,0,0,0.85)] backdrop-blur">
              <h2 className="text-sm font-semibold tracking-wide text-[#fc72ff] uppercase">
                Pool + Asset
              </h2>
              <div className="mt-3 min-w-0 space-y-2 text-xs text-[#b6b6c8]">
                <p className="min-w-0 break-words">
                  Selected token:{" "}
                  <span className="font-semibold text-[#f1f1f8]">
                    {selectedTokenLabel}
                  </span>
                </p>
                <p>
                  Symbol: {targetSymbol} (
                  {targetTokenData?.token.decimals ?? "?"} decimals)
                </p>
                <p>Pair: {targetSymbol} / ETH</p>
                {poolKey ? (
                  <>
                    <p>
                      fee: {poolKey.fee} | tickSpacing: {poolKey.tickSpacing}
                    </p>
                    <p className="min-w-0 break-words">
                      currency0:{" "}
                      <span className="block font-mono break-all text-[#e2e2ef]">
                        {poolKey.currency0}
                      </span>
                    </p>
                    <p className="min-w-0 break-words">
                      currency1:{" "}
                      <span className="block font-mono break-all text-[#e2e2ef]">
                        {poolKey.currency1}
                      </span>
                    </p>
                  </>
                ) : (
                  <p>{poolKeyError ?? "Loading pool configuration..."}</p>
                )}
              </div>
            </section>
          </aside>

          <section className="rounded-2xl border border-[#2b2b35] bg-[#12121a]/95 p-5 shadow-[0_22px_45px_-30px_rgba(0,0,0,0.85)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#f4f4fa]">Swap</h2>
                <p className="text-sm text-[#b2b2c4]">
                  Choose direction, enter amount, review quote, then execute.
                </p>
              </div>
              <button
                type="button"
                onClick={refreshAll}
                disabled={isExecuting || isSwapPending}
                className="rounded-lg border border-[#2d2d39] bg-[#171722] px-3 py-2 text-xs font-medium text-[#c9c9d8] transition hover:bg-[#1d1d2b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isQuoteFetching ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-[#fc72ff] uppercase">
                Token
              </p>
              <div className="rounded-xl border border-[#2d2d39] bg-[#171722] p-3">
                <label
                  htmlFor="token-select"
                  className="mb-2 block text-[11px] font-medium text-[#a7a7bb]"
                >
                  Choose token
                </label>
                <select
                  id="token-select"
                  value={selectedTokenAddress}
                  onChange={(event) => {
                    setSelectedTokenAddress(event.target.value as Address);
                    setSwapDirection("pairedToToken");
                    setSwapAmount("0.01");
                    setSwapErrorMessage(null);
                    setIsExecuting(false);
                  }}
                  disabled={isExecuting || isSwapPending}
                  className="w-full rounded-lg border border-[#3a3a49] bg-[#1d1d2b] px-3 py-2 text-sm font-medium text-[#f2f2fa] transition outline-none focus:border-[#fc72ff] focus:ring-2 focus:ring-[#fc72ff]/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {tokenSelectOptions.map((option) => (
                    <option key={option.address} value={option.address}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-[#9f9fb5]">
                  {tokenSelectOptions.find(
                    (option) =>
                      option.address.toLowerCase() ===
                      selectedTokenAddress.toLowerCase(),
                  )?.sublabel ?? "Loading token metadata"}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSwapDirection("pairedToToken");
                  setSwapErrorMessage(null);
                }}
                disabled={isExecuting || isSwapPending}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  swapDirection === "pairedToToken"
                    ? "border-[#fc72ff] bg-[rgba(252,114,255,0.16)] text-[#fd8fff]"
                    : "border-[#2d2d39] bg-[#171722] text-[#b5b5c7] hover:bg-[#1d1d2b]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {pairedSymbol} to {targetSymbol}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSwapDirection("tokenToPaired");
                  setSwapErrorMessage(null);
                }}
                disabled={isExecuting || isSwapPending}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  swapDirection === "tokenToPaired"
                    ? "border-[#fc72ff] bg-[rgba(252,114,255,0.16)] text-[#fd8fff]"
                    : "border-[#2d2d39] bg-[#171722] text-[#b5b5c7] hover:bg-[#1d1d2b]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {targetSymbol} to {pairedSymbol}
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#2d2d39] bg-[#171722] p-3">
                <p className="text-xs font-medium text-[#b2b2c4]">You pay</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <input
                    id="swap-amount"
                    type="text"
                    inputMode="decimal"
                    value={swapAmount}
                    onChange={(event) => {
                      setSwapAmount(event.target.value);
                      setSwapErrorMessage(null);
                    }}
                    disabled={isExecuting || isSwapPending || isSwapConfirmed}
                    className="w-full border-none bg-transparent text-2xl font-semibold text-[#f4f4fa] outline-none placeholder:text-[#7d7d92] disabled:opacity-60"
                    placeholder="0.0"
                  />
                  <span className="shrink-0 rounded-lg border border-[#2d2d39] bg-[#1d1d2b] px-2 py-1 text-xs font-medium text-[#e1e1ee]">
                    {inputSymbol}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#a9a9bd]">
                  Balance:{" "}
                  {inputBalanceValue !== undefined
                    ? formatShortAmount(
                        formatUnits(inputBalanceValue, inputDecimals),
                      )
                    : "-"}{" "}
                  {inputSymbol}
                </p>
              </div>

              <div className="rounded-xl border border-[#2d2d39] bg-[#171722] p-3">
                <p className="text-xs font-medium text-[#b2b2c4]">
                  You receive
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="w-full text-2xl font-semibold text-[#f4f4fa]">
                    {isQuoteLoading
                      ? "..."
                      : swapQuoteAmountOut
                        ? formatShortAmount(swapQuoteAmountOut)
                        : "-"}
                  </p>
                  <span className="shrink-0 rounded-lg border border-[#2d2d39] bg-[#1d1d2b] px-2 py-1 text-xs font-medium text-[#e1e1ee]">
                    {outputSymbol}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[#a9a9bd]">
                  Min received (0.5% slippage):{" "}
                  {minAmountOut
                    ? `${formatShortAmount(minAmountOut)} ${outputSymbol}`
                    : "-"}
                </p>
              </div>
            </div>

            {swapQuote && !isSwapConfirmed ? (
              <p className="mt-3 text-xs text-[#a9a9bd]">
                Quote refreshes in {secondsUntilRefresh}s
              </p>
            ) : null}

            {errorMessage ? (
              <p className="mt-3 rounded-xl border border-[#5a2626] bg-[#2c1313] px-3 py-2 text-sm break-all text-[#ffb3b3]">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              {!isConnected ? (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      type="button"
                      onClick={openConnectModal}
                      className="w-full rounded-xl bg-[#fc72ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#fd8fff]"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              ) : wrongNetwork ? (
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
                  className="w-full rounded-xl border border-[#3b2b42] bg-[#171722] px-4 py-2.5 text-sm font-semibold text-[#f1b9f3] transition hover:bg-[#1f1f2e]"
                >
                  Switch to Base
                </button>
              ) : isSwapConfirmed ? (
                <button
                  type="button"
                  onClick={onReset}
                  className="w-full rounded-xl border border-[#3a2a41] bg-[#201428] px-4 py-2.5 text-sm font-semibold text-[#ffb3ff] transition hover:bg-[#2a1a33]"
                >
                  Swap another
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSwap}
                  disabled={!canSwap}
                  className="w-full rounded-xl bg-[#fc72ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#fd8fff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isExecuting || isSwapPending
                    ? `Processing ${swap.currentStep}...`
                    : !hasAmount
                      ? "Enter amount"
                      : invalidAmount
                        ? "Enter valid amount"
                        : "Swap"}
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
