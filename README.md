# Untunnai: Polymarket-Like Prediction Market Simulator

[<img alt="Deployed with FTP Deploy Action" src="https://img.shields.io/badge/Deployed With-FTP DEPLOY ACTION-%3CCOLOR%3E?style=for-the-badge&color=2b9348">](https://github.com/SamKirkland/FTP-Deploy-Action)

## Project Description

Untunnai is a full-stack web application that simulates a prediction market using simulated tokens. The project is designed to be easily deployable on platforms like Vercel or Netlify and includes serverless API routes.

## Features

- Dynamic, responsive frontend with pages (e.g., Home, Market) and components (e.g., MarketCard).
- API routes for handling market simulation operations like market creation, order matching, and outcome resolution.
- Real-time updates via WebSockets or polling.
- Basic user authentication system and a simple dashboard for market participation.
- TypeScript for enhanced type safety (optional but recommended).
- Modular structure with clear separation between UI components, business logic (market simulation), and API endpoints.
- GitHub Codespaces support with a devcontainer configuration, including a Dockerfile and devcontainer.json.

## Project Structure

- /pages
  - index.tsx        // Home page
  - market.tsx       // Market view page
  - /api
    - market.ts     // API endpoint for market simulation operations
- /components
  - MarketCard.tsx   // Component to display market details
- /utils
  - simulation.ts    // Core market simulation logic
- /public
  - /assets          // Static files such as images and styles
- .env.local         // Environment variables (e.g., API keys, configuration)
- Dockerfile         // For GitHub Codespaces development
- .devcontainer/devcontainer.json  // VS Code devcontainer configuration

## Setting Up and Running the Project Locally

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

### Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/Bshowg/gb-website.git
    cd gb-website
    ```

2. Install the dependencies:

    ```sh
    npm install
    ```

### Running the Project

1. Start the development server:

    ```sh
    npm run dev
    ```

2. Open your browser and navigate to `http://localhost:3000`.

## Deployment

### Deploying to Vercel

1. Install the Vercel CLI:

    ```sh
    npm install -g vercel
    ```

2. Deploy the project:

    ```sh
    vercel
    ```

### Deploying to Netlify

1. Install the Netlify CLI:

    ```sh
    npm install -g netlify-cli
    ```

2. Deploy the project:

    ```sh
    netlify deploy
    ```

## Automated Tests

### Running Tests

1. Install the testing dependencies:

    ```sh
    npm install --save-dev jest
    ```

2. Run the tests:

    ```sh
    npm test
    ```

3. To run a specific test file:

    ```sh
    npx jest tests/articleLoader.test.js
    ```

4. To watch for changes and re-run tests automatically:

    ```sh
    npx jest --watch
    ```
