/**
 * Sailing Bizzosa - Internationalization System
 */

class I18n {
    constructor() {
        this.currentLang = localStorage.getItem('language') || 'it';
        this.translations = {};
        this.init();
    }

    async init() {
        await this.loadTranslations(this.currentLang);
        this.updateContent();
        this.attachEventListeners();
    }

    async loadTranslations(lang) {
        try {
            const response = await fetch(`lang/${lang}.json`);
            if (!response.ok) throw new Error('Failed to load translations');
            this.translations = await response.json();
            document.documentElement.lang = lang;
        } catch (error) {
            console.error('Error loading translations:', error);
            // Fallback to Italian
            if (lang !== 'it') {
                await this.loadTranslations('it');
            }
        }
    }

    updateContent() {
        // Update all elements with data-i18n-key attribute
        document.querySelectorAll('[data-i18n-key]').forEach(element => {
            const key = element.getAttribute('data-i18n-key');
            const translation = this.getTranslation(key);
            
            if (translation) {
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                    element.placeholder = translation;
                } else {
                    element.textContent = translation;
                }
            }
        });

        // Update language toggle buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
        });
    }

    getTranslation(key) {
        const keys = key.split('.');
        let translation = this.translations;
        
        for (const k of keys) {
            if (translation && typeof translation === 'object') {
                translation = translation[k];
            } else {
                return null;
            }
        }
        
        return translation;
    }

    attachEventListeners() {
        // Language toggle buttons
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const lang = btn.dataset.lang;
                if (lang !== this.currentLang) {
                    await this.switchLanguage(lang);
                }
            });
        });
    }

    async switchLanguage(lang) {
        this.currentLang = lang;
        localStorage.setItem('language', lang);
        await this.loadTranslations(lang);
        this.updateContent();
        
        // Trigger custom event for other components
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }

    // Helper method to format messages with parameters
    formatMessage(key, params = {}) {
        let message = this.getTranslation(key) || key;
        
        Object.keys(params).forEach(param => {
            message = message.replace(`{${param}}`, params[param]);
        });
        
        return message;
    }

    // Get current language
    getCurrentLanguage() {
        return this.currentLang;
    }
}

// Initialize i18n when DOM is ready
let i18n;
document.addEventListener('DOMContentLoaded', () => {
    i18n = new I18n();
});