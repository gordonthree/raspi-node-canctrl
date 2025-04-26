document.addEventListener('DOMContentLoaded', () => {
    const display = document.getElementById('display');
    const keypad = document.querySelector('.keypad');

    if (!keypad || !display) {
        console.error('Keypad or display element not found!');
        return;
    }

    keypad.addEventListener('click', (event) => {
        // Only react if a button was clicked directly
        if (event.target.tagName !== 'BUTTON') {
            return;
        }

        const key = event.target.dataset.key; // Get value from data-key attribute

        if (!key) {
            console.warn('Button clicked without data-key attribute:', event.target);
            return;
        }

        console.log(`Key pressed: ${key}`); // Log to console

        if (key === 'clear') {
            display.textContent = ''; // Clear display
        } else if (key === 'enter') {
            // Handle 'Enter' - e.g., send data, validate, etc.
            alert(`Entered: ${display.textContent || 'nothing'}`);
            // You might want to clear the display after enter:
            // display.textContent = '';
        } else {
            // Append digit or symbol to display
            display.textContent += key;
        }
    });
});