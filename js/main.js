'use strict';

/* ============================================================
   HEADER — shadow on scroll
   ============================================================ */
const header = document.getElementById('header');

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ============================================================
   MOBILE NAV — hamburger toggle
   ============================================================ */
const hamburger = document.getElementById('hamburger');
const navLinks   = document.getElementById('nav-links');

function closeNav() {
  navLinks.classList.remove('open');
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  hamburger.setAttribute('aria-label', 'Menu openen');
}

hamburger.addEventListener('click', () => {
  const willOpen = !navLinks.classList.contains('open');
  if (willOpen) {
    navLinks.classList.add('open');
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Menu sluiten');
  } else {
    closeNav();
  }
});

/* close nav when a link is clicked */
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeNav);
});

/* close nav when clicking outside the header */
document.addEventListener('click', (e) => {
  if (!header.contains(e.target)) closeNav();
});

/* ============================================================
   SCROLL-IN ANIMATIONS — Intersection Observer
   ============================================================ */
const fadeEls = document.querySelectorAll('.fade-in');

if (fadeEls.length) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  fadeEls.forEach(el => observer.observe(el));
}

/* ============================================================
   NEWSLETTER FORM — client-side validation & feedback
   ============================================================ */
const form    = document.getElementById('newsletter-form');
const message = document.getElementById('form-message');

if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const input = form.querySelector('input[type="email"]');
    const email = input.value.trim();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!valid) {
      input.style.borderColor = 'var(--clr-accent)';
      input.focus();
      message.textContent = 'Vul een geldig e-mailadres in.';
      message.classList.remove('success');
      return;
    }

    /* success state — replace with a real API call as needed */
    const btn = form.querySelector('.btn');
    input.value     = '';
    input.disabled  = true;
    btn.disabled    = true;
    btn.textContent = 'Aangemeld ✓';
    input.style.borderColor = '';

    message.textContent = 'Bedankt! Je bent aangemeld voor onze nieuwsbrief.';
    message.classList.add('success');
  });

  /* reset border on new input */
  form.querySelector('input[type="email"]').addEventListener('input', function () {
    this.style.borderColor = '';
    if (!message.classList.contains('success')) {
      message.textContent = 'We respecteren jouw privacy. Geen spam, altijd uitschrijven mogelijk.';
    }
  });
}
