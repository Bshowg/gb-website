// router.js
window.addEventListener('load', async () => {
    const navigateTo = (pathname) => {
        console.log(pathname);
        window.history.pushState({}, pathname, window.location.origin + pathname);
        router();
    };
    async function getArticlesPhp() {
    
        let json=await fetch("./php/get_articles.php?limit=0&offset=0").then(response => {
                
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            console.log("done")
            return response.json();
        })
        const routes = {};
    
        // Loop through each <li> element
        json.forEach(item => {
    
            // Construct an object with the data from the <span> elements
            routes[item.src]=item.file;
        });
    
        // Return the resultList array containing all the data objects
        return routes;
    }
    const routes = await getArticlesPhp();
    console.log(routes);
    const router = async () => {
    const path = window.location.pathname;
    var route = routes[path] || routes["/"];
    route="articles/"+route;
    
    try {
        const html = await fetch(route).then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            console.log("done")
            return response.text();
        });
        document.querySelector('#app').innerHTML = html;
        let js_path="scripts"+path+".js"
        const js=await fetch(js_path).then(response=>{
            if(response.ok){
                const script = document.createElement('script');
                script.src = `${js_path}`; //?v=${new Date().getTime()}
                script.async = true;
                script.onload = ()=>{console.log("content loaded");}; 
                script.onerror = () => console.error('Error loading script:', src);
                document.head.appendChild(script);
            }
        });
        
    } catch (error) {
        console.error('Failed to fetch page: ', error);
    }

};

    window.onpopstate = router;
    window.navigateTo = navigateTo;

    router();
});

