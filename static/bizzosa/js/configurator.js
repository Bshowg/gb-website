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
            destination: '',
            extras: [],
            basePrice: 0,
            extrasTotal: 0,
            totalPrice: 0
        };

        // Package configurations - Updated to 2 options
        this.packages = {
            DAILY_CHARTER: {
                name: 'Daily Charter',
                duration: { min: 1, max: 3 },
                maxGuests: 8,
                destinations: {
                    1: ['elba','baratti', 'buca_fate'],
                    2: ['elba', 'capraia', 'baratti', 'buca_fate'],
                    3: ['elba', 'capraia', 'giglio','baratti', 'buca_fate']
                },
                boarding: '11:00',
                disembark: '18:00'
            },
            WEEKLY_CHARTER: {
                name: 'Weekly Charter',
                duration: { min: 3, max: 30 }, // Minimum 3 nights
                maxGuests: 8,
                destinations: 'by_duration', // Filtered by duration like DAILY_CHARTER
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
        this.initCalculateButton();
        this.initSubmitButtons();
        this.loadAvailability();
        this.loadExtras();
    }

    // Package Selector
    initPackageSelector() {
        const packageTabs = document.querySelectorAll('.package-tab');

        packageTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const packageType = tab.dataset.package;

                // Skip if same package is already selected
                if (this.state.packageType === packageType) return;

                // Remove selected from all tabs
                packageTabs.forEach(t => t.classList.remove('selected'));

                // Add selected to clicked tab
                tab.classList.add('selected');

                // Reset form fields
                this.state.startDate = null;
                this.state.endDate = null;
                this.state.destination = '';
                this.state.extras = [];
                this.state.guests = 2;
                this.state.basePrice = 0;
                this.state.extrasTotal = 0;
                this.state.totalPrice = 0;

                document.getElementById('startDate').value = '';
                document.getElementById('endDate').value = '';
                document.getElementById('guestsCount').value = 2;
                const destSelect = document.getElementById('destinationSelect');
                if (destSelect) destSelect.value = '';
                document.querySelectorAll('#extrasList input[type="checkbox"]').forEach(c => c.checked = false);

                // Hide booking details section
                const detailsSection = document.getElementById('booking-details');
                if (detailsSection) detailsSection.style.display = 'none';

                // Update state with new package
                this.state.packageType = packageType;

                // Update form based on package
                this.updateFormForPackage(packageType);

                // Update price display
                this.updatePriceDisplay(0, 0, 0);
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
        this.renderDestinationDropdown();

        const select = document.getElementById('destinationSelect');
        select?.addEventListener('change', (e) => {
            this.state.destination = e.target.value;
        });
    }

    renderDestinationDropdown() {
        const select = document.getElementById('destinationSelect');
        if (!select) return;

        // Keep the first "Select destination" option
        select.innerHTML = select.options[0].outerHTML;

        // Add all destinations
        Object.keys(this.destinationNames).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = this.destinationNames[key];
            select.appendChild(option);
        });
    }

    // Destinations available based on minimum number of days
    getDestinationsForDuration(duration) {
        // Base destinations always available (1+ days)
        const destinations = ['elba', 'baratti', 'buca_fate'];

        // 2+ days: unlock Capraia, Giglio
        if (duration >= 2) {
            destinations.push('capraia', 'giglio');
        }

        // 6+ days: unlock Corsica, Sardegna
        if (duration >= 6) {
            destinations.push('corsica', 'sardegna');
        }

        return destinations;
    }

    updateAvailableDestinations() {
        const pkg = this.packages[this.state.packageType];
        const select = document.getElementById('destinationSelect');
        if (!pkg || !select) return;

        const duration = this.calculateDuration();
        let availableDestinations = [];

        if (duration > 0) {
            availableDestinations = this.getDestinationsForDuration(duration);
        }

        // Update dropdown options
        const firstOption = select.options[0].outerHTML;
        const currentValue = select.value;
        select.innerHTML = firstOption;

        // Add only available destinations
        availableDestinations.forEach(key => {
            if (this.destinationNames[key]) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = this.destinationNames[key];
                select.appendChild(option);
            }
        });

        // Restore selection if still available
        if (availableDestinations.includes(currentValue)) {
            select.value = currentValue;
        } else {
            this.state.destination = '';
        }
    }

    // Guest Counter (now a dropdown select)
    initGuestCounter() {
        const select = document.getElementById('guestsCount');

        select?.addEventListener('change', () => {
            this.state.guests = parseInt(select.value, 10);
            this.calculatePrice();
        });
    }

    // Extras
    async loadExtras() {
        // For now, use mock data. Will be replaced with API call
        const mockExtras = [
            { id: 1, name_it: 'Imbarco/Sbarco Porto di Salivoli', name_en: 'Embarkation/Disembarkation Port', pricing_type: 'PER_TRIP', price: 150 },
            { id: 2, name_it: 'Tender', name_en: 'Tender', pricing_type: 'FLAT_RATE', price: 50 },
            { id: 3, name_it: 'Fuoribordo Tender', name_en: 'Tender Outboard Motor', pricing_type: 'FLAT_RATE', price: 70 },
            { id: 4, name_it: 'Servizio Pranzo a Bordo', name_en: 'Onboard Lunch Service', pricing_type: 'PER_PERSON', price: 30 },
            { id: 5, name_it: 'Servizio Aperitivo a Bordo', name_en: 'Onboard Aperitif Service', pricing_type: 'PER_PERSON', price: 15 },
            { id: 6, name_it: 'Pernottamento Extra in Porto', name_en: 'Extra Night in Port', pricing_type: 'PER_NIGHT', price: 150 },
            { id: 7, name_it: 'Pernottamento Extra in Rada', name_en: 'Extra Night at Anchor', pricing_type: 'PER_NIGHT', price: 300 }
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
                case 'PER_TRIP':
                    extrasTotal += parseFloat(extra.price);
                    break;
                case 'PER_NIGHT':
                    extrasTotal += parseFloat(extra.price);
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

    // Calculate Button
    initCalculateButton() {
        const calculateBtn = document.getElementById('calculateQuote');
        calculateBtn?.addEventListener('click', () => {
            if (this.validateFirstStage()) {
                this.calculateAndShowDetails();
            }
        });
    }

    validateFirstStage() {
        const errors = [];
        
        if (!this.state.packageType) {
            errors.push('Seleziona un tipo di charter');
        }
        
        if (!this.state.startDate || !this.state.endDate) {
            errors.push('Seleziona le date');
        }
        
        if (!this.state.destination) {
            errors.push('Seleziona una destinazione');
        }
        
        if (errors.length > 0) {
            showMessage(errors.join(', '), 'error');
            return false;
        }
        
        return true;
    }

    async calculateAndShowDetails() {
        // Calculate base price
        this.calculatePrice();
        
        // Show the details section
        const detailsSection = document.getElementById('booking-details');
        if (detailsSection) {
            detailsSection.style.display = 'block';
            
            // Smooth scroll to details
            setTimeout(() => {
                detailsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
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
        
        if (!this.state.destination) {
            showMessage(i18n?.formatMessage('messages.select_destination') || 'Seleziona una destinazione', 'error');
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
        message += `Destinazione: ${this.destinationNames[this.state.destination]}\n`;
        
        if (this.state.extras.length > 0) {
            message += `Extra: ${this.state.extras.map(e => e.name_it).join(', ')}\n`;
        }
        
        message += `\nPrezzo stimato: €${this.state.totalPrice.toFixed(2)}`;
        
        const whatsappNumber = '+393934830048'; // Replace with actual number
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
            destination: '',
            extras: [],
            basePrice: 0,
            extrasTotal: 0,
            totalPrice: 0
        };

        // Reset UI
        document.querySelectorAll('.package-tab').forEach(c => c.classList.remove('selected'));
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        document.getElementById('guestsCount').value = 2;
        const destSelect = document.getElementById('destinationSelect');
        if (destSelect) destSelect.value = '';
        document.querySelectorAll('#extrasList input[type="checkbox"]').forEach(c => c.checked = false);
        this.updatePriceDisplay(0, 0, 0);
    }
}

// Initialize configurator
const configurator = new BookingConfigurator();