interface Market {
  id: number;
  name: string;
  description: string;
  status: 'Open' | 'Closed';
  orders: Order[];
  outcome?: string;
}

interface Order {
  id: number;
  marketId: number;
  type: 'Buy' | 'Sell';
  amount: number;
  price: number;
}

let markets: Market[] = [];
let orders: Order[] = [];

export function createMarket(data: { name: string; description: string }): Market {
  const newMarket: Market = {
    id: markets.length + 1,
    name: data.name,
    description: data.description,
    status: 'Open',
    orders: [],
  };
  markets.push(newMarket);
  return newMarket;
}

export function matchOrder(data: { marketId: number; type: 'Buy' | 'Sell'; amount: number; price: number }): Order {
  const newOrder: Order = {
    id: orders.length + 1,
    marketId: data.marketId,
    type: data.type,
    amount: data.amount,
    price: data.price,
  };
  orders.push(newOrder);

  const market = markets.find((m) => m.id === data.marketId);
  if (market) {
    market.orders.push(newOrder);
  }

  // Implement order matching logic here

  return newOrder;
}

export function resolveOutcome(data: { marketId: number; outcome: string }): Market | undefined {
  const market = markets.find((m) => m.id === data.marketId);
  if (market) {
    market.status = 'Closed';
    market.outcome = data.outcome;
  }
  return market;
}
