import React from 'react';

interface MarketCardProps {
  market: {
    id: number;
    name: string;
    description: string;
    status: string;
  };
}

const MarketCard: React.FC<MarketCardProps> = ({ market }) => {
  return (
    <div className="market-card">
      <h2>{market.name}</h2>
      <p>{market.description}</p>
      <p>Status: {market.status}</p>
    </div>
  );
};

export default MarketCard;
