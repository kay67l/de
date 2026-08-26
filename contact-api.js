// contact-api.js — wires the contact form to /api/contact
// Loaded AFTER app.js. app.js no longer sets a form handler, so no conflict.

(function () {
  const liveForm    = document.getElementById('contactForm');
  const liveSuccess = document.getElementById('formSuccess');
  const liveBtn     = liveForm ? liveForm.querySelector('.submit-btn') : null;

  if (!liveForm || !liveBtn) {
    console.warn('[ARSRC] contactForm or submit button not found on this page.');
    return;
  }

  liveForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    // UI: loading state
    liveBtn.disabled    = true;
    liveBtn.textContent = 'Sending…';

    // Grab fields — adjust selectors here if your HTML uses name="" attributes
    const inputs  = liveForm.querySelectorAll('input[type="text"]');
    const body = {
      name:    inputs[0]?.value || '',
      email:   liveForm.querySelector('input[type="email"]')?.value || '',
      subject: inputs[1]?.value || '',
      message: liveForm.querySelector('textarea')?.value || '',
    };

    try {
      const res  = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      // Success
      liveForm.reset();
      if (data.emailFailed) {
        showError('Message saved, but email notification failed. Please check Resend logs.');
        return;
      }
      showSuccess('✓ Message sent! The council will respond shortly.');

    } catch (err) {
      showError('Network error — please check your connection and try again.');
      console.error('[ARSRC] Contact form fetch error:', err);
    } finally {
      liveBtn.disabled    = false;
      liveBtn.textContent = 'Send Message';
    }
  });

  function showSuccess(msg) {
    if (!liveSuccess) return;
    liveSuccess.textContent = msg;
    liveSuccess.style.cssText = '';  // clear any leftover error styles
    liveSuccess.classList.add('show');
    setTimeout(() => liveSuccess.classList.remove('show'), 6000);
  }

  function showError(msg) {
    if (!liveSuccess) return;
    liveSuccess.textContent = '✗ ' + msg;
    liveSuccess.style.background = 'rgba(220,38,38,0.12)';
    liveSuccess.style.color      = '#fca5a5';
    liveSuccess.style.border     = '1px solid rgba(220,38,38,0.3)';
    liveSuccess.classList.add('show');
    setTimeout(() => {
      liveSuccess.classList.remove('show');
      liveSuccess.style.cssText = '';
    }, 6000);
  }
})();
