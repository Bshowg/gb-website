const { getArticlesPhp, articleLoader } = require('../scripts/main');

describe('articleLoader', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = jest.spyOn(global, 'fetch').mockImplementation(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve([
                    { file: 'test1.html', src: 'test1.html', order: 1, date: '2024-01-01' },
                    { file: 'test2.html', src: 'test2.html', order: 2, date: '2024-01-02' }
                ])
            })
        );
        document.body.innerHTML = '<div id="articlesContainer"></div>';
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    test('loads articles and adds them to the DOM', async () => {
        const loader = articleLoader();
        await loader.loadArticles();

        const articlesContainer = document.getElementById('articlesContainer');
        expect(articlesContainer.children.length).toBe(2);
        expect(articlesContainer.children[0].querySelector('h3').textContent).toBe('No title');
        expect(articlesContainer.children[1].querySelector('h3').textContent).toBe('No title');
    });

    test('hides load more button when no more articles', async () => {
        fetchMock.mockImplementationOnce(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve([])
            })
        );

        const loader = articleLoader();
        await loader.loadArticles();

        const loadMoreButton = document.querySelector('.load-more-button');
        const noMoreArticlesMessage = document.querySelector('.no-more-articles-message');

        expect(loadMoreButton.style.display).toBe('none');
        expect(noMoreArticlesMessage.style.display).toBe('block');
    });
});
