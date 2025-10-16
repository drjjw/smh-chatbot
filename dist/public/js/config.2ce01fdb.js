// Configuration and constants

// Base URL configuration - auto-detect or use window location
export function getAPIBaseURL() {
    // Get the directory the chatbot is loaded from
    const currentPath = window.location.pathname;
    const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    return window.location.origin + baseDir;
}

export const API_URL = getAPIBaseURL().replace(/\/$/, ''); // Remove trailing slash

// Document configuration
export const docConfig = {
    'smh': {
        title: 'Nephrology Manual',
        subtitle: 'St. Michael\'s Hospital · Interactive search and consultation',
        backLink: 'https://ukidney.com/nephrology-publications/nephrology-manuals/st-michael-s-hospital-nephrology-manual',
        welcomeMessage: 'SMH Housestaff Manual'
    },
    'uhn': {
        title: 'Nephrology Manual',
        subtitle: 'University Health Network · Interactive search and consultation',
        backLink: 'https://ukidney.com/nephrology-publications/nephrology-manuals/university-health-network-nephrology-manual',
        welcomeMessage: 'UHN Nephrology Manual'
    }
};

// Generate a unique session ID for this browser session
export function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


