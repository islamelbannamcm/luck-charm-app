const stripe = Stripe('pk_test_YOUR_STRIPE_PUBLISHABLE_KEY'); // Replace with your Stripe test key from dashboard

document.getElementById('charmForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const birthdate = document.getElementById('birthdate').value;
  const goal = document.getElementById('goal').value;
  const sessionId = 'sess_' + Date.now(); // Simple unique ID

  // Create Stripe Checkout Session
  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, birthdate, goal, sessionId })
  });
  const { sessionId: stripeSessionId } = await response.json();

  // Redirect to Stripe (handles Apple Pay)
  const { error } = await stripe.redirectToCheckout({ sessionId: stripeSessionId });
  if (error) console.error(error);
});

// Handle success (Stripe webhook calls this indirectly via redirect back)
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success')) {
    // Fetch charm from backend using sessionId from URL or localStorage
    const sessionId = localStorage.getItem('sessionId'); // Set this in checkout response if needed
    handlePaymentSuccess(sessionId);
  }
});

async function handlePaymentSuccess(sessionId) {
  const response = await fetch('/api/generateCharm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }) // Backend looks up stored data
  });
  const { downloadUrl, charmText } = await response.json();

  document.getElementById('preview').innerHTML = `<p>${charmText}</p><p>Downloading...</p>`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'my-luck-charm.png';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}