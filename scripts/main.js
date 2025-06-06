document.addEventListener('alpine:init', () => {
    Alpine.data('routerOutlet', () => ({
        init() {
            console.log('Router outlet initialized.');
            console.log(window.location.pathname);
        }
    }));
});

let currentPage = 1;
const articlesPerPage = 5;

async function getArticlesPhp(limit = articlesPerPage, offset = 0) {
    let json = await fetch(`./php/get_articles.php?limit=${limit}&offset=${offset}`).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        console.log("done")
        return response.json();
    })
    // Filter out articles with empty file paths or with the path `/`
    json = json.filter(article => article.src && article.src !== '/');
    return json;
}

function articleLoader() {
    return {
        async loadArticles() {
            const articles = await getArticlesPhp(articlesPerPage, (currentPage - 1) * articlesPerPage);
            console.log(articles);
            const parser = new DOMParser();
            const articlePromises = articles.map(article => fetch(`articles/${article.file}`).then(response => response.text()));
            const articleContents = await Promise.all(articlePromises);
            const articleData = articles.map((article, index) => ({ ...article, content: articleContents[index] }));
            articleData.sort((a, b) => a.order - b.order);
            console.log(articleData);
            articleData.forEach(article => addArticle(parser, article.content, article));
            if (articles.length < articlesPerPage) {
                document.querySelector('.load-more-button').style.display = 'none';
                document.querySelector('.no-more-articles-message').style.display = 'block';
            }
        },
        async loadMoreArticles() {
            currentPage++;
            await this.loadArticles();
        }
    };
}

function addArticle(parser, html, article) {
    const doc = parser.parseFromString(html, "text/html");
    const title = doc.querySelector('h1') ? doc.querySelector('h1').innerText : 'No title';
    const excerpt = doc.querySelector('p') ? doc.querySelector('p').innerText : 'No excerpt available';
    const img = doc.querySelector('img') ? doc.querySelector('img').src : 'No img available';
    const articleHTML = `
                        <article class="bg-black">

                            <div x-data="{ isLoading: true }" class="relative">
                                <!-- Skeleton Loader -->
                                <div
                                    x-show="isLoading"
                                    class="  w-full aspect-[16/9] absolute bg-black "
                                ></div>

                                <!-- Image -->
                                <img
                                    src=${img}
                                    @load="isLoading = false"
                                    x-show="!isLoading"
                                    class="w-full h-full object-cover"
                                    alt=${img}
                                />
                            </div>
                            <div class=" p-6">
                                <h3 class="text-xl font-bold mb-4 text-white">${title}</h3>
                                <p class="mb-4 text-white">${excerpt}</p>
                                <div class="flex flex-row justify-between">
                                <button onclick="location.href='${article.src}'" class="bg-white text-black px-3 py-1 font-bold">READ MORE</button>
                                <span class="align-baseline font-bold text-white">${article.date}<span>
                                </div>
                            </div>
                        </article>
                    `;
    document.getElementById('articlesContainer').innerHTML += articleHTML;
}
