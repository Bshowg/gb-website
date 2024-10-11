// main.js
document.addEventListener('alpine:init', () => {
    Alpine.data('routerOutlet', () => ({
        init() {
            console.log('Router outlet initialized.');
            console.log(window.location.pathname);
        }
    }));
});

async function getArticlesPhp() {
    
    let json=await fetch("./php/get_articles.php").then(response => {
            
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        console.log("done")
        return response.json();
    })
    
    return json;
}
function articleLoader() {
    return {
        async loadArticles() {
            const articles =await getArticlesPhp(); // Add more as needed
            console.log(articles);
            articles.pop(1).forEach(article => {
                fetch(`${article.file}`)
                    .then(response => response.text())
                    .then(html => {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(html, "text/html");
                        const title = doc.querySelector('h1') ? doc.querySelector('h1').innerText : 'No title';
                        const excerpt = doc.querySelector('p') ? doc.querySelector('p').innerText : 'No excerpt available';
                        const img = doc.querySelector('img') ? doc.querySelector('img').src : 'No img available';
                        const articleHTML = `
                            <article class="bg-black">

                                <img src=${img} alt=${img} class="w-full h-auto mb-8 img_hero">
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
                    })
                    .catch(error => {
                        console.error('Error fetching article:', error);
                    });
            });
        }
    };
}