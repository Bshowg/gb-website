function oracleApp() {
    return {
        answer: '',
        answers: [
            'Per forza non viene nemmen l\'aceto.',
            'Non è tutto oro ciò che luccica.',
            'Le quercie non fanno i limoni.',
            'Ruota che cigola becca l\'olio.',
            'Nel troppo ci sta l\'assai.',
            'Rosso di sera...',
            'Cavallo Pazzo.',
            'Icchè ci va ci vole.',
            'Chi è causa del suo mal, pianga sè stesso.',
            'Saprai sì, quanto sa di sale lo pane altrui.',
            'Tutto è veleno, nulla esiste di non velenoso.',
            'Vuolsi così colà dove si puote ciò che si vuole, e più non dimandare.',
            'Mangiare è sopravvivere per avere fame',
            'I fiori muoiono quando ci rattrista perderli, le male erbe spuntano dove ci rattrista vederle.',
            'Entrando nella foresta non agita l\'erba',

        ],
        askOracle() {
            this.answer = '';
            const randomIndex = Math.floor(Math.random() * this.answers.length);
            this.answer = this.answers[randomIndex];
        }
    }
}