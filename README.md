# Personal Website

[<img alt="Deployed with FTP Deploy Action" src="https://img.shields.io/badge/Deployed With-FTP DEPLOY ACTION-%3CCOLOR%3E?style=for-the-badge&color=2b9348">](https://github.com/SamKirkland/FTP-Deploy-Action)

# Published

To see the website got to: [gianmarcobiscini.it](https://gianmarcobiscini.it)
## start local server

    python -m http.server

### build tailwind and minify
Using Tailwind CLI

    npx tailwindcss -i ./input.css -o ./output.css
    npx tailwindcss -o output.css --minify

### build and minify Tailwind CSS using GitHub Actions
The GitHub Actions workflow is configured to automatically build and minify Tailwind CSS. You can trigger the workflow by pushing changes to the repository.

## Setting Up and Running the Project Locally

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)
- Python (for running the local server)

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

1. Start the local server:

    ```sh
    python -m http.server
    ```

2. Open your browser and navigate to `http://localhost:8000`.

### Building Tailwind CSS

1. Build Tailwind CSS:

    ```sh
    npx tailwindcss -i ./input.css -o ./output.css --watch
    ```

2. Minify Tailwind CSS:

    ```sh
    npx tailwindcss -o output.css --minify
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
