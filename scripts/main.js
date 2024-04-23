// main.js
document.addEventListener('alpine:init', () => {
    Alpine.data('routerOutlet', () => ({
        init() {
            console.log('Router outlet initialized.');
            console.log(window.location.pathname);
        }
    }));
});

function articleLoader() {
    return {
        loadArticles() {
            const articles = [ 'fede.html','vento.html','timo.html']; // Add more as needed
            console.log(articles);
            articles.forEach(article => {
                fetch(`${article}`)
                    .then(response => response.text())
                    .then(html => {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const title = doc.querySelector('h1') ? doc.querySelector('h1').innerText : 'No title';
                        const excerpt = doc.querySelector('p') ? doc.querySelector('p').innerText : 'No excerpt available';
                        const img = doc.querySelector('img') ? doc.querySelector('img').src : 'No img available';
                        const articleHTML = `
                        <div class="gradient-border">
                            <article class="bg-black">

                                <img src=${img} alt=${img} class="w-full h-auto mb-8 img_hero">
                                <div class=" p-6">
                                    <h3 class="text-xl font-bold mb-4">${title}</h3>
                                    <p class="mb-4">${excerpt}</p>
                                    <button onclick="location.href='${article.replace(/\.[^/.]+$/, "")}'" class="bg-white text-black px-3 py-1 font-bold">READ MORE</button>
                                </div>
                           </article>
                        <div>
                        `;
                        document.getElementById('articlesContainer').innerHTML += articleHTML;
                    })
                    .catch(error => {
                        console.error('Error fetching article:', error);
                    });
            });
        }
    };
}