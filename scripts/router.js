// router.js
window.addEventListener('load', () => {
    const navigateTo = (pathname) => {
        console.log(pathname);
        window.history.pushState({}, pathname, window.location.origin + pathname);
        router();
    };
    const parseDirectoryListing= async () => {
        // Get all the <li> elements in the HTML document
        let dirListingHTML=await fetch("metadata/articles.html").then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            console.log("done")
            return response.text();
        });
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
    
    const routes = parseDirectoryListing();

    const router = async () => {
    const path = window.location.pathname;
    const route = routes[path] || routes['/'];
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

