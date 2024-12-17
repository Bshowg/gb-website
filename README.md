# Personal Website

[<img alt="Deployed with FTP Deploy Action" src="https://img.shields.io/badge/Deployed With-FTP DEPLOY ACTION-%3CCOLOR%3E?style=for-the-badge&color=2b9348">](https://github.com/SamKirkland/FTP-Deploy-Action)

## start local server

    python -m http.server

### build tailwind and minify
Using Tailwind CLI

    npx tailwindcss -i ./input.css -o ./output.css --watch
    npx tailwindcss -o output.css --minify

### Running a local server with `http-server`

To run a local server with `http-server`, follow these steps:

1. Install `http-server` globally using npm:

    ```sh
    npm install -g http-server
    ```

2. Navigate to the root directory of your project:

    ```sh
    cd path/to/your/project
    ```

3. Start the server with the `--spa` option to handle single-page application routing:

    ```sh
    http-server -p 8080 --spa
    ```

### Enabling debugging with `scripts/debug.js`

To enable debugging for your local development, follow these steps:

1. Ensure that the `scripts/debug.js` file is included in your `index.html`:

    ```html
    <script src="scripts/debug.js"></script>
    ```

2. The `scripts/debug.js` file includes basic debugging tools like `console.log` and error handling. You can add more debugging functions as needed.
