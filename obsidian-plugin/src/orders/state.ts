// Per-order persisted bookkeeping: arming, run recency, fired-note memory and the hourly cap. Pure.

export interface OrderState { enabledAt: number; lastRunAt: number; fired: string[]; hourStart: number; hourCount: number }
export type OrdersState = Record<string, OrderState>;
