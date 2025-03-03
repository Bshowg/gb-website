import React from 'react';
import Link from 'next/link';

const Home: React.FC = () => {
  return (
    <div>
      <h1>Welcome to Untunnai</h1>
      <p>This is a prediction market simulator using simulated tokens.</p>
      <nav>
        <ul>
          <li>
            <Link href="/market">
              <a>Market</a>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Home;
