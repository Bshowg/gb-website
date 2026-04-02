/**
 * Sailing Bizzosa - Booking Configurator
 */

class BookingConfigurator {
    constructor() {
        // Current language
        this.currentLang = document.documentElement.lang || 'it';
        
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
        
        // Preselect Daily Charter package on load
        this.preselectDailyCharter();
        
        // Listen for language changes
        window.addEventListener('languageChanged', (e) => {
            this.currentLang = e.detail.language;
            // Re-render extras with new language
            this.loadExtras();
            // Update date picker placeholders
            this.updateDatePickerLanguage();
        });
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

    preselectDailyCharter() {
        // Find the Daily Charter tab
        const dailyCharterTab = document.querySelector('[data-package="DAILY_CHARTER"]');
        
        if (dailyCharterTab) {
            // Set state
            this.state.packageType = 'DAILY_CHARTER';
            
            // Add selected class (it should already have it from HTML)
            dailyCharterTab.classList.add('selected');
            
            // Update form for this package
            this.updateFormForPackage('DAILY_CHARTER');
        }
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

    updateDatePickerLanguage() {
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        
        if (startDate && !startDate.value) {
            startDate.placeholder = this.currentLang === 'it' ? 'Seleziona data' : 'Select date';
        }
        
        if (endDate && !endDate.value) {
            if (!this.state.startDate) {
                endDate.placeholder = this.currentLang === 'it' ? 'Prima seleziona data inizio' : 'Select start date first';
            } else {
                endDate.placeholder = this.currentLang === 'it' ? 'Seleziona data' : 'Select date';
            }
        }
    }

    // Date Pickers
    initDatePickers() {
        const startDate = document.getElementById('startDate');
        const endDate = document.getElementById('endDate');
        
        // Set min date to today
        const today = new Date().toISOString().split('T')[0];
        if (startDate) startDate.min = today;
        if (endDate) endDate.min = today;
        
        // Convert date inputs to text inputs to prevent native date picker
        if (startDate) {
            startDate.type = 'text';
            startDate.placeholder = this.currentLang === 'it' ? 'Seleziona data' : 'Select date';
            startDate.readOnly = true;
            startDate.style.cursor = 'pointer';
        }
        if (endDate) {
            endDate.type = 'text';
            endDate.placeholder = this.currentLang === 'it' ? 'Prima seleziona data inizio' : 'Select start date first';
            endDate.readOnly = true;
            endDate.style.cursor = 'pointer';
            endDate.style.opacity = '0.6';
        }

        startDate?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showBlockedDatesCalendar('startDate');
        });
        
        startDate?.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            
            // Check if date is blocked
            if (this.isDateBlocked(selectedDate)) {
                showMessage(this.currentLang === 'it' ? 
                    'Data non disponibile. Scegli un\'altra data.' : 
                    'Date not available. Please choose another date.', 'error');
                e.target.value = '';
                this.state.startDate = null;
                return;
            }
            
            this.state.startDate = selectedDate;
            
            // Reset end date when start date changes
            this.state.endDate = null;
            endDate.value = '';
            
            // Enable end date visually
            endDate.style.opacity = '1';
            endDate.placeholder = this.currentLang === 'it' ? 'Seleziona data' : 'Select date';
            
            this.updateDateConstraints(this.state.packageType);
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
            this.validateDateRange();
        });

        endDate?.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Only allow end date selection if start date is set
            if (!this.state.startDate) {
                showMessage(
                    this.currentLang === 'it' ? 
                    'Seleziona prima la data di inizio' : 
                    'Please select start date first', 
                    'warning'
                );
                return;
            }
            
            this.showBlockedDatesCalendar('endDate');
        });
        
        endDate?.addEventListener('change', (e) => {
            const selectedDate = e.target.value;
            
            // Check if date is blocked
            if (this.isDateBlocked(selectedDate)) {
                showMessage(this.currentLang === 'it' ? 
                    'Data non disponibile. Scegli un\'altra data.' : 
                    'Date not available. Please choose another date.', 'error');
                e.target.value = '';
                this.state.endDate = null;
                return;
            }
            
            this.state.endDate = selectedDate;
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
            this.validateDateRange();
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
    
    getSeasonalPrice(date) {
        // Use default seasonal prices if available from API
        if (this.defaultPrices) {
            const month = date.getMonth() + 1; // 1-12
            
            // High season: June-August (6-8)
            if (month >= 6 && month <= 8) {
                return this.defaultPrices.high_season || 800;
            }
            // Mid season: May, September (5, 9)
            else if (month === 5 || month === 9) {
                return this.defaultPrices.mid_season || 700;
            }
            // Low season: October-April (10-4)
            else {
                return this.defaultPrices.low_season || 600;
            }
        }
        
        // Final fallback
        return 700;
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
            { id: 1, name_it: 'Servizio biancheria letto', name_en: 'Bed Linen Service', pricing_type: 'PER_PERSON', price: 20 },
            { id: 2, name_it: 'Imbarco/sbarco porto di Salivoli (LI)', name_en: 'Embarkation/Disembarkation Salivoli Port', pricing_type: 'PER_TRIP', price: 150 },
            { id: 3, name_it: 'Tender', name_en: 'Tender', pricing_type: 'FLAT_RATE', price: 50 },
            { id: 4, name_it: 'Fuoribordo tender (compreso carburante)', name_en: 'Tender Outboard Motor (fuel included)', pricing_type: 'FLAT_RATE', price: 70 },
            { id: 5, name_it: 'Servizio pranzo a bordo', name_en: 'Onboard Lunch Service', pricing_type: 'PER_PERSON', price: 30 },
            { id: 6, name_it: 'Servizio aperitivo a bordo', name_en: 'Onboard Aperitif Service', pricing_type: 'PER_PERSON', price: 15 },
            { id: 7, name_it: 'Pernottamento extra in porto – checkout h. 9.00', name_en: 'Extra Night in Port – checkout 9.00', pricing_type: 'FLAT_RATE', price: 150 },
            { id: 8, name_it: 'Pernottamento extra in rada – sbarco h. 9.00', name_en: 'Extra Night at Anchor – disembark 9.00', pricing_type: 'FLAT_RATE', price: 300 },
            { id: 9, name_it: 'Richieste speciali', name_en: 'Special Requests', pricing_type: 'CUSTOM', price: 0 }
        ];

        this.renderExtras(mockExtras);
    }

    renderExtras(extras) {
        const container = document.getElementById('extrasList');
        if (!container) return;

        // Store currently selected extras IDs and special request texts
        const selectedExtras = this.state.extras.map(e => e.id);
        const specialRequestTexts = {};
        this.state.extras.forEach(e => {
            if (e.specialRequestText) {
                specialRequestTexts[e.id] = e.specialRequestText;
            }
        });

        container.innerHTML = '';
        
        extras.forEach(extra => {
            const div = document.createElement('div');
            div.className = 'extra-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `extra-${extra.id}`;
            checkbox.value = extra.id;
            
            // Restore checked state
            if (selectedExtras.includes(extra.id)) {
                checkbox.checked = true;
            }
            
            const label = document.createElement('label');
            label.htmlFor = `extra-${extra.id}`;
            
            const lang = i18n?.getCurrentLanguage() || 'it';
            const name = lang === 'it' ? extra.name_it : extra.name_en;
            
            let priceText = '';
            if (extra.pricing_type === 'CUSTOM') {
                priceText = lang === 'it' ? 'a consuntivo' : 'upon request';
            } else {
                priceText = `€${extra.price}`;
                if (extra.pricing_type === 'PER_DAY') priceText += '/giorno';
                if (extra.pricing_type === 'PER_PERSON') priceText += '/persona';
                if (extra.pricing_type === 'PER_TRIP') priceText += lang === 'it' ? ' a tratta' : ' per trip';
            }
            
            label.innerHTML = `${name} <span class="extra-price">${priceText}</span>`;
            
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    // Check if already in state (when re-rendering for language change)
                    const existingExtra = this.state.extras.find(e => e.id === extra.id);
                    if (!existingExtra) {
                        // For special requests, we'll store the text later
                        const extraData = {...extra};
                        if (extra.pricing_type === 'CUSTOM') {
                            extraData.specialRequestText = specialRequestTexts[extra.id] || ''; // Restore text if exists
                        }
                        this.state.extras.push(extraData);
                    } else {
                        // Update the name for the new language
                        existingExtra.name_it = extra.name_it;
                        existingExtra.name_en = extra.name_en;
                    }
                } else {
                    this.state.extras = this.state.extras.filter(e => e.id !== extra.id);
                }
                this.calculatePrice();
            });
            
            div.appendChild(checkbox);
            div.appendChild(label);
            
            // Add textarea for special requests
            if (extra.pricing_type === 'CUSTOM') {
                const textarea = document.createElement('textarea');
                textarea.id = `special-request-${extra.id}`;
                textarea.className = 'special-request-textarea';
                textarea.placeholder = lang === 'it' ? 'Descrivi la tua richiesta speciale...' : 'Describe your special request...';
                textarea.rows = 1;
                
                // Restore visibility and value
                if (selectedExtras.includes(extra.id)) {
                    textarea.style.display = 'block';
                    if (specialRequestTexts[extra.id]) {
                        textarea.value = specialRequestTexts[extra.id];
                    }
                } else {
                    textarea.style.display = 'none';
                }
                
                // Update special request text when user types
                textarea.addEventListener('input', () => {
                    const extraInState = this.state.extras.find(e => e.id === extra.id);
                    if (extraInState) {
                        extraInState.specialRequestText = textarea.value;
                    }
                });
                
                checkbox.addEventListener('change', () => {
                    textarea.style.display = checkbox.checked ? 'block' : 'none';
                    if (!checkbox.checked) {
                        textarea.value = '';
                    }
                });
                
                div.appendChild(textarea);
            }
            
            container.appendChild(div);
        });
    }

    initExtras() {
        // Extras initialization is handled by loadExtras
    }

    // Availability
    async loadAvailability() {
        try {
            const response = await fetch('/static/bizzosa/api/availability.php');
            if (!response.ok) {
                console.error('Failed to load availability');
                return;
            }
            
            const data = await response.json();
            
            if (data.success) {
                // Store blocked dates
                if (data.data.blocked_dates) {
                    this.blockedDates = data.data.blocked_dates;
                    this.updateDatePickersWithBlockedDates();
                }
                
                // Store daily prices map for price calculation
                if (data.data.daily_prices) {
                    this.dailyPricesMap = data.data.daily_prices;
                }
                
                // Store default prices as fallback
                if (data.data.default_prices) {
                    this.defaultPrices = data.data.default_prices;
                }
            }
        } catch (error) {
            console.error('Error loading availability:', error);
            // Continue without blocking - dates will all be available
        }
    }
    
    updateDatePickersWithBlockedDates() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (!startDateInput || !endDateInput) return;
        
        // Store blocked dates for validation
        this.blockedDatesSet = new Set(this.blockedDates || []);
        
        // Create a visual calendar overlay showing blocked dates
        this.addBlockedDatesDisplay();
        
        // Add data attributes for CSS styling (limited with native date input)
        startDateInput.setAttribute('data-blocked-dates', JSON.stringify(this.blockedDates || []));
        endDateInput.setAttribute('data-blocked-dates', JSON.stringify(this.blockedDates || []));
    }
    
    addBlockedDatesDisplay() {
        // Add a small info text showing number of blocked dates in the next 30 days
        const dateContainer = document.querySelector('.date-inputs');
        if (!dateContainer) return;
        
        // Remove existing info if any
        const existingInfo = document.getElementById('blocked-dates-info');
        if (existingInfo) existingInfo.remove();
        
        // Count blocked dates in next 30 days
        const today = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);
        
        let blockedInNextMonth = 0;
        if (this.blockedDatesSet) {
            this.blockedDatesSet.forEach(dateStr => {
                const date = new Date(dateStr);
                if (date >= today && date <= thirtyDaysFromNow) {
                    blockedInNextMonth++;
                }
            });
        }
        
        if (blockedInNextMonth > 0) {
            const info = document.createElement('div');
            info.id = 'blocked-dates-info';
            info.className = 'blocked-dates-info';
            info.innerHTML = `
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i>
                    ${this.currentLang === 'it' ? 
                        `${blockedInNextMonth} date non disponibili nei prossimi 30 giorni` : 
                        `${blockedInNextMonth} dates unavailable in the next 30 days`}
                </small>
            `;
            dateContainer.appendChild(info);
        }
    }
    
    isDateBlocked(date) {
        if (!this.blockedDatesSet) return false;
        return this.blockedDatesSet.has(date);
    }
    
    isAnyDateInRangeBlocked(startDate, endDate) {
        if (!this.blockedDatesSet || !startDate || !endDate) return false;
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        const current = new Date(start);
        
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            if (this.blockedDatesSet.has(dateStr)) {
                return true;
            }
            current.setDate(current.getDate() + 1);
        }
        
        return false;
    }
    
    isDateRangeAvailable(startDate, endDate) {
        if (!this.blockedDatesSet || !startDate || !endDate) return true;
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        const current = new Date(start);
        
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            if (this.blockedDatesSet.has(dateStr)) {
                return false;
            }
            current.setDate(current.getDate() + 1);
        }
        
        return true;
    }
    
    validateDateRange() {
        if (!this.state.startDate || !this.state.endDate) return true;
        
        if (!this.isDateRangeAvailable(this.state.startDate, this.state.endDate)) {
            showMessage(
                this.currentLang === 'it' ? 
                'Alcune date nel periodo selezionato non sono disponibili.' : 
                'Some dates in the selected period are not available.', 
                'warning'
            );
            
            // Find and display the blocked dates in the range
            const blockedInRange = this.getBlockedDatesInRange(this.state.startDate, this.state.endDate);
            if (blockedInRange.length > 0) {
                const datesList = blockedInRange.join(', ');
                showMessage(
                    this.currentLang === 'it' ? 
                    `Date non disponibili: ${datesList}` : 
                    `Unavailable dates: ${datesList}`, 
                    'info'
                );
            }
            
            return false;
        }
        
        return true;
    }
    
    getBlockedDatesInRange(startDate, endDate) {
        if (!this.blockedDatesSet || !startDate || !endDate) return [];
        
        const blocked = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const current = new Date(start);
        
        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            if (this.blockedDatesSet.has(dateStr)) {
                blocked.push(dateStr);
            }
            current.setDate(current.getDate() + 1);
        }
        
        return blocked;
    }
    
    showBlockedDatesCalendar(inputId, monthOffset = 0) {
        // Remove existing calendar if any
        this.hideBlockedDatesCalendar();
        
        const input = document.getElementById(inputId);
        if (!input) return;
        
        // Store which input is active
        this.activeCalendarInput = inputId;
        this.currentMonthOffset = monthOffset;
        
        // Create mini calendar showing next 2 months with blocked dates highlighted
        const calendar = document.createElement('div');
        calendar.id = 'blocked-dates-calendar';
        calendar.className = 'blocked-dates-calendar';
        
        const today = new Date();
        const monthsToShow = window.innerWidth <= 768 ? 1 : 2; // Show 1 month on mobile
        
        // Calculate valid date range for end date based on package
        let minEndDate = null;
        let maxEndDate = null;
        if (inputId === 'endDate' && this.state.packageType && this.state.startDate) {
            const pkg = this.packages[this.state.packageType];
            const startDate = new Date(this.state.startDate);
            minEndDate = new Date(startDate);
            maxEndDate = new Date(startDate);
            minEndDate.setDate(minEndDate.getDate() + pkg.duration.min - 1);
            maxEndDate.setDate(maxEndDate.getDate() + pkg.duration.max - 1);
        }
        
        let calendarHTML = `
            <div class="calendar-header">
                <span class="calendar-title">${this.currentLang === 'it' ? 'Seleziona data' : 'Select date'}</span>
                <button class="calendar-close">&times;</button>
            </div>
            <div class="calendar-nav">
                <button class="calendar-nav-prev" ${monthOffset === 0 ? 'disabled' : ''}>&lt;</button>
                <span class="calendar-nav-current"></span>
                <button class="calendar-nav-next">&gt;</button>
            </div>
        `;
        
        // Show package constraints info for end date
        if (inputId === 'endDate' && this.state.packageType && this.state.startDate) {
            const pkg = this.packages[this.state.packageType];
            calendarHTML += `
                <div class="calendar-info">
                    ${this.currentLang === 'it' ? 
                        `${pkg.name}: ${pkg.duration.min} - ${pkg.duration.max} giorni` : 
                        `${pkg.name}: ${pkg.duration.min} - ${pkg.duration.max} days`}
                </div>
            `;
        }
        
        calendarHTML += '<div class="calendar-months">';
        
        // Store month names for navigation display
        let monthNames = [];
        
        for (let m = 0; m < monthsToShow; m++) {
            const monthDate = new Date(today.getFullYear(), today.getMonth() + monthOffset + m, 1);
            const monthName = monthDate.toLocaleDateString(this.currentLang, { month: 'long', year: 'numeric' });
            monthNames.push(monthName);
            
            calendarHTML += `<div class="calendar-month">`;
            calendarHTML += `<div class="calendar-month-header">${monthName}</div>`;
            calendarHTML += `<div class="calendar-grid">`;
            
            // Add day headers
            const dayHeaders = this.currentLang === 'it' ? 
                ['L', 'M', 'M', 'G', 'V', 'S', 'D'] : 
                ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
            dayHeaders.forEach(day => {
                calendarHTML += `<div class="calendar-day-header">${day}</div>`;
            });
            
            // Get first day of month and add empty cells for alignment
            const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
            const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
            
            for (let i = 0; i < startingDayOfWeek; i++) {
                calendarHTML += `<div class="calendar-day empty"></div>`;
            }
            
            // Add days of the month
            const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(dateStr);
                const isBlocked = this.blockedDatesSet && this.blockedDatesSet.has(dateStr);
                const isPast = dateObj < new Date(today.toISOString().split('T')[0]);
                
                let isSelectable = !isBlocked && !isPast;
                let isOutOfRange = false;
                
                // For end date, check if it's within the valid range based on package
                if (inputId === 'endDate' && minEndDate && maxEndDate) {
                    if (dateObj < minEndDate || dateObj > maxEndDate) {
                        isSelectable = false;
                        isOutOfRange = true;
                    }
                }
                
                // For start date, if package is selected, check minimum availability
                if (inputId === 'startDate' && this.state.packageType) {
                    const pkg = this.packages[this.state.packageType];
                    // Check if minimum duration is available from this date
                    if (!isPast && !isBlocked) {
                        const testEndDate = new Date(dateStr);
                        testEndDate.setDate(testEndDate.getDate() + pkg.duration.min - 1);
                        // Check if any date in the minimum range is blocked
                        const rangeBlocked = this.isAnyDateInRangeBlocked(dateStr, testEndDate.toISOString().split('T')[0]);
                        if (rangeBlocked) {
                            isSelectable = false;
                            isOutOfRange = true;
                        }
                    }
                }
                
                let className = 'calendar-day';
                if (isBlocked) className += ' blocked';
                if (isPast) className += ' past';
                if (isOutOfRange) className += ' out-of-range';
                if (dateStr === this.state.startDate || dateStr === this.state.endDate) className += ' selected';
                
                calendarHTML += `<div class="${className}" data-date="${dateStr}" data-selectable="${isSelectable}">${day}</div>`;
            }
            
            calendarHTML += `</div></div>`;
        }
        
        calendarHTML += '</div>';
        
        calendar.innerHTML = calendarHTML;
        
        // Position the calendar
        if (window.innerWidth <= 768) {
            // Mobile: Fixed position covering most of screen
            calendar.style.position = 'fixed';
            calendar.style.top = '50%';
            calendar.style.left = '50%';
            calendar.style.transform = 'translate(-50%, -50%)';
            calendar.style.width = '90vw';
            calendar.style.maxHeight = '80vh';
            calendar.style.overflowY = 'auto';
            
            // Add overlay
            const overlay = document.createElement('div');
            overlay.id = 'calendar-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.right = '0';
            overlay.style.bottom = '0';
            overlay.style.background = 'rgba(0,0,0,0.5)';
            overlay.style.zIndex = '999';
            overlay.addEventListener('click', () => this.hideBlockedDatesCalendar());
            document.body.appendChild(overlay);
        } else {
            // Desktop: Position below input
            const rect = input.getBoundingClientRect();
            calendar.style.position = 'absolute';
            calendar.style.top = (rect.bottom + window.scrollY + 5) + 'px';
            calendar.style.left = rect.left + 'px';
        }
        calendar.style.zIndex = '1000';
        
        document.body.appendChild(calendar);
        
        // Update navigation current month display
        const navCurrent = calendar.querySelector('.calendar-nav-current');
        if (navCurrent) {
            navCurrent.textContent = monthNames.join(' - ');
        }
        
        // Add event listeners
        calendar.querySelector('.calendar-close')?.addEventListener('click', () => {
            this.hideBlockedDatesCalendar();
        });
        
        // Add navigation event listeners
        calendar.querySelector('.calendar-nav-prev')?.addEventListener('click', () => {
            if (monthOffset > 0) {
                this.showBlockedDatesCalendar(inputId, monthOffset - 1);
            }
        });
        
        calendar.querySelector('.calendar-nav-next')?.addEventListener('click', () => {
            // Allow up to 12 months in the future
            if (monthOffset < 11) {
                this.showBlockedDatesCalendar(inputId, monthOffset + 1);
            }
        });
        
        // Add click handlers to selectable dates
        calendar.querySelectorAll('.calendar-day[data-selectable="true"]').forEach(day => {
            day.addEventListener('click', () => {
                this.selectDate(day.dataset.date);
            });
        });
    }
    
    hideBlockedDatesCalendar() {
        const calendar = document.getElementById('blocked-dates-calendar');
        if (calendar) {
            calendar.remove();
        }
        const overlay = document.getElementById('calendar-overlay');
        if (overlay) {
            overlay.remove();
        }
    }
    
    selectDate(dateStr) {
        if (!this.activeCalendarInput) return;
        
        const input = document.getElementById(this.activeCalendarInput);
        if (!input) return;
        
        // Hide calendar immediately after selection
        this.hideBlockedDatesCalendar();
        
        // Format date for display
        const date = new Date(dateStr);
        const formattedDate = date.toLocaleDateString(this.currentLang, { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        });
        
        // Set the value
        input.value = formattedDate;
        input.setAttribute('data-value', dateStr);
        
        // Update state based on which input
        if (this.activeCalendarInput === 'startDate') {
            // Check if start date is changing
            const isChanging = this.state.startDate && this.state.startDate !== dateStr;
            
            this.state.startDate = dateStr;
            
            // Reset end date if start date changed
            if (isChanging && this.state.endDate) {
                this.state.endDate = null;
                const endDateInput = document.getElementById('endDate');
                if (endDateInput) {
                    endDateInput.value = '';
                }
            }
            
            // Enable end date visually
            const endDateInput = document.getElementById('endDate');
            if (endDateInput) {
                endDateInput.style.opacity = '1';
                endDateInput.placeholder = this.currentLang === 'it' ? 'Seleziona data' : 'Select date';
            }
            
            this.updateDateConstraints(this.state.packageType);
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
            this.validateDateRange();
        } else if (this.activeCalendarInput === 'endDate') {
            this.state.endDate = dateStr;
            this.calculateDuration();
            this.updateAvailableDestinations();
            this.calculatePrice();
            this.validateDateRange();
        }
    }

    // Price Calculation
    calculatePrice() {
        if (!this.state.packageType || !this.state.startDate || !this.state.endDate) {
            this.updatePriceDisplay(0, 0, 0);
            return;
        }

        const days = this.calculateDuration();
        
        // Calculate base price using actual daily prices from API
        let basePrice = 0;
        
        if (this.dailyPricesMap && Object.keys(this.dailyPricesMap).length > 0) {
            // Use actual daily prices from database
            const start = new Date(this.state.startDate);
            const end = new Date(this.state.endDate);
            const current = new Date(start);
            
            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0];
                if (this.dailyPricesMap[dateStr]) {
                    // Use specific price for this date
                    basePrice += parseFloat(this.dailyPricesMap[dateStr]);
                } else {
                    // Fall back to seasonal default if no specific price
                    basePrice += this.getSeasonalPrice(current);
                }
                current.setDate(current.getDate() + 1);
            }
            
            // Apply weekly charter discount if applicable (for API prices)
            if (this.state.packageType === 'WEEKLY_CHARTER') {
                basePrice = basePrice * 0.9; // 10% discount
            }
        } else {
            // Fallback to default pricing if no API data
            const defaultPrices = {
                DAILY_CHARTER: 700,
                WEEKLY_CHARTER: 600
            };
            
            basePrice = (defaultPrices[this.state.packageType] || 700) * days;
            
            // Apply weekly charter discount if applicable
            if (this.state.packageType === 'WEEKLY_CHARTER') {
                basePrice = basePrice * 0.9; // 10% discount
            }
        }

        // Extras are only for information, not added to price
        // Store extras for invoice purposes but don't calculate their cost
        
        const totalPrice = basePrice; // Total is just the base price
        
        this.state.basePrice = basePrice;
        this.state.extrasTotal = 0; // Extras don't have a price impact
        this.state.totalPrice = totalPrice;
        
        this.updatePriceDisplay(basePrice, 0, totalPrice);
    }

    updatePriceDisplay(base, extras, total) {
        const baseEl = document.getElementById('basePrice');
        
        if (baseEl) baseEl.textContent = `€ ${base.toFixed(2)}`;
        // No longer showing extras or separate total
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
        const lang = i18n?.getCurrentLanguage() || 'it';
        
        if (!this.state.packageType) {
            errors.push(lang === 'it' ? 'Seleziona un tipo di charter' : 'Select a charter type');
        }
        
        if (!this.state.startDate || !this.state.endDate) {
            errors.push(lang === 'it' ? 'Seleziona le date' : 'Select dates');
        }
        
        if (!this.state.destination) {
            errors.push(lang === 'it' ? 'Seleziona una destinazione' : 'Select a destination');
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
        
        // Check if dates are available
        if (!this.isDateRangeAvailable(this.state.startDate, this.state.endDate)) {
            showMessage(
                this.currentLang === 'it' ? 
                'Le date selezionate non sono disponibili. Scegli altre date.' : 
                'Selected dates are not available. Please choose different dates.', 
                'error'
            );
            
            // Show which dates are blocked
            const blockedInRange = this.getBlockedDatesInRange(this.state.startDate, this.state.endDate);
            if (blockedInRange.length > 0) {
                const datesList = blockedInRange.join(', ');
                showMessage(
                    this.currentLang === 'it' ? 
                    `Date già prenotate: ${datesList}` : 
                    `Already booked: ${datesList}`, 
                    'warning'
                );
            }
            
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
        const submitButton = document.getElementById('submitEmail');
        const originalText = submitButton?.textContent;
        
        try {
            // Show loading state
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = this.currentLang === 'it' ? 'Invio...' : 'Sending...';
                submitButton.classList.add('loading');
            }
            
            // Save booking with email
            const data = await this.saveBookingToDatabase('email', email);

            if (data.success) {
                showMessage(i18n?.formatMessage('messages.booking_sent') || 'Richiesta inviata con successo!', 'success');
                
                // Show booking confirmation details
                if (data.data.id) {
                    const details = `ID prenotazione: ${data.data.id}`;
                    showMessage(details, 'info');
                }
                
                // Reset form after successful submission
                setTimeout(() => {
                    this.resetForm();
                    document.getElementById('customerEmail').value = '';
                    // Hide booking details section
                    const detailsSection = document.getElementById('booking-details');
                    if (detailsSection) detailsSection.style.display = 'none';
                }, 2000);
            } else {
                throw new Error(data.message || 'Errore durante l\'invio');
            }

        } catch (error) {
            console.error('Booking request error:', error);
            showMessage(
                error.message || 
                (this.currentLang === 'it' ? 'Errore durante l\'invio. Riprova.' : 'Error sending request. Please try again.'), 
                'error'
            );
        } finally {
            // Restore button state
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                submitButton.classList.remove('loading');
            }
        }
    }

    async sendWhatsAppMessage() {
        const whatsappBtn = document.getElementById('requestWhatsApp');
        const originalText = whatsappBtn?.textContent;
        
        try {
            // Show loading state
            if (whatsappBtn) {
                whatsappBtn.disabled = true;
                whatsappBtn.textContent = this.currentLang === 'it' ? 'Salvando...' : 'Saving...';
                whatsappBtn.classList.add('loading');
            }
            
            // First save to database
            const data = await this.saveBookingToDatabase('whatsapp');
            let details =""
            // Show booking confirmation details
            if (data.success && data.data.id) {
                details= `ID prenotazione: ${data.data.id}`;
                showMessage(details, 'info');
            }
            
            // Then send WhatsApp message
            const pkg = this.packages[this.state.packageType];
            const duration = this.calculateDuration();
            
            let message = `Richiesta Preventivo Sailing Bizzosa\n\n`;
            message += details ? `${details}\n\n` : '';
            message += `Pacchetto: ${pkg.name}\n`;
            message += `Date: ${this.state.startDate} - ${this.state.endDate} (${duration} giorni)\n`;
            message += `Ospiti: ${this.state.guests}\n`;
            message += `Destinazione: ${this.destinationNames[this.state.destination]}\n`;
            
            if (this.state.extras.length > 0) {
                message += `Extra:\n`;
                this.state.extras.forEach(e => {
                    if (e.pricing_type === 'CUSTOM' && e.specialRequestText) {
                        message += `- ${e.name_it}: ${e.specialRequestText}\n`;
                    } else {
                        message += `- ${e.name_it}\n`;
                    }
                });
            }
            
            message += `\nPrezzo stimato: €${this.state.totalPrice.toFixed(2)}`;
            
            const whatsappNumber = '+393934830048'; 
            const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
            
            window.open(url, '_blank');
            
            showMessage(i18n?.formatMessage('messages.booking_sent') || 'Richiesta salvata e WhatsApp aperto!', 'success');
            
            // Reset form after successful submission
            setTimeout(() => {
                this.resetForm();
                const detailsSection = document.getElementById('booking-details');
                if (detailsSection) detailsSection.style.display = 'none';
            }, 2000);
            
        } catch (error) {
            console.error('WhatsApp booking error:', error);
            showMessage(
                error.message || 
                (this.currentLang === 'it' ? 'Errore nel salvare la richiesta' : 'Error saving request'), 
                'error'
            );
        } finally {
            // Restore button state
            if (whatsappBtn) {
                whatsappBtn.disabled = false;
                whatsappBtn.textContent = originalText;
                whatsappBtn.classList.remove('loading');
            }
        }
    }

    async saveBookingToDatabase(source = 'web', customerEmail = '') {
        // Build extras data with names and special request text
        const extrasData = this.state.extras.map(e => {
            if (e.pricing_type === 'CUSTOM' && e.specialRequestText) {
                return {
                    id: e.id,
                    name: e.name_it,
                    special_text: e.specialRequestText,
                    pricing_type: 'CUSTOM'
                };
            }
            return {
                id: e.id,
                name: e.name_it,
                price: e.price,
                pricing_type: e.pricing_type
            };
        });
        
        const bookingData = {
            package_type: this.state.packageType,
            start_date: this.state.startDate,
            end_date: this.state.endDate,
            guests: this.state.guests,
            destination: this.state.destination,
            extras: extrasData,
            customer_email: customerEmail,
            customer_name: '',
            customer_phone: source === 'whatsapp' ? '+393934830048' : '',
            source: source,
            total_price: this.state.totalPrice
        };

        // Use direct PHP file path (more reliable)
        const response = await fetch('/static/bizzosa/api/request_quote.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bookingData)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error('Invalid response from server');
        }
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to save booking');
        }
        
        return data;
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