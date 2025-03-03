import React from 'react';
import MarketCard from '../components/MarketCard';

const Market: React.FC = () => {
  const markets = [
    { id: 1, name: 'Market 1', description: 'Description for Market 1', status: 'Open' },
    { id: 2, name: 'Market 2', description: 'Description for Market 2', status: 'Closed' },
    // Add more markets as needed
  ];

  return (
    <div>
      <h1>Market View</h1>
      <div>
        {markets.map((market) => (
          <MarketCard key={market.id} market={market} />
        ))}
      </div>
    </div>
  );
};

export default Market;
