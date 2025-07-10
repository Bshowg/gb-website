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
            'economic': '#F97316'
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

    render() {
        const sortedData = [...this.data].sort((a, b) => this.parseDate(a.date) - this.parseDate(b.date));
        
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
                            <div class="timeline-event" data-index="${index}">
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

    setupInteractions() {
        const eventCards = this.container.querySelectorAll('.event-card');
        eventCards.forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('expanded');
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