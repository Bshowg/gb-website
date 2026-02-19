/**
 * Sailing Bizzosa - Booking Configurator
 */

class BookingConfigurator {
    constructor() {
        // State management
        this.state = {
            packageType: null,
            startDate: null,
            endDate: null,
            guests: 2,
            destinations: [],
            extras: [],
            basePrice: 0,
            extrasTotal: 0,
            totalPrice: 0
        };

        // Package configurations
        this.packages = {
            DAY_SAIL: {
                name: 'Day Sail',
                duration: { min: 1, max: 1 },
                maxGuests: 8,
                destinations: ['elba', 'baratti', 'buca_fate'],
                boarding: '10:00',
                disembark: '19:00'
            },
            DAILY_CHARTER: {
                name: 'Daily Charter',
                duration: { min: 2, max: 6 },
                maxGuests: 8,
                destinations: {
                    2: ['elba'],
                    3: ['elba', 'capraia', 'giglio'],
                    4: ['elba', 'capraia', 'giglio'],
                    5: ['elba', 'capraia', 'giglio'],
                    6: ['elba', 'capraia', 'giglio']
                },
                boarding: '11:00',
                disembark: '18:00'
            },
            WEEKLY_CHARTER: {
                name: 'Weekly Charter',
                duration: { min: 7, max: 30 },
                maxGuests: 6,
                destinations: ['elba', 'capraia', 'giglio', 'corsica', 'sardegna'],
                boarding: '11:00',
                disembark: '18:00',
                discount: 0.2
            }
        };

        // Available destinations
        this.destinationNames = {
            elba: 'Elba',
            baratti: 'Baratti',
            buca_fate: 'Buca delle Fate',
            capraia: 'Capraia',
            giglio: 'Giglio',
            corsica: 'Corsica (SE)',
            sardegna: 'Sardegna (La Maddalena)'
        };

        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.initPackageSelector();
        this.initDatePickers();
        this.initDestinationSelector();
        this.initGuestCounter();
        this.initExtras();
        this.initSubmitButtons();
        this.loadAvailability();
        this.loadExtras();
    }

    // Package Selector
    initPackageSelector() {
        const packageCards = document.querySelectorAll('.package-card');
        
        packageCards.forEach(card => {
            card.addEventListener('click', () => {
                // Remove selected from all cards
                packageCards.forEach(c => c.classList.remove('selected'));
                
                // Add selected to clicked card
                card.classList.add('selected');
                
                // Update state
                const packageType = card.dataset.package;
                this.state.packageType = packageType;
                
                // Update form based on package
                this.updateFormForPackage(packageType);
                
                // Recalculate price
                this.calculatePrice();
            });
        });
    }

    updateFormForPackage(packageType) {
        const pkg = this.packages[packageType];
        if (!pkg) return;

        // Update guest max
        const guestsInput = document.getElementById('guestsCount');
        if (guestsInput) {
            guestsInput.max = pkg.maxGuests;
            if (this.state.guests > pkg.maxGuests) {
                this.state.guests = pkg.maxGuests;
                guestsInput.value = pkg.maxGuests;
            }
        }

        // Update date constraints
        this.updateDateConstraints(packageType);
        
        // Update available destinations
        this.updateAvailableDestinations();
    }

    // Date Pickers
    initDatePickers() {
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        
        // Set min date to today
        const today = new Date().toISOString().split('T')[0];
        if (startDate) startDate.min = today;
        if (endDate) endDate.min = today;

        startDate?.addEventListener('change', (e) => {
            this.state.startDate = e.target.value;
            this.updateDateConstraints(this.state.packageType);
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
        });

        endDate?.addEventListener('change', (e) => {
            this.state.endDate = e.target.value;
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
        });
    }

    updateDateConstraints(packageType) {
        if (!packageType) return;
        
        const pkg = this.packages[packageType];
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        
        if (!startDate || !endDate) return;

        if (startDate.value) {
            const start = new Date(startDate.value);
            const minEnd = new Date(start);
            const maxEnd = new Date(start);
            
            minEnd.setDate(minEnd.getDate() + pkg.duration.min - 1);
            maxEnd.setDate(maxEnd.getDate() + pkg.duration.max - 1);
            
            endDate.min = minEnd.toISOString().split('T')[0];
            endDate.max = maxEnd.toISOString().split('T')[0];
            
            // For DAY_SAIL, auto-set end date
            if (packageType === 'DAY_SAIL') {
                endDate.value = startDate.value;
                this.state.endDate = startDate.value;
            }
        }
    }

    calculateDuration() {
        if (!this.state.startDate || !this.state.endDate) return 0;
        
        const start = new Date(this.state.startDate);
        const end = new Date(this.state.endDate);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        
        return days;
    }

    // Destination Selector
    initDestinationSelector() {
        this.renderDestinations();
    }

    renderDestinations() {
        const grid = document.getElementById('destinationsGrid');
        if (!grid) return;

        grid.innerHTML = '';
        
        Object.keys(this.destinationNames).forEach(key => {
            const div = document.createElement('div');
            div.className = 'destination-option';
            div.dataset.destination = key;
            div.textContent = this.destinationNames[key];
            
            div.addEventListener('click', () => this.toggleDestination(key));
            
            grid.appendChild(div);
        });
    }

    toggleDestination(destination) {
        const element = document.querySelector(`[data-destination="${destination}"]`);
        if (!element || element.classList.contains('disabled')) return;

        if (this.state.destinations.includes(destination)) {
            // Remove destination
            this.state.destinations = this.state.destinations.filter(d => d !== destination);
            element.classList.remove('selected');
        } else {
            // Add destination
            this.state.destinations.push(destination);
            element.classList.add('selected');
        }

        this.calculatePrice();
    }

    updateAvailableDestinations() {
        const pkg = this.packages[this.state.packageType];
        if (!pkg) {
            // Disable all if no package selected
            document.querySelectorAll('.destination-option').forEach(el => {
                el.classList.add('disabled');
            });
            return;
        }

        const duration = this.calculateDuration();
        let availableDestinations = [];

        if (this.state.packageType === 'DAILY_CHARTER' && pkg.destinations[duration]) {
            availableDestinations = pkg.destinations[duration];
        } else if (Array.isArray(pkg.destinations)) {
            availableDestinations = pkg.destinations;
        }

        // Update UI
        document.querySelectorAll('.destination-option').forEach(el => {
            const dest = el.dataset.destination;
            if (availableDestinations.includes(dest)) {
                el.classList.remove('disabled');
            } else {
                el.classList.add('disabled');
                el.classList.remove('selected');
                // Remove from state if disabled
                this.state.destinations = this.state.destinations.filter(d => d !== dest);
            }
        });
    }

    // Guest Counter
    initGuestCounter() {
        const minus = document.getElementById('guestsMinus');
        const plus = document.getElementById('guestsPlus');
        const input = document.getElementById('guestsCount');

        minus?.addEventListener('click', () => {
            if (this.state.guests > 1) {
                this.state.guests--;
                if (input) input.value = this.state.guests;
                this.calculatePrice();
            }
        });

        plus?.addEventListener('click', () => {
            const max = this.state.packageType ? this.packages[this.state.packageType].maxGuests : 8;
            if (this.state.guests < max) {
                this.state.guests++;
                if (input) input.value = this.state.guests;
                this.calculatePrice();
            }
        });
    }

    // Extras
    async loadExtras() {
        // For now, use mock data. Will be replaced with API call
        const mockExtras = [
            { id: 1, name_it: 'Skipper', name_en: 'Skipper', pricing_type: 'FLAT_RATE', price: 150 },
            { id: 2, name_it: 'Hostess', name_en: 'Hostess', pricing_type: 'PER_DAY', price: 100 },
            { id: 3, name_it: 'Pranzo a bordo', name_en: 'Lunch on board', pricing_type: 'PER_PERSON', price: 25 },
            { id: 4, name_it: 'Stand Up Paddle', name_en: 'Stand Up Paddle', pricing_type: 'FLAT_RATE', price: 50 },
            { id: 5, name_it: 'Attrezzatura snorkeling', name_en: 'Snorkeling equipment', pricing_type: 'PER_PERSON', price: 15 }
        ];

        this.renderExtras(mockExtras);
    }

    renderExtras(extras) {
        const container = document.getElementById('extrasList');
        if (!container) return;

        container.innerHTML = '';
        
        extras.forEach(extra => {
            const div = document.createElement('div');
            div.className = 'extra-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `extra-${extra.id}`;
            checkbox.value = extra.id;
            
            const label = document.createElement('label');
            label.htmlFor = `extra-${extra.id}`;
            
            const lang = i18n?.getCurrentLanguage() || 'it';
            const name = lang === 'it' ? extra.name_it : extra.name_en;
            
            let priceText = `€${extra.price}`;
            if (extra.pricing_type === 'PER_DAY') priceText += '/giorno';
            if (extra.pricing_type === 'PER_PERSON') priceText += '/persona';
            
            label.innerHTML = `${name} <span class="extra-price">${priceText}</span>`;
            
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.state.extras.push(extra);
                } else {
                    this.state.extras = this.state.extras.filter(e => e.id !== extra.id);
                }
                this.calculatePrice();
            });
            
            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    initExtras() {
        // Extras initialization is handled by loadExtras
    }

    // Availability
    async loadAvailability() {
        // For now, all dates are available. Will be replaced with API call
        // This would check blocked_periods table
    }

    // Price Calculation
    calculatePrice() {
        if (!this.state.packageType || !this.state.startDate || !this.state.endDate) {
            this.updatePriceDisplay(0, 0, 0);
            return;
        }

        const days = this.calculateDuration();
        
        // Mock daily prices (will be from database)
        const dailyPrices = {
            DAY_SAIL: 800,
            DAILY_CHARTER: 1200,
            WEEKLY_CHARTER: 1000
        };

        let basePrice = dailyPrices[this.state.packageType] * days;
        
        // Apply weekly charter discount
        if (this.state.packageType === 'WEEKLY_CHARTER') {
            basePrice = basePrice * 0.8; // 20% discount
        }

        // Calculate extras
        let extrasTotal = 0;
        this.state.extras.forEach(extra => {
            switch (extra.pricing_type) {
                case 'FLAT_RATE':
                    extrasTotal += parseFloat(extra.price);
                    break;
                case 'PER_DAY':
                    extrasTotal += parseFloat(extra.price) * days;
                    break;
                case 'PER_PERSON':
                    extrasTotal += parseFloat(extra.price) * this.state.guests;
                    break;
            }
        });

        const totalPrice = basePrice + extrasTotal;
        
        this.state.basePrice = basePrice;
        this.state.extrasTotal = extrasTotal;
        this.state.totalPrice = totalPrice;
        
        this.updatePriceDisplay(basePrice, extrasTotal, totalPrice);
    }

    updatePriceDisplay(base, extras, total) {
        const baseEl = document.getElementById('basePrice');
        const extrasEl = document.getElementById('extrasTotal');
        const totalEl = document.getElementById('totalPrice');
        
        if (baseEl) baseEl.textContent = `€ ${base.toFixed(2)}`;
        if (extrasEl) extrasEl.textContent = `€ ${extras.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `€ ${total.toFixed(2)}`;
    }

    // Submit Buttons
    initSubmitButtons() {
        const emailBtn = document.getElementById('requestEmail');
        const whatsappBtn = document.getElementById('requestWhatsApp');
        const modal = document.getElementById('emailModal');
        const closeModal = modal?.querySelector('.close');
        const submitEmail = document.getElementById('submitEmail');
        const customerEmailInput = document.getElementById('customerEmail');

        emailBtn?.addEventListener('click', () => {
            if (!this.validateBooking()) return;
            modal?.classList.add('show');
        });

        closeModal?.addEventListener('click', () => {
            modal?.classList.remove('show');
        });

        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal?.classList.remove('show');
            }
        });

        submitEmail?.addEventListener('click', async () => {
            const email = customerEmailInput?.value;
            if (!email || !this.validateEmail(email)) {
                showMessage(i18n?.formatMessage('messages.email_required') || 'Email richiesta', 'error');
                return;
            }

            await this.submitBookingRequest(email);
            modal?.classList.remove('show');
        });

        whatsappBtn?.addEventListener('click', () => {
            if (!this.validateBooking()) return;
            this.sendWhatsAppMessage();
        });
    }

    validateBooking() {
        if (!this.state.packageType) {
            showMessage(i18n?.formatMessage('messages.select_package') || 'Seleziona un pacchetto', 'error');
            return false;
        }
        
        if (!this.state.startDate || !this.state.endDate) {
            showMessage(i18n?.formatMessage('messages.invalid_dates') || 'Date non valide', 'error');
            return false;
        }
        
        if (this.state.destinations.length === 0) {
            showMessage(i18n?.formatMessage('messages.select_destination') || 'Seleziona almeno una destinazione', 'error');
            return false;
        }
        
        return true;
    }

    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    async submitBookingRequest(email) {
        // For now, just show success. Will be replaced with API call
        const bookingData = {
            ...this.state,
            customer_email: email
        };
        
        console.log('Booking request:', bookingData);
        showMessage(i18n?.formatMessage('messages.booking_sent') || 'Richiesta inviata con successo', 'success');
        
        // Reset form after submission
        setTimeout(() => this.resetForm(), 2000);
    }

    sendWhatsAppMessage() {
        const pkg = this.packages[this.state.packageType];
        const duration = this.calculateDuration();
        
        let message = `Richiesta Preventivo Sailing Bizzosa\n\n`;
        message += `Pacchetto: ${pkg.name}\n`;
        message += `Date: ${this.state.startDate} - ${this.state.endDate} (${duration} giorni)\n`;
        message += `Ospiti: ${this.state.guests}\n`;
        message += `Destinazioni: ${this.state.destinations.map(d => this.destinationNames[d]).join(', ')}\n`;
        
        if (this.state.extras.length > 0) {
            message += `Extra: ${this.state.extras.map(e => e.name_it).join(', ')}\n`;
        }
        
        message += `\nPrezzo stimato: €${this.state.totalPrice.toFixed(2)}`;
        
        const whatsappNumber = '393331234567'; // Replace with actual number
        const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
        
        window.open(url, '_blank');
    }

    resetForm() {
        // Reset state
        this.state = {
            packageType: null,
            startDate: null,
            endDate: null,
            guests: 2,
            destinations: [],
            extras: [],
            basePrice: 0,
            extrasTotal: 0,
            totalPrice: 0
        };

        // Reset UI
        document.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('guestsCount').value = 2;
        document.querySelectorAll('.destination-option').forEach(d => d.classList.remove('selected'));
        document.querySelectorAll('#extrasList input[type="checkbox"]').forEach(c => c.checked = false);
        this.updatePriceDisplay(0, 0, 0);
    }
}

// Initialize configurator
const configurator = new BookingConfigurator();