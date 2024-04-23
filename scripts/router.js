// router.js
window.addEventListener('load', () => {
    const navigateTo = (pathname) => {
        console.log(pathname);
        window.history.pushState({}, pathname, window.location.origin + pathname);
        router();
    };

    const routes = {
        '/': 'home.html',
        '/timo': 'timo.html',
        '/vento':'vento.html',
        '/fede':'fede.html',
    };

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

