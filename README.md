# Personal Website

[<img alt="Deployed with FTP Deploy Action" src="https://img.shields.io/badge/Deployed With-FTP DEPLOY ACTION-%3CCOLOR%3E?style=for-the-badge&color=2b9348">](https://github.com/SamKirkland/FTP-Deploy-Action)

## start local server

    python -m http.server

### build tailwind and minify
Using Tailwind CLI

    npx tailwindcss -i ./input.css -o ./output.css --watch
    npx tailwindcss -o output.css --minify

### build and minify Tailwind CSS using GitHub Actions
The GitHub Actions workflow is configured to automatically build and minify Tailwind CSS. You can trigger the workflow by pushing changes to the repository.
