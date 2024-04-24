// main.js
document.addEventListener('alpine:init', () => {
    Alpine.data('routerOutlet', () => ({
        init() {
            console.log('Router outlet initialized.');
            console.log(window.location.pathname);
        }
    }));
});
async function parseDirectoryListing() {

    let dirListingHTML=await fetch("./metadata/articles.html").then(response => {
            
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        console.log("done")
        return response.text();
    }).then(function(html) {
        // Initialize the DOM parser
        var parser = new DOMParser();

        // Parse the text
        var doc = parser.parseFromString(html, "text/html");

        // You can now even select part of that html as you would in the regular DOM 
        // Example:
        // var docArticle = doc.querySelector('article').innerHTML;

        return doc;
    });
    // Get all the <li> elements in the HTML document
    const listItems = dirListingHTML.querySelectorAll('ul li');
    const resultList = [];

    // Loop through each <li> element
    listItems.forEach(item => {
        const src = item.querySelector('.src').textContent;
        const file = item.querySelector('.file').textContent;
        const date = item.querySelector('.date').textContent;

        // Construct an object with the data from the <span> elements
        const dataObject = {
            src: src,
            file: file,
            date: date
        };

        // Add the object to the resultList array
        resultList.push(dataObject);
    });

    // Return the resultList array containing all the data objects
    return resultList;
}
function articleLoader() {
    return {
        async loadArticles() {
            const articles =await parseDirectoryListing(); // Add more as needed
            console.log(articles);
            articles.forEach(article => {
                fetch(`${article.file}`)
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
                                    <button onclick="location.href='${article.src}'" class="bg-white text-black px-3 py-1 font-bold">READ MORE</button>
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