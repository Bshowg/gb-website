class TimelineVisualizer {
    constructor(containerId, timelineData) {
        this.container = document.getElementById(containerId);
        this.data = timelineData;
        this.eventTypes = [...new Set(timelineData.map(event => event.event_type))];
        this.colors = {
            'political': '#3B82F6',
            'cultural': '#10B981',
            'architectural': '#F59E0B',
            'military': '#EF4444',
            'religious': '#8B5CF6',
            'economic': '#F97316',
            'natural': '#8B5CF6'
        };
        this.init();
    }

    init() {
        this.render();
        this.setupResponsive();
    }

    parseDate(dateStr) {
        if (dateStr.includes('BC')) {
            return -parseInt(dateStr.replace(/\D/g, ''));
        }
        
        const match = dateStr.match(/(\d{1,4})/);
        return match ? parseInt(match[1]) : 0;
    }

    formatDate(dateStr) {
        if (dateStr.includes('BC')) {
            return dateStr;
        }
        return dateStr.includes('AD') ? dateStr : dateStr + ' d.C.';
    }

    getEventColor(eventType) {
        return this.colors[eventType.toLowerCase()] || '#6B7280';
    }

    calculateSpacing(sortedData) {
        const dates = sortedData.map(event => this.parseDate(event.date));
        const minDate = Math.min(...dates);
        const maxDate = Math.max(...dates);
        const totalRange = maxDate - minDate;
        
        // Base spacing parameters
        const minSpacing = 2; // minimum rem spacing
        const maxSpacing = 20; // maximum rem spacing
        const baseSpacing = 3; // default spacing in rem
        
        return sortedData.map((event, index) => {
            if (index === 0) return baseSpacing;
            
            const currentDate = this.parseDate(event.date);
            const previousDate = this.parseDate(sortedData[index - 1].date);
            const yearDiff = Math.abs(currentDate - previousDate);
            
            // Calculate proportional spacing
            let spacing;
            if (totalRange > 0) {
                const proportion = yearDiff / (totalRange / sortedData.length);
                spacing = baseSpacing * Math.max(0.5, Math.min(3, proportion));
            } else {
                spacing = baseSpacing;
            }
            
            return Math.max(minSpacing, Math.min(maxSpacing, spacing));
        });
    }

    render() {
        const sortedData = [...this.data].sort((a, b) => this.parseDate(a.date) - this.parseDate(b.date));
        const spacings = this.calculateSpacing(sortedData);
        
        this.container.innerHTML = `
            <div class="timeline-container">
                <div class="timeline-legend">
                    ${this.eventTypes.map(type => `
                        <div class="legend-item">
                            <span class="legend-color" style="background-color: ${this.getEventColor(type)}"></span>
                            <span class="legend-label">${type.charAt(0).toUpperCase() + type.slice(1)}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="timeline-wrapper">
                    <div class="timeline-line"></div>
                    <div class="timeline-events">
                        ${sortedData.map((event, index) => `
                            <div class="timeline-event" data-index="${index}" style="margin-top: ${spacings[index]}rem;">
                                <div class="event-marker" style="background-color: ${this.getEventColor(event.event_type)}"></div>
                                <div class="event-content ${index % 2 === 0 ? 'event-top' : 'event-bottom'}">
                                    <div class="event-card">
                                        <div class="event-date">${this.formatDate(event.date)}</div>
                                        <div class="event-name">${event.name}</div>
                                        <div class="event-description">${event.description}</div>
                                        <div class="event-type">${event.event_type}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        this.setupInteractions();
    }

    async fetchWikipediaYear(year) {
        try {
            const yearStr = year < 0 ? `${Math.abs(year)} a.C.` : `${year}`;
            const url = `https://it.wikipedia.org/w/api.php?action=parse&page=${yearStr}&format=json&prop=wikitext&origin=*`;
            
            console.log('Fetching Wikipedia for year:', yearStr);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Wikipedia API response:', data);
            
            if (data.error) {
                console.log('Wikipedia API error:', data.error);
                throw new Error(data.error.info);
            }

            const wikitext = data.parse?.wikitext?.['*'];
            if (!wikitext) {
                console.log('No wikitext found');
                return null;
            }

            console.log('Wikitext sample (first 500 chars):', wikitext.substring(0, 500));
            const events = this.parseWikipediaEvents(wikitext);
            
            return {
                title: data.parse.title,
                events: events.slice(0, 10),
                url: `https://it.wikipedia.org/wiki/${yearStr}`
            };
        } catch (error) {
            console.error('Error fetching Wikipedia data:', error);
            return null;
        }
    }

    parseWikipediaEvents(wikitext) {
        const events = [];
        
        // Look for Eventi section
        const eventSectionRegex = /==\s*Eventi\s*==([\s\S]*?)(?===|$)/i;
        const eventSection = wikitext.match(eventSectionRegex);
        
        console.log('Looking for Eventi section...');
        
        if (eventSection) {
            console.log('✓ Found Eventi section!');
            const content = eventSection[1];
            console.log('Eventi section content (first 300 chars):', content.substring(0, 300));
            
            const lines = content.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                // Look for lines starting with * (bullet points)
                if (line.startsWith('*')) {
                    let eventText = line.replace(/^\*+\s*/, '').trim(); // Remove all leading asterisks
                    
                    console.log(`Line ${i}: Raw event:`, eventText);
                    
                    // Clean up wikitext formatting step by step
                    eventText = eventText
                        .replace(/\[\[([^\|\]]+)\|([^\]]+)\]\]/g, '$2') // [[link|text]] -> text
                        .replace(/\[\[([^\]]+)\]\]/g, '$1') // [[link]] -> link
                        .replace(/'''([^']+)'''/g, '$1') // '''bold''' -> bold
                        .replace(/''([^']+)''/g, '$1') // ''italic'' -> italic
                        .replace(/<[^>]+>/g, '') // remove HTML tags
                        .replace(/{{[^}]+}}/g, '') // remove templates
                        .replace(/&[a-zA-Z0-9]+;/g, '') // remove HTML entities
                        .trim();
                    
                    console.log(`Line ${i}: Cleaned event:`, eventText);
                    
                    // Add if it's a valid event
                    if (eventText && 
                        eventText.length > 10 && 
                        !eventText.includes('{{') && 
                        !eventText.includes('}}') &&
                        !eventText.startsWith('|') &&
                        !eventText.includes('[[Categoria:')) {
                        
                        events.push(eventText);
                        console.log(`✓ Added event ${events.length}:`, eventText);
                    } else {
                        console.log(`✗ Rejected event (length: ${eventText.length}):`, eventText);
                    }
                }
            }
        } else {
            console.log('✗ No Eventi section found');
            // Show available sections for debugging
            const sections = wikitext.match(/==\s*[^=]+\s*==/g);
            console.log('Available sections:', sections);
        }
        
        console.log(`Total events found: ${events.length}`);
        return events;
    }

    showWikipediaEvents(card, year, wikipediaData) {
        // Remove any existing Wikipedia content
        const existingWiki = card.querySelector('.wikipedia-events');
        if (existingWiki) {
            existingWiki.remove();
            return;
        }

        const wikiContainer = document.createElement('div');
        wikiContainer.className = 'wikipedia-events';
        
        if (wikipediaData && wikipediaData.events && wikipediaData.events.length > 0) {
            wikiContainer.innerHTML = `
                <div class="wiki-header">
                    <h4>Altri eventi del ${year < 0 ? Math.abs(year) + ' a.C.' : year + ' d.C.'}</h4>
                    <button class="wiki-close">×</button>
                </div>
                <div class="wiki-content">
                    <ul class="wiki-events-list">
                        ${wikipediaData.events.map(event => `<li class="wiki-event-item">${event}</li>`).join('')}
                    </ul>
                    <a href="${wikipediaData.url}" target="_blank" class="wiki-link">
                        Vedi tutti gli eventi su Wikipedia →
                    </a>
                </div>
            `;
        } else {
            wikiContainer.innerHTML = `
                <div class="wiki-header">
                    <h4>Altri eventi del ${year < 0 ? Math.abs(year) + ' a.C.' : year + ' d.C.'}</h4>
                    <button class="wiki-close">×</button>
                </div>
                <div class="wiki-content">
                    <p class="wiki-error">Nessun evento trovato per questo anno su Wikipedia.</p>
                </div>
            `;
        }

        // Add close button functionality
        const closeBtn = wikiContainer.querySelector('.wiki-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            wikiContainer.remove();
        });

        card.appendChild(wikiContainer);
    }

    setupInteractions() {
        const eventCards = this.container.querySelectorAll('.event-card');
        const sortedData = [...this.data].sort((a, b) => this.parseDate(a.date) - this.parseDate(b.date));
        
        eventCards.forEach((card, index) => {
            card.addEventListener('click', async (e) => {
                // Don't trigger if clicking on Wikipedia content
                if (e.target.closest('.wikipedia-events')) {
                    return;
                }

                const eventData = sortedData[index];
                const year = this.parseDate(eventData.date);
                
                console.log('Clicked event:', eventData.name, 'Year:', year);
                
                // Show loading state
                card.classList.add('loading');
                
                // Fetch Wikipedia data for this year
                const wikipediaData = await this.fetchWikipediaYear(year);
                
                // Remove loading state
                card.classList.remove('loading');
                
                // Show Wikipedia events
                this.showWikipediaEvents(card, year, wikipediaData);
            });
        });
    }

    setupResponsive() {
        const handleResize = () => {
            this.updateLayout();
        };

        window.addEventListener('resize', handleResize);
        this.updateLayout();
    }

    updateLayout() {
        const isMobile = window.innerWidth < 768;
        const events = this.container.querySelectorAll('.timeline-event');
        
        events.forEach((event, index) => {
            const content = event.querySelector('.event-content');
            if (isMobile) {
                content.classList.remove('event-top', 'event-bottom');
                content.classList.add('event-mobile');
            } else {
                content.classList.remove('event-mobile');
                content.classList.add(index % 2 === 0 ? 'event-top' : 'event-bottom');
            }
        });
    }
}