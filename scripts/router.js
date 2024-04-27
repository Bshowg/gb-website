// router.js
window.addEventListener('load', async () => {
    const navigateTo = (pathname) => {
        console.log(pathname);
        window.history.pushState({}, pathname, window.location.origin + pathname);
        router();
    };
    const parseDirectoryListing= async () => {
        // Get all the <li> elements in the HTML document
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
        console.log(dirListingHTML);
        const listItems = dirListingHTML.querySelectorAll('ul li');
        const routes = {};
    
        // Loop through each <li> element
        listItems.forEach(item => {
            const route = item.querySelector('.src').textContent;
            const path = item.querySelector('.file').textContent;
    
            // Construct an object with the data from the <span> elements
            routes[route]=path;
        });
    
        // Return the resultList array containing all the data objects
        return routes;
    }
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
    const routes = await getArticlesPhp();
    console.log(routes);
    const router = async () => {
    const path = window.location.pathname;

    if (path === '/contacts') {
        // This path is handled by the server directly.
        window.location.href = '/contacts.html';
        return;
    }
    const route = routes[path] || routes["/"];
    try {
        const html = await fetch(route).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            console.log("done")
            return response.text();
        });
        document.querySelector('#app').innerHTML = html;

        
    } catch (error) {
        console.error('Failed to fetch page: ', error);
    }

};

    window.onpopstate = router;
    window.navigateTo = navigateTo;

    router();
});

