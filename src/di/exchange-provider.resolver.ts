import { inject, injectable } from 'inversify';
import {
  ExchangeId,
  ExchangeMarketDataProvider,
} from '../domain/market/exchange-market-data-provider.interface';
import { AppConfig } from '../config/app.config';
import { TYPES } from './types';

export type ExchangeProviderRegistry = Map<ExchangeId, ExchangeMarketDataProvider>;

@injectable()
export class ExchangeProviderResolver {
  public constructor(
    @inject(TYPES.AppConfig)
    private readonly config: AppConfig,
    @inject(TYPES.ExchangeProviderRegistry)
    private readonly registry: ExchangeProviderRegistry,
  ) {}

  public getActiveProvider(): ExchangeMarketDataProvider {
    const provider = this.registry.get(this.config.activeExchange);

    if (!provider) {
      throw new Error(
        `Exchange provider for ${this.config.activeExchange} is not registered.`,
      );
    }

    return provider;
  }
}
