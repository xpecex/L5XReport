/**
 * i18n — Simple internationalization helper module.
 * @description Loads JSON translation files, provides t() lookup,
 *   and applies translations to DOM elements via data-i18n attributes.
 */
export const i18n = {
    /** @type {string} Current active language code (e.g. 'pt_BR'). */
    currentLang: 'pt_BR',

    /** @type {Record<string, string>} Translation cache keyed by language. */
    translations: {},

    /**
     * Map translation file keys to browser locale codes.
     * @type {Record<string, string>}
     */
    localeMap: {
        pt_BR: 'pt-BR',
        en_US: 'en-US',
        es_ES: 'es-ES',
        fr_FR: 'fr-FR',
    },

    /**
     * Resolve a dot-notation key against the translations object.
     * @param {string} key — Dot-separated key (e.g. 'section1.title').
     * @returns {string} The translation value, or the key itself as fallback.
     */
    resolveKey(key) {
        const parts = key.split('.');
        let obj = this.translations[this.currentLang];
        if (!obj) return key;
        for (const part of parts) {
            if (obj == null || typeof obj !== 'object') return key;
            obj = obj[part];
        }
        return typeof obj === 'string' ? obj : key;
    },

    /**
     * Translate a key, with optional placeholder replacements.
     * @param {string} key — Translation key.
     * @param {Record<string, string>} [replacements] — Placeholder replacements (e.g. {current: '5', total: '10'}).
     * @returns {string} The translated string with placeholders filled in.
     */
    t(key, replacements) {
        let value = this.resolveKey(key);
        if (replacements) {
            Object.entries(replacements).forEach(([k, v]) => {
                value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
            });
        }
        return value;
    },

    /**
     * Apply translations to a single DOM element.
     * @param {HTMLElement} el — The element to translate.
     */
    applyToElement(el) {
        let key = el.getAttribute('data-i18n');
        const attr = el.getAttribute('data-i18n-attr');
        if (key) {
            el.textContent = this.t(key);
        } else if (attr) {
            // Only data-i18n-attr: use it as the key
            key = attr;
        }
        if (key && attr) {
            el.setAttribute(attr, this.t(key));
        }
    },

    /**
     * Apply translations to all elements with data-i18n or data-i18n-attr.
     */
    applyAll() {
        const elements = document.querySelectorAll('[data-i18n], [data-i18n-attr]');
        elements.forEach((el) => this.applyToElement(el));
        // Update <html lang> attribute
        const htmlLang = this.resolveKey('html_lang');
        if (htmlLang) {
            document.documentElement.setAttribute('lang', htmlLang);
        }
    },

    /**
     * Initialize i18n for a given language.
     * @param {string} lang — Language code (e.g. 'pt_BR').
     * @returns {Promise<void>}
     */
    async init(lang) {
        if (this.translations[lang]) {
            this.currentLang = lang;
            return;
        }
        try {
            const localePath = `../assets/locales/${lang}.json`;
            const resp = await fetch(localePath);
            if (!resp.ok) throw new Error(`Failed to load ${lang}`);
            this.translations[lang] = await resp.json();
            this.currentLang = lang;
        } catch (err) {
            console.warn(`[i18n] Failed to load ${lang}, falling back to pt_BR`, err);
            if (!this.translations.pt_BR) {
                //await this.init('pt_BR');
            }
            this.currentLang = 'pt_BR';
        }
    },

    /**
     * Switch to a new language and re-apply all translations.
     * @param {string} lang — Language code.
     * @returns {Promise<void>}
     */
    async setLang(lang) {
        await this.init(lang);
        this.applyAll();
    },

    /**
     * Get the browser locale code for the current language.
     * @returns {string} Browser locale (e.g. 'pt-BR').
     */
    getBrowserLocale() {
        return this.localeMap[this.currentLang] || 'pt-BR';
    },
};
