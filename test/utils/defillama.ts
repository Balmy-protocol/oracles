import axios from 'axios';
import { BigNumber, utils } from 'ethers';

export const getLastPrice = async (network: string, coin: string): Promise<number> => {
  return await getPrice(network, coin);
};

export const getPrice = async (network: string, coin: string, timestamp?: number): Promise<number> => {
  const { price } = await getTokenData(network, coin, timestamp);
  return price;
};

export const getTokenData = async (network: string, coin: string, timestamp?: number): Promise<{ price: number; decimals: number }> => {
  const coinId = `${network}:${coin.toLowerCase()}`;
  const url = timestamp ? `https://coins.llama.fi/prices/historical/${timestamp}/${coinId}` : `https://coins.llama.fi/prices/current/${coinId}`;
  const response = await axios.get(url);
  const { coins } = response.data;
  return coins[coinId];
};

export const convertPriceToBigNumberWithDecimals = (price: number, decimals: number): BigNumber => {
  return utils.parseUnits(price.toFixed(decimals), decimals);
};

export const convertPriceToNumberWithDecimals = (price: number, decimals: number): number => {
  return convertPriceToBigNumberWithDecimals(price, decimals).toNumber();
};
