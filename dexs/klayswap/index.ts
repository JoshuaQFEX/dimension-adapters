import { cache } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { filterPools } from "../../helpers/uniswap";
import { addOneToken } from "../../helpers/prices";
import retry from "async-retry";

let filteredPairAddressesPromise: Promise<string[]> | undefined

function getFilteredPairAddresses({ api, pairs, createBalances }: Pick<FetchOptions, 'api' | 'createBalances'> & { pairs: Record<string, string[]> }) {
  if (!filteredPairAddressesPromise) {
    filteredPairAddressesPromise = retry(
      async () => Object.keys(await filterPools({ api, pairs, createBalances, maxPairSize: 32 })),
      { retries: 2 },
    )
  }
  return filteredPairAddressesPromise
}

async function fetch({ createBalances, getLogs, api, }: FetchOptions) {
  const factory = '0xc6a2ad8cc6e4a7e08fc37cc5954be07d499e7654'
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-klaytn.json`
  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  const pairObject: any = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  // The v2 test runner calls fetch 24 times. Reuse this expensive 1,246-call
  // filter and retry transient Klaytn multicall failures instead of repeating it.
  const filteredPairAddresses = await getFilteredPairAddresses({ api, pairs: pairObject, createBalances })
  const dailyVolume = createBalances()
  const allLogs = await getLogs({ targets: filteredPairAddresses, eventAbi: 'event ExchangePos(address tokenA, uint amountA, address tokenB, uint amountB)' })
  allLogs.map((log: any) => {
    addOneToken({ balances: dailyVolume, token0: log.tokenA, token1: log.tokenB, amount0: log.amountA, amount1: log.amountB, chain: api.chain, })
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.KLAYTN],
};

export default adapter;
