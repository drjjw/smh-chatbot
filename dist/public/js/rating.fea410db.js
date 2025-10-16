// Rating submission functionality
import { API_URL } from './config.77794265.js';

// Submit rating for a conversation
export async function submitRating(conversationId, rating, buttonElement) {
    try {
        const response = await fetch(`${API_URL}/api/rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversationId: conversationId,
                rating: rating
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Update button appearance
            buttonElement.classList.add('rated');
            buttonElement.title = 'Thank you for your feedback!';
            buttonElement.disabled = true;

            // Hide the other button
            const ratingButtons = buttonElement.parentElement;
            const buttons = ratingButtons.querySelectorAll('.rating-btn');
            buttons.forEach(btn => {
                if (btn !== buttonElement) {
                    btn.style.display = 'none';
                }
            });

            console.log(`✓ Rating submitted: ${rating} for conversation ${conversationId}`);
        } else {
            console.error('Failed to submit rating:', data.error);
            alert('Failed to submit rating. Please try again.');
        }
    } catch (error) {
        console.error('Error submitting rating:', error);
        alert('Failed to submit rating. Please check your connection and try again.');
    }
}

