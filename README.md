## Clanker Swap Example

This app demonstrates a swap flow for Clanker tokens on Base.

## Getting Started

From this app directory, run the development server:

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## How It Works

- Connect wallet on Base.
- Confirm pool key and token metadata are loaded.
- Pick swap direction (`Paired -> Token` or `Token -> Paired`).
- Enter amount, check quote, then execute swap.

Notes:

- Pool settings are not manually entered; they are read from chain using the fixed pool ID.
- If the pool lookup fails (wrong RPC/network), quote/swap will remain unavailable and show an error.

## Base Mainnet Fork with Anvil

1. Start a Base fork:

```bash
pnpm anvil:base
```

2. In a second terminal, point the app at local Anvil and start dev:

```bash
pnpm dev:anvil
```

3. In your wallet (we recommend using Rabby):

- set Base RPC to `http://127.0.0.1:8545`
- import one of the private keys printed by Anvil

4. Interact with the app at [http://localhost:3000](http://localhost:3000), note: it is possible your wallet shows errors during simulations because simulations might not be using the fork url, you can ignore those errors and execute the swap
