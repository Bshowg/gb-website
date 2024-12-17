console.log("Debugging tools loaded.");

function logError(error) {
    console.error("Error: ", error);
    // Additional error handling logic can be added here
}

window.onerror = function(message, source, lineno, colno, error) {
    logError({
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        error: error
    });
    return true; // Prevents the default browser error handling
};
